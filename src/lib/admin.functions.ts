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

/**
 * Admins are scoped to their own university. An admin whose profile has no
 * university is treated as a global (super) admin.
 */
async function adminScope(context: { supabase: any; userId: string }) {
  await assertAdmin(context);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("university_id")
    .eq("id", context.userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const universityId = data?.university_id ?? null;

  const memberIds = async () => {
    if (!universityId) return null; // null = every user
    const { data: rows, error: err } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("university_id", universityId);
    if (err) throw new Error(err.message);
    return new Set((rows ?? []).map((r) => r.id));
  };

  return { supabaseAdmin, universityId, memberIds };
}

export const getAdminOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin, universityId, memberIds } = await adminScope(context as never);
    const members = await memberIds();

    let classQuery = supabaseAdmin
      .from("classes")
      .select("id, subject, professor, code, term, created_at, university_id")
      .order("subject");
    if (universityId) classQuery = classQuery.eq("university_id", universityId);

    let profileQuery = supabaseAdmin.from("profiles").select("id, full_name, university_id");
    if (universityId) profileQuery = profileQuery.eq("university_id", universityId);

    const [classesRes, notesRes, profilesRes, summariesRes, universityRes, feedbackRes] = await Promise.all([
      classQuery,
      supabaseAdmin
        .from("notes")
        .select("id, class_id, user_id, content, updated_at")
        .order("updated_at", { ascending: false })
        .limit(500),
      profileQuery,
      supabaseAdmin.from("class_summaries").select("class_id, notes_count, updated_at"),
      universityId
        ? supabaseAdmin.from("universities").select("id, name").eq("id", universityId).maybeSingle()
        : Promise.resolve({ data: null, error: null } as never),
      supabaseAdmin.from("feedback").select("user_id"),
    ]);

    if (classesRes.error) throw new Error(classesRes.error.message);
    if (notesRes.error) throw new Error(notesRes.error.message);
    if (profilesRes.error) throw new Error(profilesRes.error.message);

    const classIds = new Set((classesRes.data ?? []).map((c) => c.id));
    const names = new Map((profilesRes.data ?? []).map((p) => [p.id, p.full_name]));
    const summaries = new Map((summariesRes.data ?? []).map((s) => [s.class_id, s]));
    const notes = (notesRes.data ?? []).filter(
      (n) => classIds.has(n.class_id) && (!members || members.has(n.user_id)),
    );

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
      scope: {
        universityId,
        universityName: (universityRes as { data: { name: string } | null })?.data?.name ?? null,
      },
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
    const { supabaseAdmin, universityId } = await adminScope(context as never);

    let existingQuery = supabaseAdmin.from("classes").select("code, university_id");
    if (universityId) existingQuery = existingQuery.eq("university_id", universityId);
    const { data: existing, error: existingError } = await existingQuery;
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
          university_id: universityId,
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
    const { supabaseAdmin, universityId } = await adminScope(context as never);

    const { data: target, error: targetError } = await supabaseAdmin
      .from("classes")
      .select("id, university_id")
      .eq("id", data.classId)
      .maybeSingle();
    if (targetError) throw new Error(targetError.message);
    if (!target) throw new Error("Class not found.");
    if (universityId && target.university_id !== universityId) {
      throw new Error("This class belongs to another university.");
    }

    await supabaseAdmin.from("class_summaries").delete().eq("class_id", data.classId);
    await supabaseAdmin.from("notes").delete().eq("class_id", data.classId);
    const { error } = await supabaseAdmin.from("classes").delete().eq("id", data.classId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getUserDirectory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin, universityId, memberIds } = await adminScope(context as never);
    const members = await memberIds();

    const { data: usersRes, error: usersError } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (usersError) throw new Error(usersError.message);

    let profileQuery = supabaseAdmin.from("profiles").select("id, full_name, university_id");
    if (universityId) profileQuery = profileQuery.eq("university_id", universityId);

    const [profilesRes, rolesRes, notesRes, feedbackRes] = await Promise.all([
      profileQuery,
      supabaseAdmin.from("user_roles").select("user_id, role"),
      supabaseAdmin.from("notes").select("user_id, updated_at"),
      supabaseAdmin.from("feedback").select("user_id, created_at"),
    ]);

    const names = new Map((profilesRes.data ?? []).map((p) => [p.id, p.full_name]));
    const roles = new Map<string, string[]>();
    for (const r of rolesRes.data ?? []) {
      roles.set(r.user_id, [...(roles.get(r.user_id) ?? []), r.role as string]);
    }
    const notes = notesRes.data ?? [];
    const feedback = feedbackRes.data ?? [];


    return (usersRes.users ?? [])
      .filter((u) => !members || members.has(u.id))
      .map((u) => {
        const own = notes.filter((n) => n.user_id === u.id);
        const ownFeedback = feedback.filter((f) => f.user_id === u.id);
        const last = own
          .map((n) => n.updated_at)
          .sort()
          .at(-1);
        const lastFeedback = ownFeedback
          .map((f) => f.created_at)
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
          feedback_count: ownFeedback.length,
          last_feedback_at: lastFeedback ?? null,
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
    const { supabaseAdmin, memberIds } = await adminScope(context as never);
    if (data.userId === context.userId && data.role === "admin" && !data.grant) {
      throw new Error("You cannot remove your own admin role.");
    }
    const members = await memberIds();
    if (members && !members.has(data.userId)) {
      throw new Error("This account belongs to another university.");
    }

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

export const setUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        password: z.string().min(8).max(72),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, memberIds } = await adminScope(context as never);
    const members = await memberIds();
    if (members && !members.has(data.userId)) {
      throw new Error("This account belongs to another university.");
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password: data.password,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getFacultyRequests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin, universityId } = await adminScope(context as never);

    let reqQuery = supabaseAdmin
      .from("faculty_requests")
      .select("id, user_id, university_id, department, status, admin_note, created_at, reviewed_at")
      .order("created_at", { ascending: false });
    if (universityId) reqQuery = reqQuery.eq("university_id", universityId);

    const [reqRes, profilesRes, unisRes, usersRes] = await Promise.all([
      reqQuery,
      supabaseAdmin.from("profiles").select("id, full_name"),
      supabaseAdmin.from("universities").select("id, name, email_domain"),
      supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);
    if (reqRes.error) throw new Error(reqRes.error.message);

    const names = new Map((profilesRes.data ?? []).map((p) => [p.id, p.full_name]));
    const unis = new Map((unisRes.data ?? []).map((u) => [u.id, u]));
    const emails = new Map((usersRes.data?.users ?? []).map((u) => [u.id, u.email ?? ""]));

    return (reqRes.data ?? []).map((r) => ({
      ...r,
      full_name: names.get(r.user_id) ?? "",
      email: emails.get(r.user_id) ?? "",
      university: r.university_id ? (unis.get(r.university_id)?.name ?? "") : "",
    }));
  });

export const reviewFacultyRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        requestId: z.string().uuid(),
        approve: z.boolean(),
        note: z.string().max(500).optional().default(""),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, universityId } = await adminScope(context as never);

    const { data: req, error: reqError } = await supabaseAdmin
      .from("faculty_requests")
      .select("id, user_id, university_id")
      .eq("id", data.requestId)
      .maybeSingle();
    if (reqError) throw new Error(reqError.message);
    if (!req) throw new Error("Request not found.");
    if (universityId && req.university_id !== universityId) {
      throw new Error("This request belongs to another university.");
    }

    const { error } = await supabaseAdmin
      .from("faculty_requests")
      .update({
        status: data.approve ? "approved" : "rejected",
        admin_note: data.note ?? "",
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", data.requestId);
    if (error) throw new Error(error.message);

    if (data.approve) {
      const { error: roleError } = await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: req.user_id, role: "faculty" as never }, { onConflict: "user_id,role" });
      if (roleError) throw new Error(roleError.message);
    } else {
      await supabaseAdmin.from("user_roles").delete().eq("user_id", req.user_id).eq("role", "faculty" as never);
    }

    return { ok: true };
  });
