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

export const getUserDirectory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: usersRes, error: usersError } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (usersError) throw new Error(usersError.message);

    const [profilesRes, rolesRes, notesRes] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, full_name"),
      supabaseAdmin.from("user_roles").select("user_id, role"),
      supabaseAdmin.from("notes").select("user_id, updated_at"),
    ]);

    const names = new Map((profilesRes.data ?? []).map((p) => [p.id, p.full_name]));
    const roles = new Map<string, string[]>();
    for (const r of rolesRes.data ?? []) {
      roles.set(r.user_id, [...(roles.get(r.user_id) ?? []), r.role as string]);
    }
    const notes = notesRes.data ?? [];

    return (usersRes.users ?? []).map((u) => {
      const own = notes.filter((n) => n.user_id === u.id);
      const last = own
        .map((n) => n.updated_at)
        .sort()
        .at(-1);
      return {
        id: u.id,
        email: u.email ?? "",
        full_name: names.get(u.id) ?? "",
        provider: (u.app_metadata?.provider as string) ?? "email",
        email_confirmed: Boolean(u.email_confirmed_at),
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at ?? null,
        roles: roles.get(u.id) ?? [],
        notes_count: own.length,
        last_note_at: last ?? null,
      };
    });
  });

export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        role: z.enum(["admin", "faculty", "student"]),
        grant: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    if (data.userId === context.userId && data.role === "admin" && !data.grant) {
      throw new Error("You cannot remove your own admin role.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.grant) {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: data.userId, role: data.role as never }, { onConflict: "user_id,role" });
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", data.userId)
        .eq("role", data.role as never);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

