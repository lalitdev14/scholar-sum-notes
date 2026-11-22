import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { noteToPlainText } from "@/lib/note-format";
import { slideStorageFiles } from "@/lib/slide-copy-path";

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin access required.");
}

/**
 * Admins are scoped to their own university. The super admin (and an admin
 * whose profile has no university) sees everything.
 */
async function adminScope(context: { supabase: any; userId: string; claims?: { email?: string } }) {
  await assertAdmin(context);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [{ data, error }, { data: superRow }] = await Promise.all([
    supabaseAdmin.from("profiles").select("university_id").eq("id", context.userId).maybeSingle(),
    supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "super_admin")
      .maybeSingle(),
  ]);
  if (error) throw new Error(error.message);
  const isSuper = Boolean(superRow);
  const universityId = isSuper ? null : (data?.university_id ?? null);

  const memberIds = async () => {
    if (!universityId) return null; // null = every user
    const { data: rows, error: err } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("university_id", universityId);
    if (err) throw new Error(err.message);
    return new Set((rows ?? []).map((r) => r.id));
  };

  /** Roles of another account, to stop admins from managing admins. */
  const rolesOf = async (userId: string) => {
    const { data: rows, error: err } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (err) throw new Error(err.message);
    return new Set((rows ?? []).map((r) => r.role as string));
  };

  /** Only the super admin may act on admin or super admin accounts. */
  const assertCanManageAccount = async (userId: string) => {
    const roles = await rolesOf(userId);
    if (roles.has("super_admin"))
      throw new Error("The super admin account can't be changed from the admin panel.");
    if (roles.has("admin") && !isSuper)
      throw new Error("Only the super admin can manage other admin accounts.");
  };

  /** Email of an account, for readable audit entries. */
  const emailOf = async (userId: string) => {
    const { data: u } = await supabaseAdmin.auth.admin.getUserById(userId);
    return u?.user?.email ?? userId;
  };

  /** Records an admin action. Never blocks the action itself if logging fails. */
  const audit = async (action: string, target: string, details: Record<string, unknown> = {}) => {
    const { error: logError } = await supabaseAdmin.from("admin_audit_log").insert({
      actor_id: context.userId,
      actor_email: context.claims?.email ?? null,
      action,
      target,
      details: details as never,
    });
    if (logError) console.error("[admin-audit]", logError.message);
  };

  return {
    supabaseAdmin,
    universityId,
    memberIds,
    isSuper,
    assertCanManageAccount,
    emailOf,
    audit,
  };
}

function assertSuper(scope: { isSuper: boolean }) {
  if (!scope.isSuper) throw new Error("Only the super admin can do this.");
}

export const getAdminOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin, universityId, memberIds } = await adminScope(context as never);
    const members = await memberIds();

    let classQuery = supabaseAdmin
      .from("classes")
      .select("id, subject, professor, code, term, created_at, university_id, created_by")
      .is("deleted_at", null)
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
    const { supabaseAdmin, universityId, audit } = await adminScope(context as never);

    let existingQuery = supabaseAdmin
      .from("classes")
      .select("code, university_id")
      .is("deleted_at", null);
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

    await audit("classes.import", `${fresh.length} classes`, {
      inserted: fresh.length,
      skipped: data.rows.length - fresh.length,
      codes: fresh.slice(0, 50).map((r) => r.code.trim()),
    });
    return { inserted: fresh.length, skipped: data.rows.length - fresh.length };
  });

/** University admins may manage their own university's classes and unassigned ones. */
function canManageClass(adminUniversityId: string | null, classUniversityId: string | null) {
  return !adminUniversityId || !classUniversityId || classUniversityId === adminUniversityId;
}

const ClassIds = z.object({ classIds: z.array(z.string().uuid()).min(1).max(200) });

/** Loads classes the admin may manage; `deleted` selects active or Recently deleted ones. */
async function manageableClasses(
  scope: Awaited<ReturnType<typeof adminScope>>,
  ids: string[],
  deleted: boolean,
) {
  let query = scope.supabaseAdmin
    .from("classes")
    .select("id, university_id, code, subject")
    .in("id", ids);
  query = deleted ? query.not("deleted_at", "is", null) : query.is("deleted_at", null);
  const { data: targets, error } = await query;
  if (error) throw new Error(error.message);
  if ((targets ?? []).length !== ids.length)
    throw new Error("One or more classes have changed. Refresh and try again.");
  if ((targets ?? []).some((t) => !canManageClass(scope.universityId, t.university_id))) {
    throw new Error("One or more classes belong to another university.");
  }
  return targets ?? [];
}

