-- Contact form messages. Anyone (signed in or not) can send one; only admins can read them.
CREATE TABLE public.contact_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  email text NOT NULL CHECK (char_length(email) <= 320 AND email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  topic text NOT NULL DEFAULT 'general'
    CHECK (topic IN ('general', 'account', 'bug', 'privacy', 'feature', 'other')),
  message text NOT NULL CHECK (char_length(btrim(message)) BETWEEN 10 AND 5000),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'resolved')),
  resolved_at timestamptz
);

CREATE INDEX contact_messages_created_idx ON public.contact_messages (created_at DESC);
CREATE INDEX contact_messages_email_idx ON public.contact_messages (lower(email), created_at DESC);

GRANT INSERT ON public.contact_messages TO anon, authenticated;
GRANT SELECT, UPDATE, DELETE ON public.contact_messages TO authenticated;
GRANT ALL ON public.contact_messages TO service_role;

ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;

-- Senders can only create "new" messages, attributed to themselves (or anonymous).
CREATE POLICY contact_messages_insert ON public.contact_messages
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    status = 'new' AND resolved_at IS NULL
    AND (user_id IS NULL OR user_id = auth.uid())
  );

CREATE POLICY contact_messages_admin_select ON public.contact_messages
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role)
         OR public.has_role(auth.uid(), 'super_admin'::public.app_role));

CREATE POLICY contact_messages_admin_update ON public.contact_messages
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role)
         OR public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role)
              OR public.has_role(auth.uid(), 'super_admin'::public.app_role));

CREATE POLICY contact_messages_admin_delete ON public.contact_messages
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role)
         OR public.has_role(auth.uid(), 'super_admin'::public.app_role));

-- Spam guard: at most 3 messages per email address per hour, and 30 site-wide per 10 minutes.
CREATE OR REPLACE FUNCTION public.contact_messages_rate_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.email := lower(btrim(NEW.email));
  NEW.name := btrim(NEW.name);
  IF (SELECT count(*) FROM public.contact_messages
      WHERE lower(email) = NEW.email AND created_at > now() - interval '1 hour') >= 3 THEN
    RAISE EXCEPTION 'Too many messages from this email. Please try again later.'
      USING ERRCODE = 'P0001';
  END IF;
  IF (SELECT count(*) FROM public.contact_messages
      WHERE created_at > now() - interval '10 minutes') >= 30 THEN
    RAISE EXCEPTION 'We are receiving a lot of messages right now. Please try again shortly.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.contact_messages_rate_limit() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER contact_messages_rate_limit
  BEFORE INSERT ON public.contact_messages
  FOR EACH ROW EXECUTE FUNCTION public.contact_messages_rate_limit();
