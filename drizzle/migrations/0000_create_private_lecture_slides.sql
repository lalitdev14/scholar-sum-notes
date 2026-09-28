CREATE TABLE public.lecture_slides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name text NOT NULL CHECK (length(file_name) BETWEEN 1 AND 255),
  file_path text NOT NULL UNIQUE,
  content_type text NOT NULL CHECK (content_type IN ('application/pdf', 'application/vnd.openxmlformats-officedocument.presentationml.presentation')),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.lecture_slides TO authenticated;
GRANT ALL ON public.lecture_slides TO service_role;
ALTER TABLE public.lecture_slides ENABLE ROW LEVEL SECURITY;
CREATE POLICY lecture_slides_select_own ON public.lecture_slides FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY lecture_slides_insert_own ON public.lecture_slides FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.enrollments e WHERE e.class_id = lecture_slides.class_id AND e.user_id = auth.uid()) AND file_path LIKE auth.uid()::text || '/' || class_id::text || '/%');
CREATE POLICY lecture_slides_delete_own ON public.lecture_slides FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE INDEX lecture_slides_class_user_idx ON public.lecture_slides (class_id, user_id, created_at DESC);
CREATE POLICY lecture_slides_storage_select_own ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'lecture-slides' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY lecture_slides_storage_insert_own ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'lecture-slides' AND (storage.foldername(name))[1] = auth.uid()::text AND lower(storage.extension(name)) IN ('pdf', 'pptx'));
CREATE POLICY lecture_slides_storage_delete_own ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'lecture-slides' AND (storage.foldername(name))[1] = auth.uid()::text);