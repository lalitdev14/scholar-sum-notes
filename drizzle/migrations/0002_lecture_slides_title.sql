ALTER TABLE public.lecture_slides ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT '' CHECK (char_length(title) <= 120);
GRANT UPDATE (title) ON public.lecture_slides TO authenticated;
CREATE POLICY lecture_slides_update_own ON public.lecture_slides FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());