/**
 * "Deletes" classes by moving them to Recently deleted: hidden from students, but notes,
 * slides, transcripts and enrollments are kept so an admin can restore them.
 */
export const deleteClasses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ClassIds.parse(input))
  .handler(async ({ data, context }) => {
    const scope = await adminScope(context as never);
    const ids = [...new Set(data.classIds)];
    const targets = await manageableClasses(scope, ids, false);
    const { error } = await scope.supabaseAdmin
      .from("classes")
      .update({ deleted_at: new Date().toISOString(), deleted_by: context.userId })
      .in("id", ids);
    if (error) throw new Error(error.message);
    await scope.audit("classes.trash", `${ids.length} classes`, {
      classes: targets.map((t) => `${t.code} ${t.subject}`),
    });
    return { deleted: ids.length };
  });

/** Single-class version of deleteClasses (moves the class to Recently deleted). */
export const deleteClass = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ classId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const scope = await adminScope(context as never);
    const [target] = await manageableClasses(scope, [data.classId], false);
    const { error } = await scope.supabaseAdmin
      .from("classes")
      .update({ deleted_at: new Date().toISOString(), deleted_by: context.userId })
      .eq("id", data.classId);
    if (error) throw new Error(error.message);
    await scope.audit("classes.trash", `${target!.code} ${target!.subject}`);
    return { ok: true };
  });

/** Classes in Recently deleted, with what restoring them would bring back. */
export const getDeletedClasses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin, universityId } = await adminScope(context as never);
    let query = supabaseAdmin
      .from("classes")
      .select("id, subject, code, professor, term, university_id, deleted_at, deleted_by")
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false });
    if (universityId) query = query.or(`university_id.eq.${universityId},university_id.is.null`);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    const ids = (rows ?? []).map((r) => r.id);
    if (!ids.length) return [];

    const [enrollRes, notesRes, slidesRes, namesRes] = await Promise.all([
      supabaseAdmin.from("enrollments").select("class_id").in("class_id", ids),
      supabaseAdmin.from("notes").select("class_id").in("class_id", ids),
      supabaseAdmin.from("lecture_slides").select("class_id").in("class_id", ids),
      supabaseAdmin
        .from("profiles")
        .select("id, full_name")
        .in(
          "id",
          (rows ?? []).map((r) => r.deleted_by).filter((x): x is string => Boolean(x)),
        ),
    ]);
    const count = (list: { class_id: string }[] | null, id: string) =>
      (list ?? []).filter((x) => x.class_id === id).length;
    const names = new Map((namesRes.data ?? []).map((p) => [p.id, p.full_name]));

    // A class can't be restored while an active class uses the same code.
    const { data: active } = await supabaseAdmin
      .from("classes")
      .select("code")
      .is("deleted_at", null)
      .in(
        "code",
        (rows ?? []).map((r) => r.code),
      );
    const taken = new Set((active ?? []).map((a) => a.code));

    return (rows ?? []).map((r) => ({
      id: r.id,
      subject: r.subject,
      code: r.code,
      professor: r.professor,
      term: r.term,
      deleted_at: r.deleted_at as string,
      deleted_by_name: r.deleted_by ? (names.get(r.deleted_by) ?? "an admin") : "an admin",
      enrolled: count(enrollRes.data, r.id),
      notes: count(notesRes.data, r.id),
      slides: count(slidesRes.data, r.id),
      code_taken: taken.has(r.code),
    }));
  });

