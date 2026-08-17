CREATE POLICY handwriting_objects_own ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'handwriting' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'handwriting' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY handwriting_objects_reviewer_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'handwriting' AND public.is_reviewer(auth.uid()));
