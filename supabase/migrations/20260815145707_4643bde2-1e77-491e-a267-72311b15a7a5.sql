CREATE TABLE public.universities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  email_domain text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.universities TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.universities TO authenticated;
GRANT ALL ON public.universities TO service_role;
ALTER TABLE public.universities ENABLE ROW LEVEL SECURITY;
CREATE POLICY universities_select_anon ON public.universities FOR SELECT TO anon USING (true);
CREATE POLICY universities_select ON public.universities FOR SELECT TO authenticated USING (true);
CREATE POLICY universities_insert_admin ON public.universities FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY universities_update_admin ON public.universities FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY universities_delete_admin ON public.universities FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.universities (name, email_domain) VALUES
  ('LectureLoop Demo University', 'lectureloop.test'),
  ('Springfield State University', 'springfield.edu'),
  ('Northgate Institute of Technology', 'northgate.edu'),
  ('Riverside University', 'riverside.edu');

ALTER TABLE public.profiles ADD COLUMN university_id uuid REFERENCES public.universities(id);

CREATE TABLE public.faculty_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  university_id uuid REFERENCES public.universities(id),
  department text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  admin_note text NOT NULL DEFAULT '',
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.faculty_requests TO authenticated;
GRANT ALL ON public.faculty_requests TO service_role;
ALTER TABLE public.faculty_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY faculty_requests_select_own_or_admin ON public.faculty_requests FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY faculty_requests_insert_own ON public.faculty_requests FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY faculty_requests_update_admin ON public.faculty_requests FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER faculty_requests_updated_at BEFORE UPDATE ON public.faculty_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_university_id uuid;
  v_domain text;
  v_requested_role text;
BEGIN
  v_requested_role := lower(coalesce(NEW.raw_user_meta_data->>'requested_role', 'student'));
  BEGIN
    v_university_id := nullif(NEW.raw_user_meta_data->>'university_id', '')::uuid;
  EXCEPTION WHEN others THEN
    v_university_id := NULL;
  END;

  IF v_university_id IS NOT NULL THEN
    SELECT email_domain INTO v_domain FROM public.universities WHERE id = v_university_id;
    IF v_domain IS NULL THEN
      RAISE EXCEPTION 'Unknown university selected.';
    END IF;
    IF lower(split_part(NEW.email, '@', 2)) <> lower(v_domain) THEN
      RAISE EXCEPTION 'Email must use the % domain of the selected university.', v_domain;
    END IF;
  END IF;

  INSERT INTO public.profiles (id, full_name, university_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    v_university_id
  )
  ON CONFLICT (id) DO UPDATE SET university_id = COALESCE(EXCLUDED.university_id, public.profiles.university_id);

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'student')
  ON CONFLICT (user_id, role) DO NOTHING;

  IF v_requested_role = 'faculty' THEN
    INSERT INTO public.faculty_requests (user_id, university_id, department)
    VALUES (NEW.id, v_university_id, COALESCE(NEW.raw_user_meta_data->>'department', ''))
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;