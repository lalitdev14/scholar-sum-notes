ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'faculty';

ALTER TABLE public.class_summaries
  ADD COLUMN IF NOT EXISTS reviewed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_note text NOT NULL DEFAULT '';

GRANT SELECT, UPDATE ON public.class_summaries TO authenticated;
GRANT ALL ON public.class_summaries TO service_role;

CREATE OR REPLACE FUNCTION public.is_reviewer(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role::text IN ('faculty', 'admin')
  )
$$;

DROP POLICY IF EXISTS summaries_update_reviewer ON public.class_summaries;
CREATE POLICY summaries_update_reviewer ON public.class_summaries
  FOR UPDATE TO authenticated
  USING (public.is_reviewer(auth.uid()))
  WITH CHECK (public.is_reviewer(auth.uid()));