-- LectureLoop is now an individual notes platform: each student's AI summary
-- of their own notes is stored on their note row (no shared class summary).
ALTER TABLE public.notes
  ADD COLUMN IF NOT EXISTS summary text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS key_points jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS summary_updated_at timestamptz;
