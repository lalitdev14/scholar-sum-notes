import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  deleteClasses,
  deleteUserAccount,
  getAdminOverview,
  getUserDirectory,
  setUserPassword,
  setUserRole,
  updateClass,
  uploadSubjects,
} from "@/lib/admin.functions";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { AuthenticatedHeader } from "@/components/AuthenticatedHeader";
import { AnnouncementsAdmin } from "@/components/AnnouncementsAdmin";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { KeyRound, Pencil, ShieldCheck, Trash2, Upload, UserX } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Admin panel — LectureLoop" },
      {
        name: "description",
        content:
          "Monitor class activity, student note contributions and upload the official subject list.",
      },
      { property: "og:title", content: "Admin panel — LectureLoop" },
      { property: "og:description", content: "Monitor activity and manage the subject catalogue." },
    ],
  }),
  component: AdminPanel,
});

const PLACEHOLDER = `Data Structures, CS-221, Dr. Rao, Fall 2026
Linear Algebra, MA-104, Prof. Iyer, Fall 2026`;

function AdminPanel() {
  const { isAdmin, isPending: checkingRole } = useIsAdmin();
  const queryClient = useQueryClient();
  const [raw, setRaw] = useState("");
  const [search, setSearch] = useState("");
  const [passwordTarget, setPasswordTarget] = useState<{ id: string; label: string } | null>(null);
  const [newPassword, setNewPassword] = useState("");
  type ClassForm = {
    classId: string;
    subject: string;
    code: string;
    professor: string;
    term: string;
  };
  const [editTarget, setEditTarget] = useState<ClassForm | null>(null);
  const [classesToDelete, setClassesToDelete] = useState<
    { id: string; label: string; notes: number }[] | null
  >(null);
  const [selectedClasses, setSelectedClasses] = useState<Set<string>>(new Set());
  const [classSearch, setClassSearch] = useState("");
  const [classFilter, setClassFilter] = useState<"all" | "students" | "empty">("all");
  const [userToDelete, setUserToDelete] = useState<{
    id: string;
    label: string;
    notes: number;
  } | null>(null);
  const [confirmText, setConfirmText] = useState("");

  const fetchOverview = useServerFn(getAdminOverview);
  const upload = useServerFn(uploadSubjects);
  const removeClasses = useServerFn(deleteClasses);
  const fetchDirectory = useServerFn(getUserDirectory);
  const changeRole = useServerFn(setUserRole);
  const changePassword = useServerFn(setUserPassword);
  const saveClass = useServerFn(updateClass);
  const removeUser = useServerFn(deleteUserAccount);

  const { data: myUserId } = useQuery({
    queryKey: ["my-user-id"],
    queryFn: async () => (await supabase.auth.getUser()).data.user?.id ?? null,
  });

  const { data, isPending } = useQuery({
    queryKey: ["admin-overview"],
    queryFn: () => fetchOverview({ data: undefined as never }),
    enabled: isAdmin,
  });

  const { data: directory, isPending: directoryPending } = useQuery({
    queryKey: ["admin-directory"],
    queryFn: () => fetchDirectory({ data: undefined as never }),
    enabled: isAdmin,
  });

  const roleMutation = useMutation({
    mutationFn: (vars: { userId: string; role: "admin" | "student"; grant: boolean }) =>
      changeRole({ data: vars }),
    onSuccess: () => {
      toast.success("Roles updated");
      queryClient.invalidateQueries({ queryKey: ["admin-directory"] });
      queryClient.invalidateQueries({ queryKey: ["my-roles"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const passwordMutation = useMutation({
    mutationFn: (vars: { userId: string; password: string }) => changePassword({ data: vars }),
    onSuccess: () => {
      toast.success("Password updated");
      setPasswordTarget(null);
      setNewPassword("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      const rows = raw
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [subject, code, professor, term] = line.split(",").map((p) => (p ?? "").trim());
          if (!subject || !code || !professor) throw new Error(`Invalid line: "${line}"`);
          return { subject, code, professor, term: term ?? "" };
        });
      return upload({ data: { rows } });
    },
    onSuccess: (res) => {
      toast.success(
        `${res.inserted} subjects added${res.skipped ? `, ${res.skipped} already existed` : ""}`,
      );
      setRaw("");
      queryClient.invalidateQueries({ queryKey: ["admin-overview"] });
      queryClient.invalidateQueries({ queryKey: ["classes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const editMutation = useMutation({
    mutationFn: (vars: ClassForm) => saveClass({ data: vars }),
    onSuccess: () => {
      toast.success("Class details updated");
      setEditTarget(null);
      queryClient.invalidateQueries({ queryKey: ["admin-overview"] });
      queryClient.invalidateQueries({ queryKey: ["classes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteUserMutation = useMutation({
    mutationFn: (userId: string) => removeUser({ data: { userId } }),
    onSuccess: () => {
      toast.success("Account and all of its data deleted");
      setUserToDelete(null);
      queryClient.invalidateQueries({ queryKey: ["admin-directory"] });
      queryClient.invalidateQueries({ queryKey: ["admin-overview"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (classIds: string[]) => removeClasses({ data: { classIds } }),
    onSuccess: (res) => {
      setClassesToDelete(null);
      setSelectedClasses(new Set());
      toast.success(`${res.deleted} class${res.deleted === 1 ? "" : "es"} deleted`);
      queryClient.invalidateQueries({ queryKey: ["admin-overview"] });
      queryClient.invalidateQueries({ queryKey: ["classes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const visibleClasses = (data?.classes ?? []).filter((c) => {
    const q = classSearch.trim().toLowerCase();
    if (q && !`${c.subject} ${c.code} ${c.professor} ${c.term ?? ""}`.toLowerCase().includes(q))
      return false;
    if (classFilter === "students" && c.created_by_admin) return false;
    if (classFilter === "empty" && c.notes_count > 0) return false;
    return true;
  });

  if (checkingRole) {
    return (
      <p className="mx-auto max-w-6xl px-4 sm:px-6 py-16 text-muted-foreground">Checking access…</p>
    );
  }

  if (!isAdmin) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-24 text-center">
        <ShieldCheck className="mx-auto h-8 w-8 text-muted-foreground" />
        <h1 className="mt-4 text-3xl">Admin only</h1>
        <p className="mt-2 text-muted-foreground">
          This panel is restricted to administrators. Ask an admin to grant you access.
        </p>
        <Button asChild className="mt-6">
          <Link to="/dashboard">Back to dashboard</Link>
        </Button>
      </main>
    );
  }

  return (
    <div className="min-h-screen">
      <AuthenticatedHeader />

      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-12">
        <h1 className="text-3xl sm:text-4xl">Admin panel</h1>
        <p className="mt-1 text-muted-foreground">
          {data?.scope.universityName
            ? `Scoped to ${data.scope.universityName} — you manage only this university's classes and accounts.`
            : "Monitor every class and student note activity across the campus."}
        </p>

        <section className="mt-8 grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {[
            { label: "Classes", value: data?.stats.classes },
            { label: "Notes", value: data?.stats.notes },
            { label: "Students", value: data?.stats.students },
            { label: "Contributors", value: data?.stats.contributors },
            { label: "Feedback", value: data?.stats.feedback },
          ].map((s) => (
            <div key={s.label} className="surface-paper rounded-xl p-5">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">{s.label}</p>
              <p className="mt-2 text-3xl">{isPending ? "…" : (s.value ?? 0)}</p>
            </div>
          ))}
        </section>

        <AnnouncementsAdmin />

        <section className="surface-paper mt-10 rounded-xl p-6">
          <h2 className="text-2xl">Upload subject list</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            One class per line: subject, subject code, professor, term. Duplicate codes are skipped.
          </p>
          <div className="mt-4 space-y-2">
            <Label htmlFor="bulk">Subjects</Label>
            <Textarea
              id="bulk"
              rows={6}
              value={raw}
              placeholder={PLACEHOLDER}
              onChange={(e) => setRaw(e.target.value)}
            />
          </div>
          <Button
            className="mt-4"
            disabled={!raw.trim() || uploadMutation.isPending}
            onClick={() => uploadMutation.mutate()}
          >
            <Upload className="mr-2 h-4 w-4" />
            {uploadMutation.isPending ? "Uploading…" : "Upload subjects"}
          </Button>
        </section>

        <section className="mt-10" aria-labelledby="classes-heading">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="classes-heading" className="text-2xl">
                Classes
              </h2>
              <p className="text-sm text-muted-foreground">
                Every class in the catalogue, including ones students added. Edit details or delete
                classes added by mistake.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                className="w-56"
                placeholder="Search subject, code, professor"
                aria-label="Search classes"
                value={classSearch}
                onChange={(e) => setClassSearch(e.target.value)}
              />
              <select
                aria-label="Filter classes"
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                value={classFilter}
                onChange={(e) => setClassFilter(e.target.value as "all" | "students" | "empty")}
              >
                <option value="all">All classes</option>
                <option value="students">Added by students</option>
                <option value="empty">No notes yet</option>
              </select>
            </div>
          </div>

          {selectedClasses.size > 0 && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-2 text-sm">
              <span>
                {selectedClasses.size} class{selectedClasses.size === 1 ? "" : "es"} selected
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => setSelectedClasses(new Set())}>
                  Clear
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    const chosen = (data?.classes ?? []).filter((c) => selectedClasses.has(c.id));
                    setClassesToDelete(
                      chosen.map((c) => ({
                        id: c.id,
                        label: `${c.subject} (${c.code})`,
                        notes: c.notes_count,
                      })),
                    );
                  }}
                >
                  <Trash2 className="mr-1.5 h-4 w-4" />
                  Delete selected
                </Button>
              </div>
            </div>
          )}

          <div className="mt-4 grid gap-3">
            {visibleClasses.length > 0 && (
              <label className="flex items-center gap-3 px-1 text-xs text-muted-foreground">
                <Checkbox
                  checked={visibleClasses.every((c) => selectedClasses.has(c.id))}
                  onCheckedChange={(v) => {
                    const next = new Set(selectedClasses);
                    for (const c of visibleClasses) {
                      if (v === true) next.add(c.id);
                      else next.delete(c.id);
                    }
                    setSelectedClasses(next);
                  }}
                  aria-label="Select all shown classes"
                />
                Select all shown ({visibleClasses.length})
              </label>
            )}
            {visibleClasses.map((c) => (
              <div
                key={c.id}
                className="surface-paper grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 rounded-xl p-4 md:grid-cols-[auto_minmax(0,1fr)_12rem_auto]"
              >
                <Checkbox
                  checked={selectedClasses.has(c.id)}
                  onCheckedChange={(v) => {
                    const next = new Set(selectedClasses);
                    if (v === true) next.add(c.id);
                    else next.delete(c.id);
                    setSelectedClasses(next);
                  }}
                  aria-label={`Select ${c.subject}`}
                />
                <div className="min-w-0">
                  <p className="truncate text-lg font-medium">{c.subject}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {c.code} · {c.professor}
                    {c.term ? ` · ${c.term}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    <Badge
                      variant={c.created_by_admin ? "secondary" : "outline"}
                      className="mr-1.5"
                    >
                      {c.created_by_admin ? "Admin" : "Student-added"}
                    </Badge>
                    {c.created_by_name
                      ? `Added by ${c.created_by_name}`
                      : "Added by an admin upload"}
                    {" · "}
                    {new Date(c.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="col-span-3 text-sm text-muted-foreground md:col-span-1 md:text-right">
                  {c.enrolled} enrolled · {c.notes_count} notes
                  <span className="block text-xs">
                    {c.last_note_at
                      ? `Last note ${new Date(c.last_note_at).toLocaleDateString()}`
                      : "No notes yet"}
                  </span>
                </div>
                <div className="col-start-3 row-start-1 flex items-center gap-1 md:col-start-auto md:row-start-auto">
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Edit ${c.subject}`}
                    title="Edit class details"
                    onClick={() =>
                      setEditTarget({
                        classId: c.id,
                        subject: c.subject,
                        code: c.code,
                        professor: c.professor,
                        term: c.term ?? "",
                      })
                    }
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Delete ${c.subject}`}
                    title="Delete class"
                    className="text-destructive hover:text-destructive"
                    onClick={() =>
                      setClassesToDelete([
                        { id: c.id, label: `${c.subject} (${c.code})`, notes: c.notes_count },
                      ])
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
            {!isPending && data?.classes.length === 0 && (
              <p className="text-muted-foreground">No classes yet.</p>
            )}
            {!isPending && (data?.classes.length ?? 0) > 0 && visibleClasses.length === 0 && (
              <p className="text-muted-foreground">No classes match this search.</p>
            )}
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-2xl">Recent note activity</h2>
          <div className="mt-4 grid gap-3">
            {data?.activity.map((a) => (
              <div key={a.id} className="rounded-lg border border-border/70 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span>{a.author}</span>
                  <span className="text-muted-foreground">
                    {new Date(a.updated_at).toLocaleString()} · {a.length} chars
                  </span>
                </div>
                <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{a.excerpt}</p>
              </div>
            ))}
            {!isPending && !data?.activity.length && (
              <p className="text-muted-foreground">No note activity yet.</p>
            )}
          </div>
        </section>

        <section className="mt-10">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-2xl">Student & account directory</h2>
              <p className="text-sm text-muted-foreground">
                Every registered account: email, sign-in method, activity and roles.
              </p>
            </div>
            <Input
              className="max-w-xs"
              placeholder="Search name or email"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="mt-4 overflow-x-auto rounded-xl border border-border/70">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="p-3">Student</th>
                  <th className="p-3">Email</th>
                  <th className="p-3">Sign-in</th>
                  <th className="p-3">Notes</th>

                  <th className="p-3">Last sign-in</th>
                  <th className="p-3">Roles</th>
                  <th className="p-3">Password</th>
                  <th className="p-3">Account</th>
                </tr>
              </thead>
              <tbody>
                {directory
                  ?.filter((u) =>
                    `${u.full_name} ${u.email}`.toLowerCase().includes(search.trim().toLowerCase()),
                  )
                  .map((u) => (
                    <tr key={u.id} className="border-t border-border/60 align-top">
                      <td className="p-3">{u.full_name || "—"}</td>
                      <td className="p-3">
                        {u.email}
                        {!u.email_confirmed && (
                          <Badge variant="outline" className="ml-2">
                            unconfirmed
                          </Badge>
                        )}
                      </td>
                      <td className="p-3 text-muted-foreground">{u.provider}</td>
                      <td className="p-3 text-muted-foreground">{u.notes_count}</td>

                      <td className="p-3 text-muted-foreground">
                        {u.last_sign_in_at
                          ? new Date(u.last_sign_in_at).toLocaleDateString()
                          : "never"}
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-1">
                          {(["admin", "student"] as const).map((role) => {
                            const has = u.roles.includes(role);
                            return (
                              <Button
                                key={role}
                                size="sm"
                                variant={has ? "default" : "outline"}
                                disabled={roleMutation.isPending}
                                onClick={() =>
                                  roleMutation.mutate({ userId: u.id, role, grant: !has })
                                }
                              >
                                {role}
                              </Button>
                            );
                          })}
                        </div>
                      </td>
                      <td className="p-3">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setPasswordTarget({ id: u.id, label: u.full_name || u.email });
                            setNewPassword("");
                          }}
                        >
                          <KeyRound className="mr-1.5 h-3.5 w-3.5" />
                          Reset
                        </Button>
                      </td>
                      <td className="p-3">
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive hover:text-destructive"
                          disabled={u.id === myUserId}
                          title={
                            u.id === myUserId
                              ? "You cannot delete your own account"
                              : "Delete this account"
                          }
                          onClick={() => {
                            setUserToDelete({
                              id: u.id,
                              label: u.full_name ? `${u.full_name} (${u.email})` : u.email,
                              notes: u.notes_count,
                            });
                            setConfirmText("");
                          }}
                        >
                          <UserX className="mr-1.5 h-3.5 w-3.5" />
                          Delete
                        </Button>
                      </td>
                    </tr>
                  ))}
                {!directoryPending && !directory?.length && (
                  <tr>
                    <td className="p-3 text-muted-foreground" colSpan={8}>
                      No accounts yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {directoryPending && <p className="p-3 text-muted-foreground">Loading accounts…</p>}
          </div>
        </section>
      </main>

      <Dialog
        open={Boolean(passwordTarget)}
        onOpenChange={(open) => !open && setPasswordTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set a new password</DialogTitle>
            <DialogDescription>
              This immediately replaces the password for {passwordTarget?.label}. Share it with them
              securely.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              type="text"
              value={newPassword}
              minLength={8}
              placeholder="At least 8 characters"
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <Button
            disabled={newPassword.trim().length < 8 || passwordMutation.isPending}
            onClick={() =>
              passwordTarget &&
              passwordMutation.mutate({ userId: passwordTarget.id, password: newPassword })
            }
          >
            {passwordMutation.isPending ? "Updating…" : "Update password"}
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editTarget)} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit class details</DialogTitle>
            <DialogDescription>
              Changes are visible to every student enrolled in this class.
            </DialogDescription>
          </DialogHeader>
          {editTarget && (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                editMutation.mutate(editTarget);
              }}
            >
              {(
                [
                  ["subject", "Subject", "e.g. Data Structures"],
                  ["code", "Class code", "e.g. CS-221"],
                  ["professor", "Professor", "e.g. Prof. Menon"],
                  ["term", "Term", "e.g. Fall 2026 (optional)"],
                ] as const
              ).map(([field, label, placeholder]) => (
                <div key={field} className="space-y-2">
                  <Label htmlFor={`edit-${field}`}>{label}</Label>
                  <Input
                    id={`edit-${field}`}
                    value={editTarget[field]}
                    placeholder={placeholder}
                    required={field !== "term"}
                    maxLength={field === "code" ? 50 : field === "term" ? 100 : 200}
                    onChange={(e) => setEditTarget({ ...editTarget, [field]: e.target.value })}
                  />
                </div>
              ))}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setEditTarget(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={editMutation.isPending}>
                  {editMutation.isPending ? "Saving…" : "Save changes"}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(classesToDelete)}
        onOpenChange={(open) => !open && setClassesToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {classesToDelete?.length === 1
                ? `Delete ${classesToDelete[0]?.label}?`
                : `Delete ${classesToDelete?.length ?? 0} classes?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes{" "}
              {classesToDelete?.length === 1 ? "the class" : "these classes"} for everyone,
              including{" "}
              <strong>
                {(classesToDelete ?? []).reduce((n, c) => n + c.notes, 0)} student note(s)
              </strong>
              , enrollments, uploaded slides and handwriting. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {classesToDelete && classesToDelete.length > 1 && (
            <ul className="max-h-40 list-disc overflow-y-auto pl-5 text-sm text-muted-foreground">
              {classesToDelete.map((c) => (
                <li key={c.id}>
                  {c.label}
                  {c.notes ? ` — ${c.notes} note(s)` : ""}
                </li>
              ))}
            </ul>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (classesToDelete) deleteMutation.mutate(classesToDelete.map((c) => c.id));
              }}
            >
              {deleteMutation.isPending
                ? "Deleting…"
                : classesToDelete?.length === 1
                  ? "Delete class"
                  : `Delete ${classesToDelete?.length ?? 0} classes`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(userToDelete)}
        onOpenChange={(open) => !open && setUserToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this account permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{userToDelete?.label}</strong> will be removed along with all of their data:{" "}
              {userToDelete?.notes ?? 0} note(s) and AI summaries, uploaded slides and handwriting,
              bookmarks, enrollments, feedback and roles. They will no longer be able to sign in.
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="confirm-delete">
              Type <strong>DELETE</strong> to confirm
            </Label>
            <Input
              id="confirm-delete"
              value={confirmText}
              autoComplete="off"
              onChange={(e) => setConfirmText(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteUserMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={confirmText !== "DELETE" || deleteUserMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (userToDelete) deleteUserMutation.mutate(userToDelete.id);
              }}
            >
              {deleteUserMutation.isPending ? "Deleting…" : "Delete account"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
