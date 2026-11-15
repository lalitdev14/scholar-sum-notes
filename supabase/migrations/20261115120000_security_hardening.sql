-- Security hardening from the November 2026 audit.

-- ---------------------------------------------------------------- H2
-- Old class-wide summaries were readable by every student and are no longer used.
DROP TABLE IF EXISTS public.class_summaries CASCADE;

-- ---------------------------------------------------------------- M7
-- The "faculty" reviewer role is retired: only admins keep the wider read access.
DELETE FROM public.user_roles WHERE role::text = 'faculty';

-- ---------------------------------------------------------------- L1
-- Role helpers only answer about the caller (or the server's service role), so a
-- signed-in user can no longer probe whether other accounts are admins.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (_user_id = auth.uid() OR auth.role() = 'service_role')
     AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_reviewer(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (_user_id = auth.uid() OR auth.role() = 'service_role')
     AND EXISTS (
       SELECT 1 FROM public.user_roles
       WHERE user_id = _user_id AND role::text IN ('admin', 'super_admin')
     )
$$;

-- ---------------------------------------------------------------- M1
-- Students may only edit their own name; the university always comes from the email domain.
REVOKE INSERT, UPDATE ON public.profiles FROM authenticated, anon;
GRANT UPDATE (full_name) ON public.profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_university_id uuid;
BEGIN
  -- Never trust a university sent from the sign-up form: map it from the email domain.
  SELECT d.university_id INTO v_university_id
  FROM public.allowed_email_domains d
  WHERE d.domain = split_part(lower(NEW.email), '@', 2);

  INSERT INTO public.profiles (id, full_name, university_id)
  VALUES (
    NEW.id,
    left(COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)), 120),
    v_university_id
  )
  ON CONFLICT (id) DO UPDATE SET university_id = COALESCE(EXCLUDED.university_id, public.profiles.university_id);

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'student')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Re-align anyone who changed their university to the one their email domain maps to.
UPDATE public.profiles p
SET university_id = d.university_id
FROM auth.users u
JOIN public.allowed_email_domains d ON d.domain = split_part(lower(u.email), '@', 2)
WHERE u.id = p.id AND p.university_id IS DISTINCT FROM d.university_id;

-- ---------------------------------------------------------------- L3
-- Notes, transcripts and handwriting can only be saved for classes the student is enrolled in.
DROP POLICY IF EXISTS notes_own ON public.notes;
CREATE POLICY notes_select_own ON public.notes
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY notes_delete_own ON public.notes
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY notes_insert_enrolled ON public.notes
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.enrollments e WHERE e.class_id = notes.class_id AND e.user_id = auth.uid())
  );
CREATE POLICY notes_update_enrolled ON public.notes
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.enrollments e WHERE e.class_id = notes.class_id AND e.user_id = auth.uid())
  );

DROP POLICY IF EXISTS audio_transcripts_own ON public.audio_transcripts;
CREATE POLICY audio_transcripts_read_own ON public.audio_transcripts
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY audio_transcripts_delete_own ON public.audio_transcripts
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY audio_transcripts_write_enrolled ON public.audio_transcripts
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.enrollments e WHERE e.class_id = audio_transcripts.class_id AND e.user_id = auth.uid())
  );
CREATE POLICY audio_transcripts_update_own ON public.audio_transcripts
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS handwriting_pages_own ON public.handwriting_pages;
CREATE POLICY handwriting_pages_read_own ON public.handwriting_pages
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY handwriting_pages_delete_own ON public.handwriting_pages
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY handwriting_pages_write_enrolled ON public.handwriting_pages
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.enrollments e WHERE e.class_id = handwriting_pages.class_id AND e.user_id = auth.uid())
  );
CREATE POLICY handwriting_pages_update_own ON public.handwriting_pages
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------- M5
-- Handwriting archive: PNG only, max 5 MB. Slides: PDF or PowerPoint only (20 MB already).
UPDATE storage.buckets
SET file_size_limit = 5242880, allowed_mime_types = ARRAY['image/png']
WHERE id = 'handwriting';
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation'
]
WHERE id = 'lecture-slides';

