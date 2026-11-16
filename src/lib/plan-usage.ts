import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/** Free plan: AI note summaries per week (Monday to Sunday, UTC). */
export const FREE_SUMMARIES_PER_WEEK = 3;

export type MyPlan = {
  plan: "free" | "pro";
  summariesUsedThisWeek: number;
  freeSummariesPerWeek: number;
  proRequested: boolean;
  /** Pro can be requested (the plans are set up in the database). Otherwise "coming soon". */
  canRequestPro: boolean;
};

/** Monday of this week (UTC), as YYYY-MM-DD. Free summaries reset then. */
export function weekStartUtc(now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

type Db = SupabaseClient<Database>;

/**
 * Plan and this week's summary count without the plans tables: admins count as Pro,
 * everyone else is Free, and usage comes from the daily AI usage records.
 * Used by the app and by the server until the plans migration is applied.
 */
export async function planFromUsage(db: Db, userId: string): Promise<MyPlan> {
  const [{ data: roles }, { data: usage }] = await Promise.all([
    db.from("user_roles").select("role").eq("user_id", userId),
    db
      .from("ai_usage")
      .select("count")
      .eq("user_id", userId)
      .eq("feature", "summary")
      .gte("day", weekStartUtc()),
  ]);
  const admin = (roles ?? []).some((r) => ["admin", "super_admin"].includes(String(r.role)));
  return {
    plan: admin ? "pro" : "free",
    summariesUsedThisWeek: (usage ?? []).reduce((n, r) => n + (r.count ?? 0), 0),
    freeSummariesPerWeek: FREE_SUMMARIES_PER_WEEK,
    proRequested: false,
    canRequestPro: false,
  };
}
