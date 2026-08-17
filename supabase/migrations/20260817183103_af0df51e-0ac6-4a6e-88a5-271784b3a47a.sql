-- 1) Notes: allow reviewers (faculty/admin) read access
DROP POLICY IF EXISTS notes_select_admin ON public.notes;
CREATE POLICY notes_select_reviewer ON public.notes
  FOR SELECT TO authenticated
  USING (public.is_reviewer(auth.uid()));

-- 2) Profiles: restrict broad read access
CREATE OR REPLACE FUNCTION public.shares_class_with(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.enrollments me
    JOIN public.enrollments other ON other.class_id = me.class_id
    WHERE me.user_id = auth.uid() AND other.user_id = _user_id
  );
$$;

DROP POLICY IF EXISTS profiles_select ON public.profiles;
CREATE POLICY profiles_select_scoped ON public.profiles
  FOR SELECT TO authenticated
  USING (
    auth.uid() = id
    OR public.is_reviewer(auth.uid())
    OR public.shares_class_with(id)
  );

-- 3) Lock down direct execution of SECURITY DEFINER functions
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_reviewer(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_classmate(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.shares_class_with(uuid) FROM PUBLIC, anon, authenticated;
