-- LectureLoop is NYU-only: new accounts must use an allowed NYU email domain,
-- except emails on the registration allowlist (e.g. admins with other addresses).
-- Existing accounts are unaffected (the check runs only on new sign-ups / email changes).

CREATE TABLE IF NOT EXISTS public.allowed_email_domains (
  domain text PRIMARY KEY CHECK (domain = lower(domain) AND domain NOT LIKE '%@%'),
  university_id uuid REFERENCES public.universities(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.allowed_email_domains ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.allowed_email_domains TO service_role;

INSERT INTO public.allowed_email_domains (domain, university_id)
SELECT d, (SELECT id FROM public.universities WHERE email_domain = 'nyu.edu' LIMIT 1)
FROM unnest(ARRAY['nyu.edu', 'stern.nyu.edu']) AS d
ON CONFLICT (domain) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.registration_allowlist (
  email text PRIMARY KEY CHECK (email = lower(email) AND email LIKE '%@%'),
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.registration_allowlist ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.registration_allowlist TO service_role;

-- Callable before sign-up (anon) so the form can explain the rule; reveals only yes/no.
CREATE OR REPLACE FUNCTION public.can_register(_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (SELECT 1 FROM public.allowed_email_domains d WHERE d.domain = split_part(lower(trim(_email)), '@', 2))
      OR EXISTS (SELECT 1 FROM public.registration_allowlist a WHERE a.email = lower(trim(_email)));
$$;
GRANT EXECUTE ON FUNCTION public.can_register(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.enforce_nyu_registration()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND lower(coalesce(NEW.email, '')) = lower(coalesce(OLD.email, '')) THEN
    RETURN NEW;
  END IF;
  IF NEW.email IS NULL OR public.can_register(NEW.email) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'LectureLoop is only open to NYU students. Sign up with your @nyu.edu or @stern.nyu.edu email.'
    USING ERRCODE = 'check_violation';
END;
$$;

DROP TRIGGER IF EXISTS enforce_nyu_registration ON auth.users;
CREATE TRIGGER enforce_nyu_registration
  BEFORE INSERT OR UPDATE OF email ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.enforce_nyu_registration();

-- New accounts get their university from their email domain when the form didn't send one
-- (e.g. Google sign-in).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_university_id uuid;
BEGIN
  BEGIN
    v_university_id := nullif(NEW.raw_user_meta_data->>'university_id', '')::uuid;
  EXCEPTION WHEN others THEN
    v_university_id := NULL;
  END;

  IF v_university_id IS NULL THEN
    SELECT d.university_id INTO v_university_id
    FROM public.allowed_email_domains d
    WHERE d.domain = split_part(lower(NEW.email), '@', 2);
  END IF;

  INSERT INTO public.profiles (id, full_name, university_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    v_university_id
  )
  ON CONFLICT (id) DO UPDATE SET university_id = COALESCE(EXCLUDED.university_id, public.profiles.university_id);

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'student')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$function$;
