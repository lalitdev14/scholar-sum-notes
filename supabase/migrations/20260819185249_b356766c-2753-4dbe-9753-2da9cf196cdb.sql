CREATE TABLE public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  university_id uuid references public.universities(id),
  class_id uuid references public.classes(id) on delete set null,
  category text not null default 'general',
  message text not null,
  status text not null default 'open',
  admin_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

GRANT SELECT, INSERT, UPDATE ON public.feedback TO authenticated;
GRANT ALL ON public.feedback TO service_role;

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY feedback_insert_own ON public.feedback FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY feedback_select_own_or_admin ON public.feedback FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR (
      has_role(auth.uid(), 'admin'::app_role)
      AND (current_university_id() IS NULL OR university_id = current_university_id())
    )
  );

CREATE POLICY feedback_update_admin ON public.feedback FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND (current_university_id() IS NULL OR university_id = current_university_id()))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND (current_university_id() IS NULL OR university_id = current_university_id()));

CREATE TRIGGER feedback_set_updated_at BEFORE UPDATE ON public.feedback
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();