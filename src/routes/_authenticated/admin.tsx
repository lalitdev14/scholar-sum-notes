import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  deleteClass,
  getAdminOverview,
  getFacultyRequests,
  getUserDirectory,
  reviewFacultyRequest,
  setUserPassword,
  setUserRole,
  uploadSubjects,
} from "@/lib/admin.functions";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AuthenticatedHeader } from "@/components/AuthenticatedHeader";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { KeyRound, ShieldCheck, Trash2, Upload } from "lucide-react";



export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Admin panel — LectureLoop" },
      {
        name: "description",
        content: "Monitor class activity, student note contributions and upload the official subject list.",
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

  const fetchOverview = useServerFn(getAdminOverview);
  const upload = useServerFn(uploadSubjects);
  const removeClass = useServerFn(deleteClass);
  const fetchDirectory = useServerFn(getUserDirectory);
  const changeRole = useServerFn(setUserRole);
  const changePassword = useServerFn(setUserPassword);

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

  const fetchRequests = useServerFn(getFacultyRequests);
  const reviewRequest = useServerFn(reviewFacultyRequest);

  const { data: facultyRequests, isPending: requestsPending } = useQuery({
    queryKey: ["admin-faculty-requests"],
    queryFn: () => fetchRequests({ data: undefined as never }),
    enabled: isAdmin,
  });

  const reviewMutation = useMutation({
    mutationFn: (vars: { requestId: string; approve: boolean }) =>
      reviewRequest({ data: { ...vars, note: "" } }),
    onSuccess: () => {
      toast.success("Faculty request updated");
      queryClient.invalidateQueries({ queryKey: ["admin-faculty-requests"] });
      queryClient.invalidateQueries({ queryKey: ["admin-directory"] });
      queryClient.invalidateQueries({ queryKey: ["my-roles"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });



  const roleMutation = useMutation({
    mutationFn: (vars: { userId: string; role: "admin" | "faculty" | "student"; grant: boolean }) =>
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
      toast.success(`${res.inserted} subjects added${res.skipped ? `, ${res.skipped} already existed` : ""}`);
      setRaw("");
      queryClient.invalidateQueries({ queryKey: ["admin-overview"] });
      queryClient.invalidateQueries({ queryKey: ["classes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (classId: string) => removeClass({ data: { classId } }),
    onSuccess: () => {
      toast.success("Class removed");
      queryClient.invalidateQueries({ queryKey: ["admin-overview"] });
      queryClient.invalidateQueries({ queryKey: ["classes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (checkingRole) {
    return <p className="mx-auto max-w-6xl px-6 py-16 text-muted-foreground">Checking access…</p>;
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

      <main className="mx-auto max-w-6xl px-6 py-12">

        <h1 className="text-4xl">Admin panel</h1>
        <p className="mt-1 text-muted-foreground">
          {data?.scope.universityName
            ? `Scoped to ${data.scope.universityName} — you manage only this university's classes and accounts.`
            : "Monitor every class, note contribution and summary refresh across the campus."}
        </p>

        <section className="mt-8 grid gap-4 sm:grid-cols-4">
          {[
            { label: "Classes", value: data?.stats.classes },
            { label: "Notes", value: data?.stats.notes },
            { label: "Students", value: data?.stats.students },
            { label: "Contributors", value: data?.stats.contributors },
          ].map((s) => (
            <div key={s.label} className="surface-paper rounded-xl p-5">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">{s.label}</p>
              <p className="mt-2 text-3xl">{isPending ? "…" : (s.value ?? 0)}</p>
            </div>
          ))}
        </section>

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

        <section className="mt-10">
          <h2 className="text-2xl">Classes</h2>
          <div className="mt-4 grid gap-4">
            {data?.classes.map((c) => (
              <div key={c.id} className="surface-paper flex flex-wrap items-center gap-4 rounded-xl p-5">
                <div className="min-w-52 flex-1">
                  <p className="text-lg">{c.subject}</p>
                  <p className="text-sm text-muted-foreground">
                    {c.code} · {c.professor}
                    {c.term ? ` · ${c.term}` : ""}
                  </p>
                </div>
                <div className="text-sm text-muted-foreground">
                  {c.notes_count} notes · {c.contributors} contributors
                </div>
                <div className="text-xs text-muted-foreground">
                  {c.summary_updated_at
                    ? `Summary updated ${new Date(c.summary_updated_at).toLocaleString()}`
                    : "No summary yet"}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteMutation.mutate(c.id)}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            {!isPending && !data?.classes.length && (
              <p className="text-muted-foreground">No classes yet.</p>
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
          <h2 className="text-2xl">Faculty verification requests</h2>
          <p className="text-sm text-muted-foreground">
            Approve to grant faculty review powers, reject to keep the account student-only.
          </p>
          <div className="mt-4 grid gap-3">
            {facultyRequests?.map((r) => (
              <div key={r.id} className="surface-paper flex flex-wrap items-center gap-4 rounded-xl p-5">
                <div className="min-w-52 flex-1">
                  <p className="text-lg">{r.full_name || r.email || "Unknown"}</p>
                  <p className="text-sm text-muted-foreground">
                    {r.email}
                    {r.department ? ` · ${r.department}` : ""}
                    {r.university ? ` · ${r.university}` : ""}
                  </p>
                </div>
                <Badge variant={r.status === "approved" ? "default" : r.status === "rejected" ? "outline" : "secondary"}>
                  {r.status}
                </Badge>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={reviewMutation.isPending || r.status === "approved"}
                    onClick={() => reviewMutation.mutate({ requestId: r.id, approve: true })}
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={reviewMutation.isPending || r.status === "rejected"}
                    onClick={() => reviewMutation.mutate({ requestId: r.id, approve: false })}
                  >
                    Reject
                  </Button>
                </div>
              </div>
            ))}
            {!requestsPending && !facultyRequests?.length && (
              <p className="text-muted-foreground">No faculty requests yet.</p>
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
                  <th className="p-3">Feedback</th>

                  <th className="p-3">Last sign-in</th>
                  <th className="p-3">Roles</th>
                  <th className="p-3">Password</th>
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
                        {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleDateString() : "never"}
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-1">
                          {(["admin", "faculty", "student"] as const).map((role) => {
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
                    </tr>
                  ))}
                {!directoryPending && !directory?.length && (
                  <tr>
                    <td className="p-3 text-muted-foreground" colSpan={7}>
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

      <Dialog open={Boolean(passwordTarget)} onOpenChange={(open) => !open && setPasswordTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set a new password</DialogTitle>
            <DialogDescription>
              This immediately replaces the password for {passwordTarget?.label}. Share it with them securely.
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
    </div>
  );
}