/** Brings classes back from Recently deleted, exactly as they were, for every student. */
export const restoreClasses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ClassIds.parse(input))
  .handler(async ({ data, context }) => {
    const scope = await adminScope(context as never);
    const ids = [...new Set(data.classIds)];
    const targets = await manageableClasses(scope, ids, true);

    const { data: clash, error: clashError } = await scope.supabaseAdmin
      .from("classes")
      .select("code")
      .is("deleted_at", null)
      .in(
        "code",
        targets.map((t) => t.code),
      );
    if (clashError) throw new Error(clashError.message);
    if (clash && clash.length) {
      throw new Error(
        `Another active class already uses the code ${clash.map((c) => `"${c.code}"`).join(", ")}. Rename or delete it first.`,
      );
    }

    const { error } = await scope.supabaseAdmin
      .from("classes")
      .update({ deleted_at: null, deleted_by: null })
      .in("id", ids);
    if (error) throw new Error(error.message);
    await scope.audit("classes.restore", `${ids.length} classes`, {
      classes: targets.map((t) => `${t.code} ${t.subject}`),
    });
    return { restored: ids.length };
  });

/**
 * Permanently deletes classes from Recently deleted with everything in them: files in
 * storage, notes, then the class rows (which cascade to enrollments, slides, transcripts…).
 */
export const purgeClasses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ClassIds.parse(input))
  .handler(async ({ data, context }) => {
    const scope = await adminScope(context as never);
    const { supabaseAdmin } = scope;
    const ids = [...new Set(data.classIds)];
    const targets = await manageableClasses(scope, ids, true);

    const [{ data: slides }, { data: pages }] = await Promise.all([
      supabaseAdmin.from("lecture_slides").select("file_path").in("class_id", ids),
      supabaseAdmin.from("handwriting_pages").select("image_path").in("class_id", ids),
    ]);
    const slidePaths = (slides ?? []).flatMap((x) => slideStorageFiles(x.file_path));
    const pagePaths = (pages ?? []).map((x) => x.image_path);
    for (let i = 0; i < slidePaths.length; i += 100) {
      await supabaseAdmin.storage.from("lecture-slides").remove(slidePaths.slice(i, i + 100));
    }
    for (let i = 0; i < pagePaths.length; i += 100) {
      await supabaseAdmin.storage.from("handwriting").remove(pagePaths.slice(i, i + 100));
    }
    // Saved lecture recordings live at lecture-audio/<user>/<class>/…
    const { data: audioOwners } = await supabaseAdmin
      .from("audio_transcripts")
      .select("user_id, class_id")
      .in("class_id", ids);
    const folders = [...new Set((audioOwners ?? []).map((r) => `${r.user_id}/${r.class_id}`))];
    for (const folder of folders) {
      const { data: files } = await supabaseAdmin.storage
        .from("lecture-audio")
        .list(folder, { limit: 1000 });
      if (files?.length)
        await supabaseAdmin.storage
          .from("lecture-audio")
          .remove(files.map((f: { name: string }) => `${folder}/${f.name}`));
    }

    const { error: notesError } = await supabaseAdmin.from("notes").delete().in("class_id", ids);
    if (notesError) throw new Error(notesError.message);
    const { error } = await supabaseAdmin.from("classes").delete().in("id", ids);
    if (error) throw new Error(error.message);
    await scope.audit("classes.purge", `${ids.length} classes`, {
      classes: targets.map((t) => `${t.code} ${t.subject}`),
      files: slidePaths.length + pagePaths.length,
    });
    return { deleted: ids.length, files: slidePaths.length + pagePaths.length };
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
    const scope = await adminScope(context as never);
    const { supabaseAdmin, memberIds } = scope;
    if (data.userId === context.userId && data.role === "admin" && !data.grant) {
      throw new Error("You cannot remove your own admin role.");
    }
    if (data.role === "admin") assertSuper(scope);
    if (data.userId !== context.userId) await scope.assertCanManageAccount(data.userId);
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
    await scope.audit(data.grant ? "role.grant" : "role.revoke", await scope.emailOf(data.userId), {
      role: data.role,
    });
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
    const scope = await adminScope(context as never);
    const { supabaseAdmin, memberIds } = scope;
    const members = await memberIds();
    if (members && !members.has(data.userId)) {
      throw new Error("This account belongs to another university.");
    }
    if (data.userId !== context.userId) await scope.assertCanManageAccount(data.userId);

    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password: data.password,
    });
    if (error) throw new Error(error.message);
    await scope.audit("account.password_reset", await scope.emailOf(data.userId));
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
    const { supabaseAdmin, universityId, audit } = await adminScope(context as never);

    const { data: target, error: targetError } = await supabaseAdmin
      .from("classes")
      .select("id, university_id, subject, code, professor, term")
      .eq("id", data.classId)
      .is("deleted_at", null)
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
      .neq("id", data.classId)
      .is("deleted_at", null);
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
    await audit("class.update", `${data.code} ${data.subject}`, {
      before: {
        subject: target.subject,
        code: target.code,
        professor: target.professor,
        term: target.term,
      },
      after: { subject: data.subject, code: data.code, professor: data.professor, term: data.term },
    });
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
    const scope = await adminScope(context as never);
    const { supabaseAdmin, memberIds } = scope;
    if (data.userId === context.userId) throw new Error("You cannot delete your own account.");
    await scope.assertCanManageAccount(data.userId);
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
      (await removeUserFiles(supabaseAdmin, "handwriting", data.userId)) +
      // Lecture recordings (skipped if audio storage was never set up).
      (await removeUserFiles(supabaseAdmin, "lecture-audio", data.userId).catch((e: Error) =>
        /not found/i.test(e.message) ? 0 : Promise.reject(e),
      ));

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

    // Deleting the auth user cascades to profile, roles, enrollments, slides, bookmarks,
    // handwriting pages, transcripts, feedback, faculty requests and update reads.
    const email = await scope.emailOf(data.userId);
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    await scope.audit("account.delete", email, { files });
    return { ok: true, files };
  });

