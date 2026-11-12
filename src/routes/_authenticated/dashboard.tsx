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
import { BookOpen, Plus, Search, Sparkles, Trash2, User } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
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
import { useUniversityTheme } from "@/hooks/useUniversityTheme";
import { noteToPlainText } from "@/lib/note-format";
import { SiteFooter } from "@/components/SiteFooter";

export const Route = createFileRoute("/_authenticated/dashboard")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Class dashboard — LectureLoop" },
      {
        name: "description",
        content: "Your classes, your notes and the AI summaries of what you wrote.",
      },
      { property: "og:title", content: "Class dashboard — LectureLoop" },
      { property: "og:description", content: "Your personal class notes and AI summaries." },
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
        .select("id, subject, professor, code, term")
        .in("id", enrolledIds)
        .order("subject");
      if (error) throw error;

      // Only this student's own notes (reviewers can read more via RLS, so filter explicitly).
      const { data: userData } = await supabase.auth.getUser();
      const { data: myNotes, error: notesError } = await supabase
        .from("notes")
        .select("class_id, content, summary, updated_at")
        .eq("user_id", userData.user!.id)
        .in("class_id", enrolledIds)
        .order("updated_at", { ascending: false });
      if (notesError) throw notesError;
      const noteByClass = new Map<string, NonNullable<typeof myNotes>[number]>();
      for (const n of myNotes ?? [])
        if (!noteByClass.has(n.class_id)) noteByClass.set(n.class_id, n);

      return (data ?? []).map((c) => ({ ...c, myNote: noteByClass.get(c.id) ?? null }));
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

  const [removeTarget, setRemoveTarget] = useState<{
    id: string;
    subject: string;
    code: string;
  } | null>(null);
  const [deleteMyData, setDeleteMyData] = useState(false);
  const [removing, setRemoving] = useState(false);

  /** Unenrolls the student; optionally deletes their own notes, slides, handwriting and transcripts for the class. */
  async function removeClass() {
    if (!removeTarget) return;
    setRemoving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Not signed in");
      const classId = removeTarget.id;

      if (deleteMyData) {
        const [{ data: slides, error: slidesError }, { data: pages, error: pagesError }] =
          await Promise.all([
            supabase
              .from("lecture_slides")
              .select("id, file_path")
              .eq("class_id", classId)
              .eq("user_id", userId),
            supabase
              .from("handwriting_pages")
              .select("id, image_path")
              .eq("class_id", classId)
              .eq("user_id", userId),
          ]);
        if (slidesError) throw slidesError;
        if (pagesError) throw pagesError;
        if (slides?.length) {
          await supabase.storage.from("lecture-slides").remove(slides.map((x) => x.file_path));
          const { error } = await supabase
            .from("lecture_slides")
            .delete()
            .eq("class_id", classId)
            .eq("user_id", userId);
          if (error) throw error;
        }
        if (pages?.length) {
          await supabase.storage.from("handwriting").remove(pages.map((x) => x.image_path));
          const { error } = await supabase
            .from("handwriting_pages")
            .delete()
            .eq("class_id", classId)
            .eq("user_id", userId);
          if (error) throw error;
        }
        const { error: transcriptsError } = await supabase
          .from("audio_transcripts")
          .delete()
          .eq("class_id", classId)
          .eq("user_id", userId);
        if (transcriptsError) throw transcriptsError;
        const { error: notesError } = await supabase
          .from("notes")
          .delete()
          .eq("class_id", classId)
          .eq("user_id", userId);
        if (notesError) throw notesError;
      }

      const { error } = await supabase
        .from("enrollments")
        .delete()
        .eq("class_id", classId)
        .eq("user_id", userId);
      if (error) throw error;
      toast.success(
        deleteMyData ? "Class and your notes removed" : "Class removed from your dashboard",
      );
      setRemoveTarget(null);
      queryClient.invalidateQueries({ queryKey: ["my-enrollments"] });
      queryClient.invalidateQueries({ queryKey: ["classes"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove the class");
    } finally {
      setRemoving(false);
    }
  }

  async function enroll(classId: string) {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) return;
    const { error } = await supabase
      .from("enrollments")
      .insert({ user_id: userId, class_id: classId });
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
    // Tie the class to the student's university so university admins can manage it.
    const { data: profile } = await supabase
      .from("profiles")
      .select("university_id")
      .eq("id", userData.user?.id ?? "")
      .maybeSingle();
    const { data: created, error } = await supabase
      .from("classes")
      .insert({
        subject: form.subject,
        professor: form.professor,
        code: form.code,
        term: form.term,
        created_by: userData.user?.id ?? null,
        university_id: profile?.university_id ?? null,
      })
      .select("id")
      .single();
    if (error) {
      toast.error(error.message);
      return;
    }
    if (created && userData.user?.id) {
      await supabase
        .from("enrollments")
        .insert({ user_id: userData.user.id, class_id: created.id });
    }
    toast.success("Class added");
    setOpen(false);
    setForm({ subject: "", professor: "", code: "", term: "" });
    queryClient.invalidateQueries({ queryKey: ["my-enrollments"] });
    queryClient.invalidateQueries({ queryKey: ["classes"] });
  }

  return (
    <div className="flex min-h-screen flex-col">
      <AuthenticatedHeader />

      <main className="mx-auto w-full max-w-[1600px] px-4 sm:px-6 py-12">
        <div className="flex flex-wrap items-end justify-between gap-6 border-b border-border pb-8">
          <div className="max-w-xl">
            <h1 className="text-3xl sm:text-4xl">
              Welcome back{me?.full_name ? `, ${me.full_name}` : ""}
            </h1>
            <p className="mt-2 font-medium text-foreground">{uniTheme.name || "Your classes"}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Only your enrolled subjects appear here. Search by name or code to add more.
            </p>
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
                    <p className="text-sm text-muted-foreground">
                      Start typing to search the class catalogue.
                    </p>
                  )}
                  {search.trim() !== "" && searching && (
                    <p className="text-sm text-muted-foreground">Searching…</p>
                  )}
                  {search.trim() !== "" && !searching && searchResults?.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      No subject matches that name or code.
                    </p>
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
          <div className="mt-5 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {isPending &&
              Array.from({ length: 2 }, (_, index) => (
                <div
                  key={index}
                  className="surface-paper space-y-5 rounded-lg p-6"
                  aria-hidden="true"
                >
                  <Skeleton className="h-7 w-2/3" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              ))}
            {!isPending && classes?.length === 0 && (
              <div className="surface-paper col-span-full flex flex-col items-center rounded-lg px-6 py-12 text-center">
                <BookOpen className="h-9 w-9 text-primary" aria-hidden="true" />
                <h3 className="mt-4 text-2xl">No enrolled subjects yet</h3>
                <p className="mt-2 max-w-md text-sm text-muted-foreground">
                  Find a subject by name or code, then take your own notes and get an AI summary of
                  them.
                </p>
                <Button className="mt-6" onClick={() => setEnrollOpen(true)}>
                  <Search className="mr-2 h-4 w-4" />
                  Enroll in subject
                </Button>
              </div>
            )}
            {classes?.map((klass) => {
              const note = klass.myNote;
              const preview = (note?.summary || noteToPlainText(note?.content ?? ""))
                .replace(/\[color=[a-z]+\]|\[\/color\]|\*\*|^#{1,3} |^- /gm, "")
                .trim();
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
                    <div className="flex items-start gap-1">
                      <Badge variant="secondary">{klass.code}</Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="-mr-2 -mt-1.5 h-8 w-8 text-muted-foreground hover:text-destructive"
                        aria-label={`Remove ${klass.subject} from your classes`}
                        title="Remove class"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDeleteMyData(false);
                          setRemoveTarget({
                            id: klass.id,
                            subject: klass.subject,
                            code: klass.code,
                          });
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <p className="prose-notes mt-4 line-clamp-4 text-sm text-muted-foreground">
                    {preview || "No notes yet — open the class to start writing."}
                  </p>

                  <div className="mt-5 flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
                    <Sparkles className="h-3.5 w-3.5 text-accent" />
                    {note?.summary
                      ? "AI summary ready"
                      : note?.content
                        ? "Notes saved · not summarized yet"
                        : "No notes yet"}
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      </main>

      <AlertDialog
        open={Boolean(removeTarget)}
        onOpenChange={(open) => !open && !removing && setRemoveTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removeTarget?.subject}?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteMyData
                ? "The class is removed from your dashboard and your notes, AI summary, slides, handwriting and lecture transcripts for it are permanently deleted."
                : "The class is removed from your dashboard. Your notes are kept and come back if you enroll in it again."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <label className="flex items-start gap-3 rounded-md border border-border p-3 text-sm">
            <Checkbox
              checked={deleteMyData}
              onCheckedChange={(v) => setDeleteMyData(v === true)}
              aria-label="Also delete my notes, slides, handwriting and transcripts for this class"
              className="mt-0.5"
            />
            <span>
              Also delete my notes, slides, handwriting and transcripts for this class
              <span className="block text-xs text-muted-foreground">This cannot be undone.</span>
            </span>
          </label>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={
                deleteMyData ? "bg-destructive text-white hover:bg-destructive/90" : undefined
              }
              disabled={removing}
              onClick={(e) => {
                e.preventDefault();
                void removeClass();
              }}
            >
              {removing ? "Removing…" : deleteMyData ? "Remove and delete notes" : "Remove class"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <SiteFooter />
    </div>
  );
}
