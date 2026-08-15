import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  deleteClass,
  getAdminOverview,
  getUserDirectory,
  setUserRole,
  uploadSubjects,
} from "@/lib/admin.functions";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BadgeCheck, GraduationCap, ShieldCheck, Trash2, Upload } from "lucide-react";


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

  const fetchOverview = useServerFn(getAdminOverview);
  const upload = useServerFn(uploadSubjects);
  const removeClass = useServerFn(deleteClass);
  const fetchDirectory = useServerFn(getUserDirectory);
  const changeRole = useServerFn(setUserRole);

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
    mutationFn: (vars: { userId: string; role: "admin" | "faculty" | "student"; grant: boolean }) =>
      changeRole({ data: vars }),
    onSuccess: () => {
      toast.success("Roles updated");
      queryClient.invalidateQueries({ queryKey: ["admin-directory"] });
      queryClient.invalidateQueries({ queryKey: ["my-roles"] });
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
      <header className="border-b border-border/70">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <Link to="/dashboard" className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5" />
            <span className="font-display text-xl">LectureLoop</span>
          </Link>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/faculty">
                <BadgeCheck className="mr-2 h-4 w-4" /> Faculty review
              </Link>
            </Button>
            <Badge variant="secondary">
              <ShieldCheck className="mr-1 h-3.5 w-3.5" /> Admin
            </Badge>
          </div>

        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-12">
        <h1 className="text-4xl">Admin panel</h1>
        <p className="mt-1 text-muted-foreground">
          Monitor every class, note contribution and summary refresh across the campus.
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
      </main>
    </div>
  );
}
