-- Lecture audio recordings saved next to their transcripts (optional, per recording).
-- Private bucket; each student can only read, add and delete files in their own folder:
--   lecture-audio/<user id>/<class id>/<transcript id>
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'lecture-audio', 'lecture-audio', false, 52428800,  -- 50 MB (about 3 hours at 32 kbps)
  ARRAY['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/aac']
)
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS lecture_audio_objects_own ON storage.objects;
CREATE POLICY lecture_audio_objects_own ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'lecture-audio' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'lecture-audio' AND (storage.foldername(name))[1] = auth.uid()::text);
