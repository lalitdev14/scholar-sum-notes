-- "Improve with audio": after a lecture recording is saved, the AI listens to the audio and
-- rewrites the live transcript (fixes misheard and missed words, organises it under topics).
-- The original live transcript is kept here so the student can switch back.
ALTER TABLE public.audio_transcripts
  ADD COLUMN IF NOT EXISTS live_transcript text CHECK (char_length(live_transcript) <= 500000),
  ADD COLUMN IF NOT EXISTS refined_at timestamptz;
