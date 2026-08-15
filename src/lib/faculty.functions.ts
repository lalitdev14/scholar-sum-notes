import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function assertReviewer(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("is_reviewer", { _user_id: context.userId });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: faculty access required.");
}

export const getReviewQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertReviewer(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [classesRes, summariesRes, profilesRes] = await Promise.all([
      supabaseAdmin.from("classes").select("id, subject, professor, code, term").order("subject"),
      supabaseAdmin
        .from("class_summaries")
        .select("class_id, summary, key_points, notes_count, updated_at, reviewed, reviewed_by, reviewed_at, review_note"),
      supabaseAdmin.from("profiles").select("id, full_name"),
    ]);

    if (classesRes.error) throw new Error(classesRes.error.message);
    if (summariesRes.error) throw new Error(summariesRes.error.message);

    const names = new Map((profilesRes.data ?? []).map((p) => [p.id, p.full_name]));
    const byClass = new Map((summariesRes.data ?? []).map((s) => [s.class_id, s]));

    return (classesRes.data ?? []).map((c) => {
      const s = byClass.get(c.id);
      return {
        ...c,
        summary: s?.summary ?? "",
        key_points: Array.isArray(s?.key_points) ? (s?.key_points as string[]) : [],
        notes_count: s?.notes_count ?? 0,
        updated_at: s?.updated_at ?? null,
        reviewed: s?.reviewed ?? false,
        reviewed_at: s?.reviewed_at ?? null,
        review_note: s?.review_note ?? "",
        reviewer: s?.reviewed_by ? (names.get(s.reviewed_by) ?? "Faculty") : null,
        has_summary: Boolean(s?.summary),
      };
    });
  });

export const setSummaryReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        classId: z.string().uuid(),
        reviewed: z.boolean(),
        note: z.string().max(1000).optional().default(""),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertReviewer(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await supabaseAdmin
      .from("class_summaries")
      .update({
        reviewed: data.reviewed,
        reviewed_by: data.reviewed ? context.userId : null,
        reviewed_at: data.reviewed ? new Date().toISOString() : null,
        review_note: data.note ?? "",
      })
      .eq("class_id", data.classId);

    if (error) throw new Error(error.message);
    return { ok: true };
  });
