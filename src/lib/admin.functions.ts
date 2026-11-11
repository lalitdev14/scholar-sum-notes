import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { noteToPlainText } from "@/lib/note-format";

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
      .select("id, subject, professor, code, term, created_at, university_id, created_by")
      .order("subject");
    // University admins manage their university's classes plus unassigned ones
    // (classes students add without a university are visible to everyone).
    if (universityId)
      classQuery = classQuery.or(`university_id.eq.${universityId},university_id.is.null`);

    let profileQuery = supabaseAdmin.from("profiles").select("id, full_name, university_id");
    if (universityId) profileQuery = profileQuery.eq("university_id", universityId);

    const [
      classesRes,
      notesRes,
      profilesRes,
      universityRes,
      feedbackRes,
      enrollRes,
      allNamesRes,
      adminRolesRes,
    ] = await Promise.all([
      classQuery,
      supabaseAdmin
        .from("notes")
        .select("id, class_id, user_id, content, updated_at")
        .order("updated_at", { ascending: false })
        .limit(500),
      profileQuery,
      universityId
        ? supabaseAdmin.from("universities").select("id, name").eq("id", universityId).maybeSingle()
        : Promise.resolve({ data: null, error: null } as never),
      supabaseAdmin.from("feedback").select("user_id"),
      supabaseAdmin.from("enrollments").select("class_id"),
      supabaseAdmin.from("profiles").select("id, full_name"),
      supabaseAdmin.from("user_roles").select("user_id").eq("role", "admin"),
    ]);

    if (classesRes.error) throw new Error(classesRes.error.message);
    if (notesRes.error) throw new Error(notesRes.error.message);
    if (profilesRes.error) throw new Error(profilesRes.error.message);

    const classIds = new Set((classesRes.data ?? []).map((c) => c.id));
    const names = new Map((profilesRes.data ?? []).map((p) => [p.id, p.full_name]));
    const notes = (notesRes.data ?? []).filter(
      (n) => classIds.has(n.class_id) && (!members || members.has(n.user_id)),
    );

    const allNames = new Map((allNamesRes.data ?? []).map((p) => [p.id, p.full_name]));
    const adminIds = new Set((adminRolesRes.data ?? []).map((r) => r.user_id));
    const enrolled = new Map<string, number>();
    for (const e of enrollRes.data ?? [])
      enrolled.set(e.class_id, (enrolled.get(e.class_id) ?? 0) + 1);

    const classes = (classesRes.data ?? []).map((c) => {
      const classNotes = notes.filter((n) => n.class_id === c.id);
      return {
        ...c,
        created_by_name: c.created_by ? allNames.get(c.created_by) || "Unknown user" : null,
        created_by_admin: c.created_by ? adminIds.has(c.created_by) : true,
        enrolled: enrolled.get(c.id) ?? 0,
        notes_count: classNotes.length,
        contributors: new Set(classNotes.map((n) => n.user_id)).size,
        last_note_at: classNotes[0]?.updated_at ?? null,
      };
    });

    const activity = notes.slice(0, 40).map((n) => ({
      id: n.id,
      class_id: n.class_id,
      author: names.get(n.user_id) ?? "Unknown student",
      updated_at: n.updated_at,
      excerpt: noteToPlainText(n.content).slice(0, 160),
      length: noteToPlainText(n.content).length,
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
        feedback: (feedbackRes.data ?? []).filter((f) => !members || members.has(f.user_id)).length,
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
  .inputValidator((input: unknown) =>
    z.object({ rows: z.array(SubjectRow).min(1).max(500) }).parse(input),
  )
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

/** University admins may manage their own university's classes and unassigned ones. */
function canManageClass(adminUniversityId: string | null, classUniversityId: string | null) {
  return !adminUniversityId || !classUniversityId || classUniversityId === adminUniversityId;
}

/** Deletes classes with everything in them: files in storage, notes, then the class rows (cascades). */
export const deleteClasses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ classIds: z.array(z.string().uuid()).min(1).max(200) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, universityId } = await adminScope(context as never);
    const ids = [...new Set(data.classIds)];

    const { data: targets, error: targetError } = await supabaseAdmin
      .from("classes")
      .select("id, university_id")
      .in("id", ids);
    if (targetError) throw new Error(targetError.message);
    if ((targets ?? []).length !== ids.length)
      throw new Error("One or more classes no longer exist. Refresh and try again.");
    if ((targets ?? []).some((t) => !canManageClass(universityId, t.university_id))) {
      throw new Error("One or more classes belong to another university.");
    }

    // Uploaded files are not removed by database cascades.
    const [{ data: slides }, { data: pages }] = await Promise.all([
      supabaseAdmin.from("lecture_slides").select("file_path").in("class_id", ids),
      supabaseAdmin.from("handwriting_pages").select("image_path").in("class_id", ids),
    ]);
    const slidePaths = (slides ?? []).map((x) => x.file_path);
    const pagePaths = (pages ?? []).map((x) => x.image_path);
    for (let i = 0; i < slidePaths.length; i += 100) {
      await supabaseAdmin.storage.from("lecture-slides").remove(slidePaths.slice(i, i + 100));
    }
    for (let i = 0; i < pagePaths.length; i += 100) {
      await supabaseAdmin.storage.from("handwriting").remove(pagePaths.slice(i, i + 100));
    }

    const { error: notesError } = await supabaseAdmin.from("notes").delete().in("class_id", ids);
    if (notesError) throw new Error(notesError.message);
    // Cascades to enrollments, slides, bookmarks, handwriting pages and old summaries.
    const { error } = await supabaseAdmin.from("classes").delete().in("id", ids);
    if (error) throw new Error(error.message);
    return { deleted: ids.length, files: slidePaths.length + pagePaths.length };
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
    if (!canManageClass(universityId, target.university_id)) {
      throw new Error("This class belongs to another university.");
    }

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
        role: z.enum(["admin", "student"]),
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

const ClassEdit = z.object({
  classId: z.string().uuid(),
  subject: z.string().trim().min(1).max(200),
  code: z.string().trim().min(1).max(50),
  professor: z.string().trim().min(1).max(200),
  term: z.string().trim().max(100).default(""),
});

export const updateClass = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ClassEdit.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, universityId } = await adminScope(context as never);

    const { data: target, error: targetError } = await supabaseAdmin
      .from("classes")
      .select("id, university_id")
      .eq("id", data.classId)
      .maybeSingle();
    if (targetError) throw new Error(targetError.message);
    if (!target) throw new Error("Class not found.");
    if (!canManageClass(universityId, target.university_id)) {
      throw new Error("This class belongs to another university.");
    }

    // Class codes must stay unique (case-insensitive) within the same university.
    let dupQuery = supabaseAdmin
      .from("classes")
      .select("id")
      .ilike("code", data.code)
      .neq("id", data.classId);
    dupQuery = target.university_id
      ? dupQuery.eq("university_id", target.university_id)
      : dupQuery.is("university_id", null);
    const { data: dup, error: dupError } = await dupQuery.limit(1);
    if (dupError) throw new Error(dupError.message);
    if (dup && dup.length) throw new Error(`Another class already uses the code "${data.code}".`);

    const { error } = await supabaseAdmin
      .from("classes")
      .update({
        subject: data.subject,
        code: data.code,
        professor: data.professor,
        term: data.term,
      })
      .eq("id", data.classId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Removes every file under `<userId>/` in a storage bucket (files live at <userId>/<classId>/<file>). */
async function removeUserFiles(supabaseAdmin: any, bucket: string, userId: string) {
  const paths: string[] = [];
  const walk = async (prefix: string, depth: number) => {
    const { data: items, error } = await supabaseAdmin.storage
      .from(bucket)
      .list(prefix, { limit: 1000 });
    if (error) throw new Error(`${bucket}: ${error.message}`);
    for (const item of items ?? []) {
      const path = `${prefix}/${item.name}`;
      if (item.id)
        paths.push(path); // a file
      else if (depth < 3) await walk(path, depth + 1); // a folder
    }
  };
  await walk(userId, 0);
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await supabaseAdmin.storage.from(bucket).remove(paths.slice(i, i + 100));
    if (error) throw new Error(`${bucket}: ${error.message}`);
  }
  return paths.length;
}

export const deleteUserAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, memberIds } = await adminScope(context as never);
    if (data.userId === context.userId) throw new Error("You cannot delete your own account.");
    const members = await memberIds();
    if (members && !members.has(data.userId)) {
      throw new Error("This account belongs to another university.");
    }

    const { data: roles, error: rolesError } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");
    if (rolesError) throw new Error(rolesError.message);
    const adminIds = new Set((roles ?? []).map((r) => r.user_id));
    if (adminIds.has(data.userId) && adminIds.size <= 1) {
      throw new Error("This is the last admin account and cannot be deleted.");
    }

    // Uploaded files first (storage is not covered by database cascades).
    const files =
      (await removeUserFiles(supabaseAdmin, "lecture-slides", data.userId)) +
      (await removeUserFiles(supabaseAdmin, "handwriting", data.userId));

    // notes.user_id has no foreign key to auth.users, so delete notes explicitly.
    const { error: notesError } = await supabaseAdmin
      .from("notes")
      .delete()
      .eq("user_id", data.userId);
    if (notesError) throw new Error(notesError.message);

    // Clear reviewer references that would otherwise point at a deleted account.
    await supabaseAdmin
      .from("faculty_requests")
      .update({ reviewed_by: null })
      .eq("reviewed_by", data.userId);
    await supabaseAdmin
      .from("class_summaries")
      .update({ reviewed_by: null })
      .eq("reviewed_by", data.userId);

    // Deleting the auth user cascades to profile, roles, enrollments, slides, bookmarks,
    // handwriting pages, feedback, faculty requests and update reads.
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true, files };
  });
