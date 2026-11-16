-- Recoverable class deletion: admins move classes to "Recently deleted" (hidden from
-- students, nothing erased) and can restore them, or delete them permanently.
ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Class codes stay unique among active classes only, so a code isn't blocked while the
-- old class sits in Recently deleted (restoring checks for a clash first).
ALTER TABLE public.classes DROP CONSTRAINT IF EXISTS classes_code_key;
CREATE UNIQUE INDEX IF NOT EXISTS classes_code_active_key
  ON public.classes (code) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS classes_deleted_at_idx
  ON public.classes (deleted_at) WHERE deleted_at IS NOT NULL;

-- Students (and admins in the browser) only ever see active classes.
DROP POLICY IF EXISTS classes_select ON public.classes;
CREATE POLICY classes_select ON public.classes
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (university_id IS NULL OR university_id = public.current_university_id()
         OR public.current_university_id() IS NULL)
  );