/** Who may register: allowed NYU email domains and individually allowed emails (super admin only). */
export const getRegistrationSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const scope = await adminScope(context as never);
    const [domains, emails] = await Promise.all([
      scope.supabaseAdmin
        .from("allowed_email_domains")
        .select("domain, created_at")
        .order("domain"),
      scope.supabaseAdmin
        .from("registration_allowlist")
        .select("email, note, created_at")
        .order("email"),
    ]);
    if (domains.error) throw new Error(domains.error.message);
    if (emails.error) throw new Error(emails.error.message);
    return { isSuper: scope.isSuper, domains: domains.data ?? [], emails: emails.data ?? [] };
  });

const RegistrationChange = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("domain"),
    action: z.enum(["add", "remove"]),
    value: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, "Enter a domain like nyu.edu"),
  }),
  z.object({
    kind: z.literal("email"),
    action: z.enum(["add", "remove"]),
    value: z.string().trim().toLowerCase().email(),
    note: z.string().trim().max(200).optional(),
  }),
]);

export const updateRegistrationSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RegistrationChange.parse(input))
  .handler(async ({ data, context }) => {
    const scope = await adminScope(context as never);
    assertSuper(scope);
    const db = scope.supabaseAdmin;
    if (data.kind === "domain") {
      if (data.action === "add") {
        const { data: nyu } = await db
          .from("universities")
          .select("id")
          .eq("email_domain", "nyu.edu")
          .maybeSingle();
        const { error } = await db
          .from("allowed_email_domains")
          .upsert({ domain: data.value, university_id: nyu?.id ?? null });
        if (error) throw new Error(error.message);
      } else {
        const { count } = await db
          .from("allowed_email_domains")
          .select("domain", { count: "exact", head: true });
        if ((count ?? 0) <= 1) throw new Error("Keep at least one allowed domain.");
        const { error } = await db.from("allowed_email_domains").delete().eq("domain", data.value);
        if (error) throw new Error(error.message);
      }
    } else if (data.action === "add") {
      const { error } = await db
        .from("registration_allowlist")
        .upsert({ email: data.value, note: data.note ?? "" });
      if (error) throw new Error(error.message);
    } else {
      const { error } = await db.from("registration_allowlist").delete().eq("email", data.value);
      if (error) throw new Error(error.message);
    }
    await scope.audit(`registration.${data.kind}.${data.action}`, data.value);
    return { ok: true };
  });

