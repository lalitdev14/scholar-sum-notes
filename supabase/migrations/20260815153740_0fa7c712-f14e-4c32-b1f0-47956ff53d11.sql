ALTER TABLE public.universities
  ADD COLUMN IF NOT EXISTS primary_color text NOT NULL DEFAULT '#3f4a7e',
  ADD COLUMN IF NOT EXISTS accent_color text NOT NULL DEFAULT '#c2703d';

UPDATE public.universities SET primary_color = '#1f3a5f', accent_color = '#c8102e' WHERE email_domain = 'springfield.edu';
UPDATE public.universities SET primary_color = '#0f4c3a', accent_color = '#e0a526' WHERE email_domain = 'northgate.edu';
UPDATE public.universities SET primary_color = '#3b2f63', accent_color = '#d4649c' WHERE email_domain = 'riverside.edu';
UPDATE public.universities SET primary_color = '#243b53', accent_color = '#d97b34' WHERE email_domain = 'lectureloop.test';