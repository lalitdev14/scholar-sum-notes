REVOKE EXECUTE ON FUNCTION public.is_reviewer(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.is_reviewer(uuid) TO authenticated, service_role;