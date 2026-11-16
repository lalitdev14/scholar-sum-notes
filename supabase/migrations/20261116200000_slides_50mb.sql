-- Let students upload slide decks up to 50 MB (was 20 MB).
-- 50 MB is also the default per-file limit of the Supabase project (Storage settings).
UPDATE storage.buckets
SET file_size_limit = 52428800
WHERE id = 'lecture-slides';