/** Pro plan: open upgrade requests and current Pro members (within the admin's university). */
export const getProPlans = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin, memberIds } = await adminScope(context as never);
    const members = await memberIds();
    const [{ data: requests, error: reqError }, { data: plans, error: planError }] =
      await Promise.all([
        supabaseAdmin
          .from("pro_requests")
          .select("id, user_id, created_at")
          .eq("status", "pending")
          .order("created_at", { ascending: true })
          .limit(200),
        supabaseAdmin
          .from("user_plans")
          .select("user_id, updated_at")
          .eq("plan", "pro")
          .order("updated_at", { ascending: false })
          .limit(500),
      ]);
    if (reqError) throw new Error(reqError.message);
    if (planError) throw new Error(planError.message);
    const inScope = (id: string) => !members || members.has(id);
    const ids = [
      ...new Set([...(requests ?? []), ...(plans ?? [])].map((r) => r.user_id).filter(inScope)),
    ];
    const { data: profiles } = ids.length
      ? await supabaseAdmin.from("profiles").select("id, full_name").in("id", ids)
      : { data: [] as { id: string; full_name: string | null }[] };
    const nameOf = new Map((profiles ?? []).map((p) => [p.id, p.full_name ?? ""]));
    const emails = new Map<string, string>();
    await Promise.all(
      ids.map(async (id) => {
        const { data: u } = await supabaseAdmin.auth.admin.getUserById(id);
        emails.set(id, u?.user?.email ?? "");
      }),
    );
    const person = (id: string) => ({ name: nameOf.get(id) ?? "", email: emails.get(id) ?? "" });
    return {
      requests: (requests ?? [])
        .filter((r) => inScope(r.user_id))
        .map((r) => ({
          id: r.id,
          userId: r.user_id,
          createdAt: r.created_at,
          ...person(r.user_id),
        })),
      pro: (plans ?? [])
        .filter((r) => inScope(r.user_id))
        .map((r) => ({ userId: r.user_id, since: r.updated_at, ...person(r.user_id) })),
    };
  });

/** Approve or decline a student's request for Pro. */
export const handleProRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; approve: boolean }) => {
    if (typeof d?.id !== "string" || !/^[0-9a-f-]{36}$/i.test(d.id)) throw new Error("Bad request");
    return { id: d.id, approve: Boolean(d.approve) };
  })
  .handler(async ({ data, context }) => {
    const scope = await adminScope(context as never);
    const { supabaseAdmin } = scope;
    const { data: req, error } = await supabaseAdmin
      .from("pro_requests")
      .select("id, user_id, status")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!req || req.status !== "pending") throw new Error("This request was already handled.");
    const members = await scope.memberIds();
    if (members && !members.has(req.user_id))
      throw new Error("This account belongs to another university.");
    const now = new Date().toISOString();
    if (data.approve) {
      const { error: planError } = await supabaseAdmin
        .from("user_plans")
        .upsert({ user_id: req.user_id, plan: "pro", updated_at: now, updated_by: context.userId });
      if (planError) throw new Error(planError.message);
    }
    const { error: updError } = await supabaseAdmin
      .from("pro_requests")
      .update({
        status: data.approve ? "approved" : "declined",
        handled_at: now,
        handled_by: context.userId,
      })
      .eq("id", req.id);
    if (updError) throw new Error(updError.message);
    await scope.audit(
      data.approve ? "plan.pro_approve" : "plan.pro_decline",
      await scope.emailOf(req.user_id),
    );
    return { ok: true };
  });

/** Switch an account between Free and Pro directly. */
export const setUserPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; plan: "free" | "pro" }) => {
    if (typeof d?.userId !== "string" || !/^[0-9a-f-]{36}$/i.test(d.userId))
      throw new Error("Bad request");
    if (d.plan !== "free" && d.plan !== "pro") throw new Error("Bad request");
    return { userId: d.userId, plan: d.plan };
  })
  .handler(async ({ data, context }) => {
    const scope = await adminScope(context as never);
    const members = await scope.memberIds();
    if (members && !members.has(data.userId))
      throw new Error("This account belongs to another university.");
    const now = new Date().toISOString();
    const { error } = await scope.supabaseAdmin.from("user_plans").upsert({
      user_id: data.userId,
      plan: data.plan,
      updated_at: now,
      updated_by: context.userId,
    });
    if (error) throw new Error(error.message);
    if (data.plan === "pro") {
      // Granting Pro also closes any open request.
      await scope.supabaseAdmin
        .from("pro_requests")
        .update({ status: "approved", handled_at: now, handled_by: context.userId })
        .eq("user_id", data.userId)
        .eq("status", "pending");
    }
    await scope.audit(`plan.set_${data.plan}`, await scope.emailOf(data.userId));
    return { ok: true };
  });
