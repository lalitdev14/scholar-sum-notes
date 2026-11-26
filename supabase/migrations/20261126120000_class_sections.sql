-- The NYU section each student picked for a class: its weekly meeting times and term dates,
-- used for the "Next lecture" countdown on the home page. Additive only (safe for live code).
-- Private to the student: each student reads and writes only their own rows.
CREATE TABLE IF NOT EXISTS public.class_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  -- NYU class search term id (FOSE srcdb), e.g. '1274'.
  term text NOT NULL CHECK (char_length(term) BETWEEN 1 AND 20),
  section_no text NOT NULL CHECK (char_length(section_no) BETWEEN 1 AND 20),
  schedule_type text NOT NULL DEFAULT '' CHECK (char_length(schedule_type) <= 20),
  -- NYU's meeting text, e.g. 'TR 2-3:15p'.
  meets text NOT NULL DEFAULT '' CHECK (char_length(meets) <= 200),
  -- [{"day":0-6 (0 = Monday),"start":minutes,"end":minutes}] in New York time.
  meetings jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(meetings) = 'array'),
  start_date date,
  end_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT class_sections_user_class_key UNIQUE (user_id, class_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_sections TO authenticated;
GRANT ALL ON public.class_sections TO service_role;

ALTER TABLE public.class_sections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS class_sections_select_own ON public.class_sections;
CREATE POLICY class_sections_select_own ON public.class_sections
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS class_sections_insert_own ON public.class_sections;
CREATE POLICY class_sections_insert_own ON public.class_sections
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS class_sections_update_own ON public.class_sections;
CREATE POLICY class_sections_update_own ON public.class_sections
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS class_sections_delete_own ON public.class_sections;
CREATE POLICY class_sections_delete_own ON public.class_sections
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- (user_id, class_id) is covered by the unique constraint; this one serves class deletes.
CREATE INDEX IF NOT EXISTS class_sections_class_idx ON public.class_sections (class_id);

DROP TRIGGER IF EXISTS class_sections_set_updated_at ON public.class_sections;
CREATE TRIGGER class_sections_set_updated_at BEFORE UPDATE ON public.class_sections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Removing a class from "Your classes" (deleting the enrollment) also removes its saved section.
CREATE OR REPLACE FUNCTION public.delete_class_section_on_unenroll() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.class_sections
   WHERE user_id = OLD.user_id AND class_id = OLD.class_id;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.delete_class_section_on_unenroll() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enrollments_delete_class_section ON public.enrollments;
CREATE TRIGGER enrollments_delete_class_section AFTER DELETE ON public.enrollments
  FOR EACH ROW EXECUTE FUNCTION public.delete_class_section_on_unenroll();
