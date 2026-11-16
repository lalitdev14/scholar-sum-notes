-- GoodNotes-style notebook: keep the ink strokes, paper style and an optional slide
-- background with each saved handwritten page so it can be reopened and edited.
ALTER TABLE public.handwriting_pages
  ADD COLUMN IF NOT EXISTS strokes jsonb,
  ADD COLUMN IF NOT EXISTS paper text NOT NULL DEFAULT 'blank'
    CHECK (paper IN ('blank', 'lined', 'grid', 'dotted')),
  ADD COLUMN IF NOT EXISTS background_path text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Stroke data is compact, but cap it so a single page can't grow without bound (~2 MB).
ALTER TABLE public.handwriting_pages
  DROP CONSTRAINT IF EXISTS handwriting_pages_strokes_size;
ALTER TABLE public.handwriting_pages
  ADD CONSTRAINT handwriting_pages_strokes_size
  CHECK (strokes IS NULL OR pg_column_size(strokes) < 2000000);

DROP TRIGGER IF EXISTS handwriting_pages_updated_at ON public.handwriting_pages;
CREATE TRIGGER handwriting_pages_updated_at
  BEFORE UPDATE ON public.handwriting_pages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
