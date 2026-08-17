DROP POLICY IF EXISTS "Enrolled students can see classmates" ON public.enrollments;

CREATE OR REPLACE FUNCTION public.is_classmate(target_class_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.enrollments
    WHERE class_id = target_class_id AND user_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_classmate(uuid) TO public;

CREATE POLICY "Enrolled students can see classmates" ON public.enrollments
FOR SELECT TO authenticated USING (public.is_classmate(class_id));
