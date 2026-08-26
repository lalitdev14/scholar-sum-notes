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

  RETURN NEW;
END;
$function$;