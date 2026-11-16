-- Notebook pages can grow longer as students write ("dynamic page"); keep each page's
-- length (in page units; width is always 1000) so reopened pages look the same.
ALTER TABLE public.handwriting_pages
  ADD COLUMN IF NOT EXISTS page_height integer NOT NULL DEFAULT 700
    CHECK (page_height BETWEEN 300 AND 8000);
