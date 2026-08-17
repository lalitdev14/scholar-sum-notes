CREATE TABLE public.handwriting_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  image_path text NOT NULL,
  transcript text NOT NULL DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.handwriting_pages TO authenticated;
GRANT ALL ON public.handwriting_pages TO service_role;

ALTER TABLE public.handwriting_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY handwriting_pages_own ON public.handwriting_pages
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY handwriting_pages_select_reviewer ON public.handwriting_pages
  FOR SELECT TO authenticated
  USING (public.is_reviewer(auth.uid()));

CREATE INDEX handwriting_pages_class_user_idx ON public.handwriting_pages (class_id, user_id, created_at DESC);
