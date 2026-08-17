import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { saveNote, refreshClassSummary, transcribeHandwriting } from "@/lib/notes.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HandwritingCanvas } from "@/components/HandwritingCanvas";
import { toast } from "sonner";
import { AuthenticatedHeader } from "@/components/AuthenticatedHeader";
import { BadgeCheck, Save, Sparkles, User, Users } from "lucide-react";



export const Route = createFileRoute("/_authenticated/class/$classId")({
  head: () => ({
    meta: [
      { title: "Class notes — LectureLoop" },
      {
        name: "description",
        content: "Write your class notes and read the AI-refined summary from all students.",
      },
      { property: "og:title", content: "Class notes — LectureLoop" },
      { property: "og:description", content: "Live note-taking with a shared AI class summary." },
    ],
  }),
  component: ClassPage,
});

function ClassPage() {
  const { classId } = Route.useParams();
  const queryClient = useQueryClient();
  const save = useServerFn(saveNote);
  const refresh = useServerFn(refreshClassSummary);
  const transcribe = useServerFn(transcribeHandwriting);

  const [content, setContent] = useState("");
  const [noteId, setNoteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [converting, setConverting] = useState(false);

  async function archiveHandwriting(imageDataUrl: string, transcript: string) {
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) return;
      const blob = await (await fetch(imageDataUrl)).blob();
      const path = `${userId}/${classId}/${Date.now()}.png`;
      const { error: uploadError } = await supabase.storage
        .from("handwriting")
        .upload(path, blob, { contentType: "image/png" });
      if (uploadError) throw uploadError;
      const { error: insertError } = await supabase
        .from("handwriting_pages")
        .insert({ class_id: classId, user_id: userId, image_path: path, transcript });
      if (insertError) throw insertError;
      queryClient.invalidateQueries({ queryKey: ["handwriting", classId] });
    } catch (err) {
      console.error("Could not archive handwriting", err);
      toast.error("Text captured, but the handwritten copy could not be saved.");
    }
  }

  async function handleConvert(imageDataUrl: string): Promise<boolean> {
    setConverting(true);
    try {
      const res = await transcribe({ data: { imageDataUrl } });
      if (!res.text) {
        toast.error("Nothing legible found on the canvas.");
        return false;
      }
      setContent((prev) => (prev.trim() ? `${prev.trim()}\n${res.text}` : res.text));
      void archiveHandwriting(imageDataUrl, res.text);
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not convert handwriting");
      return false;
    } finally {
      setConverting(false);
    }
  }

  const { data: pages } = useQuery({
    queryKey: ["handwriting", classId],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("handwriting_pages")
        .select("id, image_path, transcript, created_at")
        .eq("class_id", classId)
        .eq("user_id", userData.user!.id)
        .order("created_at", { ascending: false })
        .limit(24);
      if (error) throw error;
      const signed = await Promise.all(
        (data ?? []).map(async (row) => {
          const { data: url } = await supabase.storage
            .from("handwriting")
            .createSignedUrl(row.image_path, 3600);
          return { ...row, url: url?.signedUrl ?? null };
        }),
      );
      return signed;
    },
  });



  const { data: klass } = useQuery({
    queryKey: ["class", classId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classes")
        .select("id, subject, professor, code, term, enrollments(count)")
        .eq("id", classId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const studentCount = (klass as any)?.enrollments?.[0]?.count ?? 0;

  const { data: myNote } = useQuery({
    queryKey: ["my-note", classId],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("notes")
        .select("id, content")
        .eq("class_id", classId)
        .eq("user_id", userData.user!.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: summary } = useQuery({
    queryKey: ["summary", classId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("class_summaries")
        .select("summary, key_points, notes_count, updated_at, reviewed, reviewed_at, review_note")
        .eq("class_id", classId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (myNote) {
      setNoteId(myNote.id);
      setContent(myNote.content);
    }
  }, [myNote]);

  async function handleSave() {
    if (!content.trim()) {
      toast.error("Write something first.");
      return;
    }
    setSaving(true);
    try {
      const res = await save({ data: { classId, noteId, content } });
      setNoteId(res.id);
      toast.success("Notes saved");
      queryClient.invalidateQueries({ queryKey: ["my-note", classId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save notes");
    } finally {
      setSaving(false);
    }
  }

  async function handleSummarize() {
    setSummarizing(true);
    try {
      if (content.trim()) await handleSave();
      await refresh({ data: { classId } });
      toast.success("Class summary refreshed");
      queryClient.invalidateQueries({ queryKey: ["summary", classId] });
      queryClient.invalidateQueries({ queryKey: ["classes"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not refresh the summary");
    } finally {
      setSummarizing(false);
    }
  }

  const keyPoints = Array.isArray(summary?.key_points) ? (summary.key_points as string[]) : [];

  return (
    <div className="min-h-screen">
      <AuthenticatedHeader trailing={klass && <Badge variant="secondary">{klass.code}</Badge>} />

      <main className="mx-auto max-w-6xl px-6 py-10">

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-4xl">{klass?.subject ?? "Class"}</h1>
            <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
              <User className="h-3.5 w-3.5" />
              {klass?.professor}
              {klass?.term ? ` · ${klass.term}` : ""}
            </p>
          </div>
          <Button onClick={handleSummarize} disabled={summarizing}>
            <Sparkles className="mr-2 h-4 w-4" />
            {summarizing ? "Refining…" : "Refresh class summary"}
          </Button>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-5">
          <section className="surface-paper rounded-xl p-6 lg:col-span-3">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl">Your notes</h2>
              <Button variant="outline" size="sm" onClick={handleSave} disabled={saving}>
                <Save className="mr-2 h-4 w-4" />
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
            <Tabs defaultValue="type" className="mt-4">
              <TabsList>
                <TabsTrigger value="type">Type</TabsTrigger>
                <TabsTrigger value="write">Handwrite</TabsTrigger>
              </TabsList>
              <TabsContent value="type">
                <Textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Start writing what the professor is covering…"
                  className="min-h-[460px] resize-none bg-transparent text-base leading-relaxed"
                />
              </TabsContent>
              <TabsContent value="write">
                <HandwritingCanvas onConvert={handleConvert} converting={converting} />
                <div className="mt-4 rounded-lg border border-border/60 bg-background/40 p-4">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground">
                    Live transcript {converting ? "· converting…" : ""}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">
                    {content || "Your handwriting will appear here as typed text."}
                  </p>
                </div>

                <div className="mt-6">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground">
                    Saved handwritten pages
                  </p>
                  {pages && pages.length > 0 ? (
                    <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {pages.map((page) => (
                        <a
                          key={page.id}
                          href={page.url ?? undefined}
                          target="_blank"
                          rel="noreferrer"
                          className="block overflow-hidden rounded-lg border border-border/60 bg-white"
                        >
                          {page.url && (
                            <img
                              src={page.url}
                              alt={`Handwritten note from ${new Date(page.created_at).toLocaleString()}`}
                              loading="lazy"
                              className="h-28 w-full object-cover"
                            />
                          )}
                          <span className="block px-2 py-1 text-[10px] text-muted-foreground">
                            {new Date(page.created_at).toLocaleString()}
                          </span>
                        </a>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-muted-foreground">
                      Every page you convert is archived here as the original handwriting.
                    </p>
                  )}
                </div>
              </TabsContent>
            </Tabs>

            <p className="mt-3 text-xs text-muted-foreground">
              Only you can see your raw notes. They are merged anonymously into the class summary.
            </p>
          </section>

          <aside className="ink-panel rounded-xl p-6 lg:col-span-2">
            <div className="flex items-center gap-2 text-xs uppercase tracking-widest opacity-80">
              <Sparkles className="h-3.5 w-3.5" /> AI class summary
            </div>
            <h2 className="mt-3 text-2xl text-primary-foreground">Shared understanding</h2>

            {summary?.summary ? (
              <>
                <p className="prose-notes mt-4 text-sm opacity-90">{summary.summary}</p>
                {keyPoints.length > 0 && (
                  <ul className="mt-5 space-y-2 text-sm opacity-90">
                    {keyPoints.map((point, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="opacity-60">—</span>
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {summary.reviewed ? (
                  <div className="mt-5 rounded-lg bg-background/15 p-3 text-xs">
                    <span className="inline-flex items-center gap-1 font-medium">
                      <BadgeCheck className="h-3.5 w-3.5" /> Reviewed by faculty
                      {summary.reviewed_at
                        ? ` · ${new Date(summary.reviewed_at).toLocaleDateString()}`
                        : ""}
                    </span>
                    {summary.review_note && <p className="mt-1 opacity-80">{summary.review_note}</p>}
                  </div>
                ) : (
                  <p className="mt-5 text-xs opacity-70">Not yet reviewed by faculty.</p>
                )}
                <p className="mt-6 text-xs opacity-70">
                  Merged from {summary.notes_count} student{summary.notes_count === 1 ? "" : "s"} ·
                  updated {new Date(summary.updated_at).toLocaleString()}
                </p>
              </>
            ) : (
              <p className="mt-4 text-sm opacity-80">
                No summary yet. Save your notes and refresh the summary to generate one for the whole
                class.
              </p>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}