-- ---------------------------------------------------------------- H1
-- Per-user daily limits on AI features, enforced on the server before each AI call.
CREATE TABLE IF NOT EXISTS public.ai_usage (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature text NOT NULL,
  day date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, feature, day)
);
ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.ai_usage TO authenticated;
GRANT ALL ON public.ai_usage TO service_role;
CREATE POLICY ai_usage_select_own ON public.ai_usage
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Returns true and counts one use if the caller is under today's limit for the feature.
CREATE OR REPLACE FUNCTION public.consume_ai_quota(_feature text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_limit integer;
  v_count integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '28000';
  END IF;
  v_limit := CASE _feature
    WHEN 'summary' THEN 20          -- note summaries
    WHEN 'handwriting' THEN 80      -- handwriting pages converted
    WHEN 'slide_overview' THEN 150  -- slide overviews
    WHEN 'audio' THEN 1500          -- ~10-20 s audio chunks (about 5+ hours)
    ELSE 0
  END;
  -- Admins get 5x for testing and support.
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = v_uid AND role::text IN ('admin', 'super_admin')) THEN
    v_limit := v_limit * 5;
  END IF;

  INSERT INTO public.ai_usage AS u (user_id, feature, day, count)
  VALUES (v_uid, _feature, (now() AT TIME ZONE 'utc')::date, 1)
  ON CONFLICT (user_id, feature, day)
  DO UPDATE SET count = u.count + 1
  WHERE u.count < v_limit
  RETURNING u.count INTO v_count;

  RETURN v_count IS NOT NULL AND v_count <= v_limit;
END;
$$;
REVOKE ALL ON FUNCTION public.consume_ai_quota(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_ai_quota(text) TO authenticated;

-- ---------------------------------------------------------------- M6
-- Admin audit log: written by the server (service role) and by triggers; read by admins.
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email text,
  action text NOT NULL,
  target text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS admin_audit_log_created_idx ON public.admin_audit_log (created_at DESC);
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.admin_audit_log TO authenticated;
GRANT ALL ON public.admin_audit_log TO service_role;
CREATE POLICY admin_audit_log_select_admin ON public.admin_audit_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role)
         OR public.has_role(auth.uid(), 'super_admin'::public.app_role));

-- Logs admin actions that happen directly from the browser (announcements, contact inbox).
CREATE OR REPLACE FUNCTION public.log_admin_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row jsonb := to_jsonb(COALESCE(NEW, OLD));
  v_label text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN COALESCE(NEW, OLD); -- server-side changes are logged by the server itself
  END IF;
  v_label := COALESCE(v_row->>'title', v_row->>'email', v_row->>'id');
  INSERT INTO public.admin_audit_log (actor_id, actor_email, action, target, details)
  VALUES (
    auth.uid(),
    (SELECT email FROM auth.users WHERE id = auth.uid()),
    TG_TABLE_NAME || '.' || lower(TG_OP),
    v_label,
    CASE TG_OP
      WHEN 'UPDATE' THEN jsonb_build_object('id', v_row->>'id', 'status', v_row->>'status', 'active', v_row->>'active')
      ELSE jsonb_build_object('id', v_row->>'id')
    END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;
REVOKE ALL ON FUNCTION public.log_admin_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS announcements_audit ON public.announcements;
CREATE TRIGGER announcements_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.log_admin_change();
DROP TRIGGER IF EXISTS contact_messages_audit ON public.contact_messages;
CREATE TRIGGER contact_messages_audit
  AFTER UPDATE OR DELETE ON public.contact_messages
  FOR EACH ROW EXECUTE FUNCTION public.log_admin_change();

-- ---------------------------------------------------------------- L2
-- Second layer behind RLS: anonymous visitors only keep the two privileges they need, and
-- signed-in users lose table-level privileges no feature uses.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
GRANT SELECT ON public.universities TO anon;
GRANT INSERT ON public.contact_messages TO anon;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON ALL TABLES IN SCHEMA public FROM authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLES FROM authenticated;
