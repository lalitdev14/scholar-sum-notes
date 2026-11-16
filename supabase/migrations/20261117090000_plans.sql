-- Free and Pro plans.
--   Free: 3 AI note summaries per week (Monday-Sunday, UTC), then an upgrade prompt.
--   Pro:  AI summaries up to the fair-use daily limit (20 a day, as before).
-- Students ask for Pro from the app (pro_requests); admins grant it on the Admin page.
-- Plans are written only by the server (service role), never directly from the browser.

CREATE TABLE IF NOT EXISTS public.user_plans (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan text NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
ALTER TABLE public.user_plans ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.user_plans TO authenticated;
GRANT ALL ON public.user_plans TO service_role;
DROP POLICY IF EXISTS user_plans_select_own ON public.user_plans;
CREATE POLICY user_plans_select_own ON public.user_plans
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.pro_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined')),
  handled_at timestamptz,
  handled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
-- One open request per student.
CREATE UNIQUE INDEX IF NOT EXISTS pro_requests_one_pending
  ON public.pro_requests (user_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS pro_requests_status_idx ON public.pro_requests (status, created_at);
ALTER TABLE public.pro_requests ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.pro_requests TO authenticated;
GRANT ALL ON public.pro_requests TO service_role;
DROP POLICY IF EXISTS pro_requests_select_own ON public.pro_requests;
CREATE POLICY pro_requests_select_own ON public.pro_requests
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS pro_requests_insert_own ON public.pro_requests;
CREATE POLICY pro_requests_insert_own ON public.pro_requests
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND status = 'pending' AND handled_at IS NULL AND handled_by IS NULL);

-- The caller's plan and summary allowance, for the app to show ("2 of 3 left this week").
CREATE OR REPLACE FUNCTION public.my_plan()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_plan text;
  v_week date := date_trunc('week', (now() AT TIME ZONE 'utc'))::date;
  v_used int;
  v_pending boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '28000';
  END IF;
  SELECT plan INTO v_plan FROM public.user_plans WHERE user_id = v_uid;
  v_plan := COALESCE(v_plan, 'free');
  -- Admins always have Pro (testing and support).
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = v_uid AND role::text IN ('admin', 'super_admin')) THEN
    v_plan := 'pro';
  END IF;
  SELECT COALESCE(SUM(count), 0) INTO v_used FROM public.ai_usage
    WHERE user_id = v_uid AND feature = 'summary' AND day >= v_week;
  SELECT EXISTS (SELECT 1 FROM public.pro_requests WHERE user_id = v_uid AND status = 'pending')
    INTO v_pending;
  RETURN jsonb_build_object(
    'plan', v_plan,
    'summaries_used_this_week', v_used,
    'free_summaries_per_week', 3,
    'pro_requested', v_pending
  );
END;
$$;
REVOKE ALL ON FUNCTION public.my_plan() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_plan() TO authenticated;

-- Counts one AI summary if the caller's plan allows it.
-- Returns 'ok', 'upgrade' (Free plan used its weekly summaries) or 'limit' (daily fair use).
CREATE OR REPLACE FUNCTION public.consume_summary_quota()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_info jsonb;
  v_today date := (now() AT TIME ZONE 'utc')::date;
  v_daily int := 20;
  v_count int;
BEGIN
  v_info := public.my_plan();
  IF v_info->>'plan' = 'free'
     AND (v_info->>'summaries_used_this_week')::int >= (v_info->>'free_summaries_per_week')::int THEN
    RETURN 'upgrade';
  END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = v_uid AND role::text IN ('admin', 'super_admin')) THEN
    v_daily := v_daily * 5;
  END IF;
  INSERT INTO public.ai_usage AS u (user_id, feature, day, count)
  VALUES (v_uid, 'summary', v_today, 1)
  ON CONFLICT (user_id, feature, day)
  DO UPDATE SET count = u.count + 1
  WHERE u.count < v_daily
  RETURNING u.count INTO v_count;
  RETURN CASE WHEN v_count IS NOT NULL AND v_count <= v_daily THEN 'ok' ELSE 'limit' END;
END;
$$;
REVOKE ALL ON FUNCTION public.consume_summary_quota() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_summary_quota() TO authenticated;
