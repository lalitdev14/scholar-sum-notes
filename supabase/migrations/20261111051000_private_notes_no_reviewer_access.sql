-- Notes are private to each student now that there is no shared class summary to review.
-- Remove the reviewer (faculty/admin) read access that existed for summary review.
DROP POLICY IF EXISTS notes_select_reviewer ON public.notes;
DROP POLICY IF EXISTS handwriting_pages_select_reviewer ON public.handwriting_pages;
DROP POLICY IF EXISTS handwriting_objects_reviewer_select ON storage.objects;
