import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import { AuthenticatedHeader } from "@/components/AuthenticatedHeader";
import { BookOpen, Plus, Search, Sparkles, User, Users } from "lucide-react";
import { useUniversityTheme } from "@/hooks/useUniversityTheme";




export const Route = createFileRoute("/_authenticated/dashboard")({
  staticData: { sitemap: false },
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
  const queryClient = useQueryClient();
  const uniTheme = useUniversityTheme();
  const [open, setOpen] = useState(false);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ subject: "", professor: "", code: "", term: "" });

  const { data: me } = useQuery({
    queryKey: ["dashboard-profile"],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", userId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: enrollments } = useQuery({
    queryKey: ["my-enrollments"],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) return [] as string[];
      const { data, error } = await supabase
        .from("enrollments")
        .select("class_id")
        .eq("user_id", userId);
      if (error) throw error;
      return (data ?? []).map((r) => r.class_id);
    },
  });

  const enrolledIds = enrollments ?? [];

  const { data: classes, isPending } = useQuery({
    queryKey: ["classes", enrolledIds],
    enabled: enrollments !== undefined,
    queryFn: async () => {
      if (enrolledIds.length === 0) return [];
      const { data, error } = await supabase
        .from("classes")
        .select("id, subject, professor, code, term, class_summaries(summary, notes_count, updated_at, reviewed), enrollments(count)")
        .in("id", enrolledIds)
        .order("subject");
      if (error) throw error;
      return data;
    },
  });

  const { data: searchResults, isFetching: searching } = useQuery({
    queryKey: ["class-search", search],
    enabled: enrollOpen && search.trim().length > 0,
    queryFn: async () => {
      const term = search.trim();
      const { data, error } = await supabase
        .from("classes")
        .select("id, subject, professor, code, term")
        .or(`subject.ilike.%${term}%,code.ilike.%${term}%`)
        .order("subject")
        .limit(20);
      if (error) throw error;
      return data;
    },
  });

  async function enroll(classId: string) {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) return;
    const { error } = await supabase.from("enrollments").insert({ user_id: userId, class_id: classId });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Enrolled");
    queryClient.invalidateQueries({ queryKey: ["my-enrollments"] });
  }

  async function createClass(e: React.FormEvent) {
    e.preventDefault();
    const { data: userData } = await supabase.auth.getUser();
    const { data: created, error } = await supabase
      .from("classes")
      .insert({
        subject: form.subject,
        professor: form.professor,
        code: form.code,
        term: form.term,
        created_by: userData.user?.id ?? null,
      })
      .select("id")
      .single();
    if (error) {
      toast.error(error.message);
      return;
    }
    if (created && userData.user?.id) {
      await supabase.from("enrollments").insert({ user_id: userData.user.id, class_id: created.id });
    }
    toast.success("Class added");
    setOpen(false);
    setForm({ subject: "", professor: "", code: "", term: "" });
    queryClient.invalidateQueries({ queryKey: ["my-enrollments"] });
    queryClient.invalidateQueries({ queryKey: ["classes"] });
  }


  return (
    <div className="min-h-screen">
      <AuthenticatedHeader />

      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-12">
        <div className="flex flex-wrap items-end justify-between gap-6 border-b border-border pb-8">
          <div className="max-w-xl">
            <h1 className="text-3xl sm:text-4xl">Welcome back{me?.full_name ? `, ${me.full_name}` : ""}</h1>
            <p className="mt-2 font-medium text-foreground">{uniTheme.name || "Your classes"}</p>
            <p className="mt-1 text-sm text-muted-foreground">Only your enrolled subjects appear here. Search by name or code to add more.</p>
          </div>

          <div className="flex flex-wrap gap-2">
          <Dialog open={enrollOpen} onOpenChange={setEnrollOpen}>
            <DialogTrigger asChild>
              <Button variant="secondary">
                <Search className="mr-2 h-4 w-4" /> Enroll in subject
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Find your subjects</DialogTitle>
                <DialogDescription>
                  Search by subject name or subject code, then enroll to see it on your dashboard.
                </DialogDescription>
              </DialogHeader>
              <Input
                autoFocus
                placeholder="e.g. Fundamental Algorithms or CSCI-GA 1170"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <div className="max-h-72 space-y-2 overflow-y-auto">
                {search.trim() === "" && (
                  <p className="text-sm text-muted-foreground">Start typing to search the class catalogue.</p>
                )}
                {search.trim() !== "" && searching && (
                  <p className="text-sm text-muted-foreground">Searching…</p>
                )}
                {search.trim() !== "" && !searching && searchResults?.length === 0 && (
                  <p className="text-sm text-muted-foreground">No subject matches that name or code.</p>
                )}
                {searchResults?.map((klass) => {
                  const already = enrolledIds.includes(klass.id);
                  return (
                    <div
                      key={klass.id}
                      className="flex items-center justify-between gap-4 rounded-lg border border-border/60 px-4 py-3"
                    >
                      <div>
                        <p className="font-medium">{klass.subject}</p>
                        <p className="text-xs text-muted-foreground">
                          {klass.code} · {klass.professor}
                          {klass.term ? ` · ${klass.term}` : ""}
                        </p>
                      </div>
                      <Button size="sm" disabled={already} onClick={() => enroll(klass.id)}>
                        {already ? "Enrolled" : "Enroll"}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </DialogContent>
          </Dialog>

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
        </div>

        <section className="mt-8" aria-label="Your classes">
          <h2 className="text-2xl">Your classes</h2>
          <div className="mt-5 grid gap-6 md:grid-cols-2">
          {isPending && Array.from({ length: 2 }, (_, index) => (
            <div key={index} className="surface-paper space-y-5 rounded-lg p-6" aria-hidden="true">
              <Skeleton className="h-7 w-2/3" /><Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-16 w-full" /><Skeleton className="h-3 w-1/3" />
            </div>
          ))}
          {!isPending && classes?.length === 0 && (
            <div className="surface-paper col-span-full flex flex-col items-center rounded-lg px-6 py-12 text-center">
              <BookOpen className="h-9 w-9 text-primary" aria-hidden="true" />
              <h3 className="mt-4 text-2xl">No enrolled subjects yet</h3>
              <p className="mt-2 max-w-md text-sm text-muted-foreground">Find a subject by name or code to see its notes and shared summary here.</p>
              <Button className="mt-6" onClick={() => setEnrollOpen(true)}><Search className="mr-2 h-4 w-4" />Enroll in subject</Button>
            </div>
          )}
          {classes?.map((klass) => {

            const summary = Array.isArray(klass.class_summaries)
              ? klass.class_summaries[0]
              : klass.class_summaries;
            const studentCount = klass.enrollments?.[0]?.count ?? 0;
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
                    <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                      <Users className="h-3.5 w-3.5" />
                      {studentCount} student{studentCount === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge variant="secondary">{klass.code}</Badge>
                  </div>
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
        </section>
      </main>
    </div>
  );
}
