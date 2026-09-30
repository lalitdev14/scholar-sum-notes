CREATE TABLE public.slide_bookmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slide_id uuid NOT NULL REFERENCES public.lecture_slides(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slide_number integer NOT NULL CHECK (slide_number >= 1 AND slide_number <= 10000),
  comment text NOT NULL DEFAULT '' CHECK (char_length(comment) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX slide_bookmarks_slide_idx ON public.slide_bookmarks(slide_id, slide_number);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.slide_bookmarks TO authenticated;
GRANT ALL ON public.slide_bookmarks TO service_role;
ALTER TABLE public.slide_bookmarks ENABLE ROW LEVEL SECURITY;
CREATE POLICY slide_bookmarks_own ON public.slide_bookmarks FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.lecture_slides s WHERE s.id = slide_id AND s.user_id = auth.uid()));