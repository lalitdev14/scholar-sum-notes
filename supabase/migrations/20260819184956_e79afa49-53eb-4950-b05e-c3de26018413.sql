ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS university_id uuid REFERENCES public.universities(id) ON DELETE SET NULL;

UPDATE public.classes c
SET university_id = p.university_id
FROM public.profiles p
WHERE c.created_by = p.id AND c.university_id IS NULL AND p.university_id IS NOT NULL;

UPDATE public.classes c
SET university_id = (SELECT u.id FROM public.universities u LIMIT 1)
WHERE c.university_id IS NULL AND (SELECT count(*) FROM public.universities) = 1;

CREATE OR REPLACE FUNCTION public.current_university_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT university_id FROM public.profiles WHERE id = auth.uid()
$$;

REVOKE EXECUTE ON FUNCTION public.current_university_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_university_id() TO authenticated;

DROP POLICY IF EXISTS classes_select ON public.classes;
CREATE POLICY classes_select ON public.classes
FOR SELECT TO authenticated
USING (
  university_id IS NULL
  OR university_id = public.current_university_id()
  OR public.current_university_id() IS NULL
);

DROP POLICY IF EXISTS classes_insert ON public.classes;
CREATE POLICY classes_insert ON public.classes
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = created_by
  AND (
    university_id IS NULL
    OR university_id = public.current_university_id()
    OR public.current_university_id() IS NULL
  )
);

DROP POLICY IF EXISTS classes_update_admin ON public.classes;
CREATE POLICY classes_update_admin ON public.classes
FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  AND (public.current_university_id() IS NULL OR university_id = public.current_university_id())
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  AND (public.current_university_id() IS NULL OR university_id = public.current_university_id())
);

DROP POLICY IF EXISTS classes_delete_admin ON public.classes;
CREATE POLICY classes_delete_admin ON public.classes
FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  AND (public.current_university_id() IS NULL OR university_id = public.current_university_id())
);