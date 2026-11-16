import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** What each plan includes. Shown on the Plans page and in the upgrade prompt. */
export const PLANS = {
  free: {
    name: "Free",
    price: "$0",
    period: "forever",
    features: [
      "Typed and handwritten notes for every class",
      "Lecture slides, bookmarks and notebooks",
      "Handwriting, slide and audio AI tools",
      "3 AI note summaries a week",
    ],
  },
  pro: {
    name: "Pro",
    price: "$4.99",
    period: "per month",
    features: [
      "Everything in Free",
      "Unlimited AI note summaries (up to 20 a day)",
      "Support the students building LectureLoop",
    ],
  },
} as const;

export { FREE_SUMMARIES_PER_WEEK } from "@/lib/plan-usage";
import { FREE_SUMMARIES_PER_WEEK } from "@/lib/plan-usage";

export { PRO_REQUIRED } from "@/lib/plan-constants";

export { weekStartUtc, planFromUsage, type MyPlan } from "@/lib/plan-usage";
import { planFromUsage, type MyPlan } from "@/lib/plan-usage";

/** The signed-in student's plan and how many free summaries are left this week. */
export function usePlan(enabled = true) {
  return useQuery({
    queryKey: ["my-plan"],
    enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<MyPlan | null> => {
      const { data, error } = await supabase.rpc("my_plan");
      if (!error && data) {
        const d = data as Record<string, unknown>;
        return {
          plan: d["plan"] === "pro" ? "pro" : "free",
          summariesUsedThisWeek: Number(d["summaries_used_this_week"] ?? 0),
          freeSummariesPerWeek: Number(d["free_summaries_per_week"] ?? FREE_SUMMARIES_PER_WEEK),
          proRequested: Boolean(d["pro_requested"]),
          canRequestPro: true,
        };
      }
      const { data: userData } = await supabase.auth.getUser();
      return userData.user ? planFromUsage(supabase, userData.user.id) : null;
    },
  });
}

/** Free summaries left this week, or null on Pro. */
export function freeSummariesLeft(p: MyPlan | null | undefined) {
  if (!p || p.plan === "pro") return null;
  return Math.max(0, p.freeSummariesPerWeek - p.summariesUsedThisWeek);
}

/** Asks an admin to switch the signed-in student to Pro. */
export function useRequestPro() {
  const queryClient = useQueryClient();
  return async () => {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) throw new Error("Sign in first.");
    const { error } = await supabase.from("pro_requests").insert({ user_id: userId });
    // 23505 = already have an open request: that's fine.
    if (error && error.code !== "23505") throw error;
    await queryClient.invalidateQueries({ queryKey: ["my-plan"] });
  };
}
