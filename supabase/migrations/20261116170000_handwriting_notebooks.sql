-- Group saved handwritten pages into notebooks (title + page order), so a whole notebook
-- can be reopened or downloaded as one PDF. Pages saved before this have no notebook.
ALTER TABLE public.handwriting_pages
  ADD COLUMN IF NOT EXISTS notebook_id uuid,
  ADD COLUMN IF NOT EXISTS notebook_title text CHECK (notebook_title IS NULL OR char_length(notebook_title) <= 200),
  ADD COLUMN IF NOT EXISTS page_index integer NOT NULL DEFAULT 0 CHECK (page_index BETWEEN 0 AND 1000);

CREATE INDEX IF NOT EXISTS handwriting_pages_notebook_idx
  ON public.handwriting_pages (user_id, class_id, notebook_id, page_index);
