import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin access required.");
}

export const getAdminOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [classesRes, notesRes, profilesRes, summariesRes] = await Promise.all([
      supabaseAdmin.from("classes").select("id, subject, professor, code, term, created_at").order("subject"),
      supabaseAdmin
        .from("notes")
        .select("id, class_id, user_id, content, updated_at")
        .order("updated_at", { ascending: false })
        .limit(200),
      supabaseAdmin.from("profiles").select("id, full_name"),
      supabaseAdmin.from("class_summaries").select("class_id, notes_count, updated_at"),
    ]);

    if (classesRes.error) throw new Error(classesRes.error.message);
    if (notesRes.error) throw new Error(notesRes.error.message);
    if (profilesRes.error) throw new Error(profilesRes.error.message);

    const names = new Map((profilesRes.data ?? []).map((p) => [p.id, p.full_name]));
    const summaries = new Map((summariesRes.data ?? []).map((s) => [s.class_id, s]));
    const notes = notesRes.data ?? [];

    const classes = (classesRes.data ?? []).map((c) => {
      const classNotes = notes.filter((n) => n.class_id === c.id);
      return {
        ...c,
        notes_count: classNotes.length,
        contributors: new Set(classNotes.map((n) => n.user_id)).size,
        summary_notes_count: summaries.get(c.id)?.notes_count ?? 0,
        summary_updated_at: summaries.get(c.id)?.updated_at ?? null,
      };
    });

    const activity = notes.slice(0, 40).map((n) => ({
      id: n.id,
      class_id: n.class_id,
      author: names.get(n.user_id) ?? "Unknown student",
      updated_at: n.updated_at,
      excerpt: n.content.slice(0, 160),
      length: n.content.length,
    }));

    return {
      stats: {
        classes: classes.length,
        notes: notes.length,
        students: profilesRes.data?.length ?? 0,
        contributors: new Set(notes.map((n) => n.user_id)).size,
      },
      classes,
      activity,
    };
  });

const SubjectRow = z.object({
  subject: z.string().min(1).max(200),
  code: z.string().min(1).max(50),
  professor: z.string().min(1).max(200),
  term: z.string().max(100).optional().default(""),
});

export const uploadSubjects = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ rows: z.array(SubjectRow).min(1).max(500) }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existing, error: existingError } = await supabaseAdmin.from("classes").select("code");
    if (existingError) throw new Error(existingError.message);
    const seen = new Set((existing ?? []).map((c) => c.code.trim().toLowerCase()));

    const fresh = data.rows.filter((r) => {
      const key = r.code.trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (fresh.length) {
      const { error } = await supabaseAdmin.from("classes").insert(
        fresh.map((r) => ({
          subject: r.subject.trim(),
          code: r.code.trim(),
          professor: r.professor.trim(),
          term: r.term?.trim() ?? "",
          created_by: context.userId,
        })),
      );
      if (error) throw new Error(error.message);
    }

    return { inserted: fresh.length, skipped: data.rows.length - fresh.length };
  });

export const deleteClass = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ classId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("class_summaries").delete().eq("class_id", data.classId);
    await supabaseAdmin.from("notes").delete().eq("class_id", data.classId);
    const { error } = await supabaseAdmin.from("classes").delete().eq("id", data.classId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
