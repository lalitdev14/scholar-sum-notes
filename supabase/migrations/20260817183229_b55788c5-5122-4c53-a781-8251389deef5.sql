GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_reviewer(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_classmate(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.shares_class_with(uuid) TO authenticated;
