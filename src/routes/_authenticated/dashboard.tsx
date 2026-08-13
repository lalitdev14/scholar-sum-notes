import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { GraduationCap, LogOut, Plus, ShieldCheck, Sparkles, User } from "lucide-react";


export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Class dashboard — LectureLoop" },
      {
        name: "description",
        content: "Browse your classes and read the AI-refined summary built from everyone's notes.",
      },
      { property: "og:title", content: "Class dashboard — LectureLoop" },
      { property: "og:description", content: "Refined class summaries from every student's notes." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isAdmin } = useIsAdmin();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ subject: "", professor: "", code: "", term: "" });


  const { data: classes, isPending } = useQuery({
    queryKey: ["classes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classes")
        .select("id, subject, professor, code, term, class_summaries(summary, notes_count, updated_at)")
        .order("subject");
      if (error) throw error;
      return data;
    },
  });

  async function createClass(e: React.FormEvent) {
    e.preventDefault();
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from("classes").insert({
      subject: form.subject,
      professor: form.professor,
      code: form.code,
      term: form.term,
      created_by: userData.user?.id ?? null,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Class added");
    setOpen(false);
    setForm({ subject: "", professor: "", code: "", term: "" });
    queryClient.invalidateQueries({ queryKey: ["classes"] });
  }

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-border/70">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <Link to="/dashboard" className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5" />
            <span className="font-display text-xl">LectureLoop</span>
          </Link>
          <div className="flex items-center gap-1">
            {isAdmin && (
              <Button variant="ghost" size="sm" asChild>
                <Link to="/admin">
                  <ShieldCheck className="mr-2 h-4 w-4" /> Admin
                </Link>
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut className="mr-2 h-4 w-4" /> Sign out
            </Button>
          </div>

        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-4xl">Your classes</h1>
            <p className="mt-1 text-muted-foreground">
              Pick a class to take notes. Everyone's notes merge into one refined summary.
            </p>
          </div>

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" /> Add class
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add a class</DialogTitle>
                <DialogDescription>
                  Anyone signed in can join this class and contribute notes.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={createClass} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="subject">Subject</Label>
                  <Input
                    id="subject"
                    value={form.subject}
                    onChange={(e) => setForm({ ...form, subject: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="professor">Professor</Label>
                  <Input
                    id="professor"
                    value={form.professor}
                    onChange={(e) => setForm({ ...form, professor: e.target.value })}
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="code">Class code</Label>
                    <Input
                      id="code"
                      value={form.code}
                      onChange={(e) => setForm({ ...form, code: e.target.value })}
                      placeholder="CS-221"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="term">Term</Label>
                    <Input
                      id="term"
                      value={form.term}
                      onChange={(e) => setForm({ ...form, term: e.target.value })}
                      placeholder="Fall 2026"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit">Add class</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="mt-10 grid gap-6 md:grid-cols-2">
          {isPending && <p className="text-muted-foreground">Loading classes…</p>}
          {classes?.map((klass) => {
            const summary = Array.isArray(klass.class_summaries)
              ? klass.class_summaries[0]
              : klass.class_summaries;
            return (
              <Link
                key={klass.id}
                to="/class/$classId"
                params={{ classId: klass.id }}
                className="surface-paper group rounded-xl p-6 transition-transform hover:-translate-y-0.5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-2xl">{klass.subject}</h2>
                    <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                      <User className="h-3.5 w-3.5" />
                      {klass.professor}
                    </p>
                  </div>
                  <Badge variant="secondary">{klass.code}</Badge>
                </div>

                <p className="prose-notes mt-4 line-clamp-4 text-sm text-muted-foreground">
                  {summary?.summary || "No shared summary yet — be the first to add notes."}
                </p>

                <div className="mt-5 flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5 text-accent" />
                  {summary?.notes_count ? `${summary.notes_count} notes merged` : "Awaiting notes"}
                </div>
              </Link>
            );
          })}
        </div>
      </main>
    </div>
  );
}
