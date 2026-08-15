CREATE TABLE public.enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, class_id)
);

GRANT SELECT, INSERT, DELETE ON public.enrollments TO authenticated;
GRANT ALL ON public.enrollments TO service_role;

ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;

CREATE POLICY enrollments_select_own ON public.enrollments FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_reviewer(auth.uid()));
CREATE POLICY enrollments_insert_own ON public.enrollments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY enrollments_delete_own ON public.enrollments FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX enrollments_user_idx ON public.enrollments(user_id);