-- Live lecture transcripts recorded from the student's microphone.
-- Private to the student (like handwriting pages); only the text is stored, not the audio.
CREATE TABLE public.audio_transcripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Lecture recording' CHECK (char_length(title) BETWEEN 1 AND 200),
  transcript text NOT NULL DEFAULT '' CHECK (char_length(transcript) <= 500000),
  duration_seconds integer NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.audio_transcripts TO authenticated;
GRANT ALL ON public.audio_transcripts TO service_role;

ALTER TABLE public.audio_transcripts ENABLE ROW LEVEL SECURITY;

CREATE POLICY audio_transcripts_own ON public.audio_transcripts
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX audio_transcripts_class_user_idx
  ON public.audio_transcripts (class_id, user_id, created_at DESC);
