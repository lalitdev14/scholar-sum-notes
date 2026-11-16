import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  getTranscriptionSetup,
  saveNote,
  summarizeMyNotes,
  transcribeAudioChunk,
  transcribeHandwriting,
} from "@/lib/notes.functions";
import { AudioTranscriber } from "@/components/AudioTranscriber";
import {
  RecordingsList,
  type Recording,
  type RecordingExportFormat,
} from "@/components/RecordingsList";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { NoteEditor, noteContentExtensions } from "@/components/NoteEditor";
import type { ExportFormat, ExportPart } from "@/lib/export-notes";
import { renderNote } from "@/components/SummaryMarkdown";
import { escapeHtml, noteToPlainText, plainTextToHtml, toEditorHtml } from "@/lib/note-format";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NotebookViewer } from "@/components/NotebookViewer";
import { LAST_CLASS_KEY } from "@/components/WelcomeHome";
import {
  HandwritingNotebook,
  type NotebookHandle,
  type OpenPage,
  type Paper,
  type RenderedPage,
  type SavedPageResult,
  type Stroke,
} from "@/components/HandwritingNotebook";
import { LectureSlideViewer } from "@/components/LectureSlideViewer";
import { AdjustableClassWorkspace } from "@/components/AdjustableClassWorkspace";
import { toast } from "sonner";
import { AuthenticatedHeader } from "@/components/AuthenticatedHeader";
import {
  ArrowLeft,
  Download,
  Eye,
  FileText,
  FileType,
  FileUp,
  Lock,
  Pencil,
  Save,
  Sparkles,
  Trash2,
  User,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn, friendlyError } from "@/lib/utils";
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

/** Largest slide deck students can upload (matches the storage bucket limit). */
const MAX_SLIDE_BYTES = 50 * 1024 * 1024;

export const Route = createFileRoute("/_authenticated/class/$classId")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Class notes — LectureLoop" },
      {
        name: "description",
        content:
          "Write your class notes next to the lecture slides and get an AI summary of your own notes.",
      },
      { property: "og:title", content: "Class notes — LectureLoop" },
      {
        property: "og:description",
        content: "Personal note-taking with an AI summary of your notes.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ClassPage,
});

function ClassPage() {
  const { classId } = Route.useParams();
  // Remember the last class opened, for "Continue where you left off" on the home page.
  useEffect(() => {
    try {
      localStorage.setItem(LAST_CLASS_KEY, JSON.stringify({ id: classId, at: Date.now() }));
    } catch {
      /* private mode */
    }
  }, [classId]);
  const queryClient = useQueryClient();
  const save = useServerFn(saveNote);
  const summarize = useServerFn(summarizeMyNotes);
  const transcribe = useServerFn(transcribeHandwriting);
  const transcribeAudio = useServerFn(transcribeAudioChunk);
  const transcriptionSetupFn = useServerFn(getTranscriptionSetup);
  const { data: transcriptionSetup } = useQuery({
    queryKey: ["transcription-setup"],
    queryFn: () => transcriptionSetupFn(),
    staleTime: Infinity,
  });
  const [isRecording, setIsRecording] = useState(false);
  // Right-hand card shows either the lecture slides or the student's AI summary.
  const [rightView, setRightView] = useState<"slides" | "summary">("slides");
  const rightViewChosen = useRef(false);

  const [content, setContent] = useState("");
  const [noteId, setNoteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [converting, setConverting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [uploadingSlides, setUploadingSlides] = useState(false);
  const [removingSlideId, setRemovingSlideId] = useState<string | null>(null);
  const [selectedSlideId, setSelectedSlideId] = useState<string | null>(null);
  const slidesInputRef = useRef<HTMLInputElement>(null);

  const { data: lectureSlides } = useQuery({
    queryKey: ["lecture-slides", classId],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) return [];
      const { data, error } = await supabase
        .from("lecture_slides")
        .select("id, title, file_name, file_path, content_type, created_at")
        .eq("class_id", classId)
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const activeSlides =
    lectureSlides?.find((item) => item.id === selectedSlideId) ?? lectureSlides?.[0];

  async function handleSlideUpload(file: File | undefined) {
    if (!file) return;
    if (
      !/\.(pdf|pptx)$/i.test(file.name) ||
      ![
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      ].includes(file.type)
    ) {
      toast.error("Choose a PDF or PowerPoint (.pptx) file.");
      return;
    }
    if (file.size > MAX_SLIDE_BYTES) {
      toast.error(
        `This file is ${(file.size / 1024 / 1024).toFixed(0)} MB. Slides can be up to 50 MB. Try "Reduce file size" when exporting the PDF.`,
      );
      return;
    }
    setUploadingSlides(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Sign in to upload slides.");
      const filePath = `${userId}/${classId}/${crypto.randomUUID()}.${file.name.toLowerCase().endsWith(".pdf") ? "pdf" : "pptx"}`;
      const { error: uploadError } = await supabase.storage
        .from("lecture-slides")
        // Set the type from the extension: some browsers report an empty type for .pptx,
        // and storage only accepts PDF and PowerPoint files.
        .upload(filePath, file, {
          contentType: filePath.endsWith(".pdf")
            ? "application/pdf"
            : "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        });
      if (uploadError) throw uploadError;
      const { data: row, error: saveError } = await supabase
        .from("lecture_slides")
        .insert({
          class_id: classId,
          user_id: userId,
          file_path: filePath,
          file_name: file.name.slice(0, 255),
          content_type: file.type,
          title: file.name.replace(/\.(pdf|pptx)$/i, "").slice(0, 120),
        })
        .select("id")
        .single();
      if (saveError) {
        await supabase.storage.from("lecture-slides").remove([filePath]);
        throw saveError;
      }
      setSelectedSlideId(row.id);
      await queryClient.invalidateQueries({ queryKey: ["lecture-slides", classId] });
      toast.success("Slides uploaded");
    } catch (err) {
      toast.error(friendlyError(err, "Could not upload slides"));
    } finally {
      setUploadingSlides(false);
      if (slidesInputRef.current) slidesInputRef.current.value = "";
    }
  }

  async function handleSlideRename() {
    if (!activeSlides) return;
    const name = window
      .prompt("Name these slides", activeSlides.title || activeSlides.file_name)
      ?.trim();
    if (name === undefined || name === null) return;
    const { error } = await supabase
      .from("lecture_slides")
      .update({ title: name.slice(0, 120) })
      .eq("id", activeSlides.id);
    if (error) {
      toast.error(friendlyError(error, "Something went wrong. Please try again."));
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["lecture-slides", classId] });
    toast.success("Slides renamed");
  }

  async function handleSlideRemove() {
    if (!activeSlides) return;
    setRemovingSlideId(activeSlides.id);
    try {
      const { error } = await supabase.storage
        .from("lecture-slides")
        .remove([activeSlides.file_path]);
      if (error) throw error;
      const { error: removeError } = await supabase
        .from("lecture_slides")
        .delete()
        .eq("id", activeSlides.id);
      if (removeError) throw removeError;
      setSelectedSlideId(null);
      await queryClient.invalidateQueries({ queryKey: ["lecture-slides", classId] });
      toast.success("Slides removed");
    } catch (err) {
      toast.error(friendlyError(err, "Could not remove slides"));
    } finally {
      setRemovingSlideId(null);
    }
  }

  const notebookRef = useRef<NotebookHandle>(null);

  /** Saves a notebook page (new or edited): PNG + slide background in storage, ink in the row. */
  async function saveHandwritingPage(
    page: RenderedPage,
    transcript?: string,
  ): Promise<SavedPageResult | null> {
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("You're signed out. Sign in again to save.");
      const toBlob = async (url: string) => (await fetch(url)).blob();
      const toPngBlob = async (url: string): Promise<Blob> => {
        const blob = await toBlob(url);
        if (blob.type === "image/png") return blob;
        const bmp = await createImageBitmap(blob);
        const c = document.createElement("canvas");
        c.width = bmp.width;
        c.height = bmp.height;
        c.getContext("2d")!.drawImage(bmp, 0, 0);
        bmp.close();
        return new Promise<Blob>((res, rej) =>
          c.toBlob(
            (b) => (b ? res(b) : rej(new Error("Could not prepare the slide."))),
            "image/png",
          ),
        );
      };
      const stamp = Date.now();
      const imagePath = page.imagePath ?? `${userId}/${classId}/${stamp}.png`;
      const { error: uploadError } = await supabase.storage
        .from("handwriting")
        .upload(imagePath, await toBlob(page.imageDataUrl), {
          contentType: "image/png",
          upsert: true,
        });
      if (uploadError) throw uploadError;

      let backgroundPath = page.backgroundPath ?? null;
      if (!backgroundPath && page.backgroundDataUrl) {
        backgroundPath = `${userId}/${classId}/${stamp}-slide.png`;
        // Slides from "Write on all slides" are kept as light JPEGs; storage takes PNG only.
        const { error: bgError } = await supabase.storage
          .from("handwriting")
          .upload(backgroundPath, await toPngBlob(page.backgroundDataUrl), {
            contentType: "image/png",
          });
        if (bgError) throw bgError;
      }

      const fields = {
        image_path: imagePath,
        notebook_id: page.notebookId,
        notebook_title: page.notebookTitle.slice(0, 200),
        page_index: Math.min(page.pageIndex, 1000),
        strokes: page.strokes as unknown as never,
        paper: page.paper,
        page_height: Math.round(page.height),
        background_path: backgroundPath,
        ...(transcript !== undefined ? { transcript } : {}),
      };
      let id = page.savedId;
      if (id) {
        const { error } = await supabase.from("handwriting_pages").update(fields).eq("id", id);
        if (error) throw error;
      } else {
        const { data: row, error } = await supabase
          .from("handwriting_pages")
          .insert({ ...fields, class_id: classId, user_id: userId, transcript: transcript ?? "" })
          .select("id")
          .single();
        if (error) throw error;
        id = row.id;
      }
      // Keep the title the same on every page of this notebook.
      await supabase
        .from("handwriting_pages")
        .update({ notebook_title: page.notebookTitle.slice(0, 200) })
        .eq("notebook_id", page.notebookId)
        .eq("user_id", userId);
      await queryClient.invalidateQueries({ queryKey: ["handwriting", classId] });
      return { id, imagePath, backgroundPath };
    } catch (err) {
      toast.error(friendlyError(err, "Could not save the handwritten page."));
      return null;
    }
  }

  async function handleSavePage(page: RenderedPage, opts?: { quiet?: boolean }) {
    const res = await saveHandwritingPage(page);
    if (res && !opts?.quiet) toast.success("Page saved to this class");
    return res;
  }

  async function renameNotebook(id: string, title: string) {
    const { error } = await supabase
      .from("handwriting_pages")
      .update({ notebook_title: title.slice(0, 200) })
      .eq("notebook_id", id);
    if (!error) await queryClient.invalidateQueries({ queryKey: ["handwriting", classId] });
  }

  async function fileToDataUrl(url: string): Promise<string> {
    const blob = await (await fetch(url)).blob();
    return new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsDataURL(blob);
    });
  }
  async function backgroundDataUrl(path: string | null): Promise<string | null> {
    if (!path) return null;
    const { data } = await supabase.storage.from("handwriting").createSignedUrl(path, 600);
    return data?.signedUrl ? fileToDataUrl(data.signedUrl) : null;
  }

  /** Converts a notebook page to typed text (AI), appends it to the notes and saves the page. */
  async function handleConvert(page: RenderedPage): Promise<SavedPageResult | null> {
    setConverting(true);
    try {
      const res = await transcribe({ data: { imageDataUrl: page.imageDataUrl } });
      if (!res.text) {
        toast.error("Nothing legible found on this page.");
        return null;
      }
      setContent(
        (prev) => (noteToPlainText(prev) ? toEditorHtml(prev) : "") + plainTextToHtml(res.text),
      );
      const saved = await saveHandwritingPage(page, res.text);
      toast.success("Added to your typed notes. Remember to save them.");
      return saved;
    } catch (err) {
      toast.error(friendlyError(err, "Could not convert handwriting"));
      return null;
    } finally {
      setConverting(false);
    }
  }

  async function openSavedPage(row: {
    id: string;
    image_path: string;
    strokes: unknown;
    paper: string;
    page_height: number;
    background_path: string | null;
  }) {
    let background: string | null = null;
    if (row.background_path) {
      const { data } = await supabase.storage
        .from("handwriting")
        .createSignedUrl(row.background_path, 600);
      if (data?.signedUrl) {
        const blob = await (await fetch(data.signedUrl)).blob();
        background = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.readAsDataURL(blob);
        });
      }
    }
    notebookRef.current?.openSaved({
      id: row.id,
      imagePath: row.image_path,
      strokes: (Array.isArray(row.strokes) ? row.strokes : []) as Stroke[],
      paper: row.paper as Paper,
      height: row.page_height,
      backgroundPath: row.background_path,
      background,
    });
  }

  async function deleteSavedPage(row: {
    id: string;
    image_path: string;
    background_path: string | null;
  }) {
    if (!window.confirm("Delete this saved handwritten page?")) return;
    const paths = [row.image_path, row.background_path].filter((x): x is string => Boolean(x));
    await supabase.storage.from("handwriting").remove(paths);
    const { error } = await supabase.from("handwriting_pages").delete().eq("id", row.id);
    if (error) {
      toast.error(friendlyError(error, "Could not delete the page."));
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["handwriting", classId] });
    toast.success("Page deleted");
  }

  const { data: pages } = useQuery({
    queryKey: ["handwriting", classId],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("handwriting_pages")
        .select(
          "id, image_path, transcript, created_at, updated_at, strokes, paper, page_height, background_path, notebook_id, notebook_title, page_index",
        )
        .eq("class_id", classId)
        .eq("user_id", userData.user!.id)
        .order("created_at", { ascending: false })
        .limit(300);
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

  /** Saved pages grouped into notebooks (newest first); older loose pages form one group. */
  type SavedRow = NonNullable<typeof pages>[number];
  type SavedNotebook = { id: string | null; title: string; pages: SavedRow[]; updatedAt: string };
  const savedNotebooks: SavedNotebook[] = (() => {
    const groups = new Map<string, SavedNotebook>();
    for (const row of pages ?? []) {
      const key = row.notebook_id ?? "loose";
      const t = row.updated_at ?? row.created_at;
      const g = groups.get(key) ?? {
        id: row.notebook_id,
        title: row.notebook_id ? row.notebook_title || "Notebook" : "Earlier pages",
        pages: [],
        updatedAt: t,
      };
      g.pages.push(row);
      if (t > g.updatedAt) g.updatedAt = t;
      groups.set(key, g);
    }
    for (const g of groups.values())
      g.pages.sort(
        (a, b) => a.page_index - b.page_index || a.created_at.localeCompare(b.created_at),
      );
    return [...groups.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  })();

  const toOpenPage = async (row: SavedRow): Promise<OpenPage> => ({
    id: row.id,
    imagePath: row.image_path,
    strokes: (Array.isArray(row.strokes) ? row.strokes : []) as Stroke[],
    paper: row.paper as Paper,
    height: row.page_height,
    backgroundPath: row.background_path,
    background: await backgroundDataUrl(row.background_path),
  });

  /** The saved notebook open in the read-only viewer (and the page to start at). */
  const [viewing, setViewing] = useState<{ key: string; index: number } | null>(null);
  const viewingGroup = viewing
    ? savedNotebooks.find((g) => (g.id ?? "loose") === viewing.key)
    : undefined;

  /** Opens a whole saved notebook in the Handwrite tab, optionally at a given page. */
  async function openSavedNotebook(group: SavedNotebook, startIndex = 0) {
    if (!group.id) return;
    const loaded = await Promise.all(group.pages.map(toOpenPage));
    notebookRef.current?.openNotebook({
      id: group.id,
      title: group.title,
      pages: loaded,
      startIndex,
    });
  }

  async function downloadSavedNotebook(group: SavedNotebook) {
    try {
      const images: string[] = [];
      for (const row of group.pages) if (row.url) images.push(await fileToDataUrl(row.url));
      const { downloadNotebookPdf } = await import("@/lib/notebook-pdf");
      await downloadNotebookPdf(group.title, images);
      toast.success(`Downloaded ${images.length}-page PDF`);
    } catch (err) {
      toast.error(friendlyError(err, "Could not create the PDF."));
    }
  }

  async function deleteSavedNotebook(group: SavedNotebook) {
    if (!group.id) return;
    const n = group.pages.length;
    if (
      !window.confirm(
        `Delete the notebook "${group.title}" and its ${n} page${n === 1 ? "" : "s"}?`,
      )
    )
      return;
    const paths = group.pages.flatMap((r) =>
      [r.image_path, r.background_path].filter((x): x is string => Boolean(x)),
    );
    if (paths.length) await supabase.storage.from("handwriting").remove(paths);
    const { error } = await supabase.from("handwriting_pages").delete().eq("notebook_id", group.id);
    if (error) {
      toast.error(friendlyError(error, "Could not delete the notebook."));
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["handwriting", classId] });
    toast.success("Notebook deleted");
  }

  const { data: recordings } = useQuery({
    queryKey: ["recordings", classId],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("audio_transcripts")
        .select("id, title, transcript, duration_seconds, created_at")
        .eq("class_id", classId)
        .eq("user_id", userData.user!.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as Recording[];
    },
  });

  async function saveRecording(rec: {
    title: string;
    transcript: string;
    durationSeconds: number;
  }): Promise<boolean> {
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("You're signed out. Sign in again to save.");
      const { error } = await supabase.from("audio_transcripts").insert({
        class_id: classId,
        user_id: userId,
        title: rec.title.slice(0, 200),
        transcript: rec.transcript,
        duration_seconds: rec.durationSeconds,
      });
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["recordings", classId] });
      toast.success("Transcript saved to this class");
      return true;
    } catch (err) {
      console.error("[saveRecording]", err);
      toast.error("Could not save the transcript. It's kept here; try again.");
      return false;
    }
  }

  async function deleteRecording(rec: Recording) {
    const { error } = await supabase.from("audio_transcripts").delete().eq("id", rec.id);
    if (error) {
      toast.error("Could not delete the transcript.");
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["recordings", classId] });
    toast.success("Transcript deleted");
  }

  function addRecordingToNotes(rec: Recording) {
    setContent(
      (prev) =>
        (noteToPlainText(prev) ? toEditorHtml(prev) : "") +
        `<h2>${escapeHtml(rec.title)}</h2>` +
        plainTextToHtml(rec.transcript),
    );
    toast.success("Transcript added to your notes. Remember to save.");
  }

  async function exportRecording(rec: Recording, format: RecordingExportFormat) {
    const base = `${klass?.code || "class"}-transcript-${rec.title}`
      .replace(/[^\w.-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    if (format === "txt") {
      const header = `${rec.title}\n${klass?.subject ?? ""}${klass?.code ? ` (${klass.code})` : ""}\n${new Date(rec.created_at).toLocaleString()}\n\n`;
      const url = URL.createObjectURL(new Blob([header + rec.transcript], { type: "text/plain" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `${base}.txt`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      return;
    }
    try {
      const { exportNotes } = await import("@/lib/export-notes");
      await exportNotes(
        {
          extensions: noteContentExtensions(),
          subject: klass?.subject ?? "Class",
          code: klass?.code ?? "",
          professor: klass?.professor ?? null,
          term: klass?.term ?? null,
          notesHtml: "",
          summary: "",
          keyPoints: [],
          transcript: { title: rec.title, text: rec.transcript },
        },
        format,
        "transcript",
      );
      toast.success(`Downloaded ${format === "docx" ? "Word" : "PDF"} file`);
    } catch (err) {
      console.error("[exportRecording]", err);
      toast.error("Could not create the file. Please try again.");
    }
  }

  const { data: klass, isError: classMissing } = useQuery({
    queryKey: ["class", classId],
    // "No such class" (deleted or wrong link) is final: show the message right away.
    retry: (count, err) => (err as { code?: string }).code !== "PGRST116" && count < 2,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classes")
        .select("id, subject, professor, code, term")
        .eq("id", classId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: myNote } = useQuery({
    queryKey: ["my-note", classId],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("notes")
        .select("id, content, summary, key_points, summary_updated_at, updated_at")
        .eq("class_id", classId)
        .eq("user_id", userData.user!.id)
        .order("created_at", { ascending: false })
        .limit(1)
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
    if (!noteToPlainText(content)) {
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
      toast.error(friendlyError(err, "Could not save notes"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Not signed in");
      const { error } = await supabase
        .from("notes")
        .delete()
        .eq("class_id", classId)
        .eq("user_id", userId);
      if (error) throw error;
      setNoteId(null);
      setContent("");
      setConfirmDelete(false);
      toast.success("Your notes were deleted");
      queryClient.invalidateQueries({ queryKey: ["my-note", classId] });
    } catch (err) {
      toast.error(friendlyError(err, "Could not delete your notes"));
    } finally {
      setDeleting(false);
    }
  }

  async function handleSummarize() {
    if (!noteToPlainText(content)) {
      toast.error("Write some notes first.");
      return;
    }
    setSummarizing(true);
    try {
      await handleSave();
      await summarize({ data: { classId } });
      toast.success("Your summary is ready");
      rightViewChosen.current = true;
      setRightView("summary");
      queryClient.invalidateQueries({ queryKey: ["my-note", classId] });
      queryClient.invalidateQueries({ queryKey: ["classes"] });
    } catch (err) {
      toast.error(friendlyError(err, "Could not summarize your notes"));
    } finally {
      setSummarizing(false);
    }
  }

  const mySummary = myNote?.summary?.trim() ? myNote.summary : "";
  const keyPoints = Array.isArray(myNote?.key_points) ? (myNote.key_points as string[]) : [];
  const hasNotes = Boolean(noteToPlainText(content));
  // The summary is out of date when the notes were saved (or edited) after it was generated.
  const summaryStale = Boolean(
    mySummary &&
    myNote?.summary_updated_at &&
    myNote.updated_at &&
    new Date(myNote.updated_at).getTime() - new Date(myNote.summary_updated_at).getTime() > 10_000,
  );

  // First visit: open the summary when there are no slides yet but a summary exists.
  useEffect(() => {
    if (rightViewChosen.current || lectureSlides === undefined || myNote === undefined) return;
    rightViewChosen.current = true;
    if (lectureSlides.length === 0 && mySummary) setRightView("summary");
  }, [lectureSlides, myNote, mySummary]);

  async function handleExport(format: ExportFormat, part: ExportPart) {
    setExporting(true);
    try {
      const { exportNotes } = await import("@/lib/export-notes");
      await exportNotes(
        {
          extensions: noteContentExtensions(),
          subject: klass?.subject ?? "Class",
          code: klass?.code ?? "",
          professor: klass?.professor ?? null,
          term: klass?.term ?? null,
          notesHtml: content,
          summary: mySummary,
          keyPoints,
        },
        format,
        part,
      );
      toast.success(`Downloaded ${format === "docx" ? "Word" : "PDF"} file`);
    } catch (err) {
      console.error("[export]", err);
      toast.error("Could not create the file. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  // The class was removed (e.g. moved to Recently deleted by an admin) or never existed.
  if (classMissing) {
    return (
      <div className="flex min-h-screen flex-col">
        <AuthenticatedHeader />
        <main className="mx-auto flex w-full max-w-[100rem] flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center sm:px-6 lg:px-10 xl:px-16">
          <h1 className="text-2xl">This class isn't available</h1>
          <p className="max-w-md text-muted-foreground">
            It may have been removed by an admin. Your notes are kept, and the class will come back
            if it's restored.
          </p>
          <Button asChild>
            <Link to="/dashboard">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to dashboard
            </Link>
          </Button>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <AuthenticatedHeader trailing={klass && <Badge variant="secondary">{klass.code}</Badge>} />

      <main className="mx-auto max-w-[100rem] px-4 pt-4 pb-6 sm:px-6 lg:pb-4 lg:px-10 xl:px-16">
        {/* Compact one-line class header so the editor and slides get the height. */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              asChild
              variant="outline"
              size="sm"
              className="h-8 shrink-0 gap-1.5 px-2.5"
              title="Back to dashboard"
            >
              <Link to="/dashboard" aria-label="Back to dashboard">
                <ArrowLeft className="h-4 w-4" />
                <span className="hidden sm:inline">Dashboard</span>
              </Link>
            </Button>
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <h1 className="truncate text-xl sm:text-2xl">{klass?.subject ?? "Class"}</h1>
              <p className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
                {klass?.professor && (
                  <span className="inline-flex items-center gap-1.5 truncate">
                    <User className="h-3.5 w-3.5 shrink-0" />
                    {klass.professor}
                  </span>
                )}
                {klass?.term ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="opacity-60">·</span>
                    {klass.term}
                  </span>
                ) : null}
              </p>
            </div>
          </div>
          <Button size="sm" onClick={handleSummarize} disabled={summarizing}>
            <Sparkles className="mr-2 h-4 w-4" />
            {summarizing ? "Summarizing…" : "Summarize my notes"}
          </Button>
        </div>

        <div className="mt-3 grid gap-6 lg:grid-cols-2">
          <AdjustableClassWorkspace>
            <section className="surface-paper flex min-w-0 flex-col rounded-xl p-4 sm:p-5 lg:h-full">
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-2xl">
                  Your notes
                  <span
                    role="img"
                    title="Private: only you can see your notes and your AI summary"
                    aria-label="Private: only you can see your notes and your AI summary"
                    className="text-muted-foreground"
                  >
                    <Lock className="h-4 w-4" />
                  </span>
                </h2>
                <div className="flex items-center gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={exporting || (!hasNotes && !mySummary)}
                      >
                        <Download className="mr-2 h-4 w-4" />
                        {exporting ? "Exporting…" : "Export"}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-60">
                      {(["docx", "pdf"] as const).map((format, i) => (
                        <div key={format}>
                          {i > 0 && <DropdownMenuSeparator />}
                          <DropdownMenuLabel className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
                            {format === "docx" ? (
                              <FileText className="h-3.5 w-3.5" />
                            ) : (
                              <FileType className="h-3.5 w-3.5" />
                            )}
                            {format === "docx" ? "Word (.docx)" : "PDF"}
                          </DropdownMenuLabel>
                          <DropdownMenuItem
                            disabled={!hasNotes}
                            onSelect={() => void handleExport(format, "notes")}
                          >
                            My notes
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={!mySummary}
                            onSelect={() => void handleExport(format, "summary")}
                          >
                            My AI summary
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={!hasNotes || !mySummary}
                            onSelect={() => void handleExport(format, "both")}
                          >
                            Notes + summary
                          </DropdownMenuItem>
                        </div>
                      ))}
                      {!mySummary && (
                        <p className="px-2 py-1.5 text-xs text-muted-foreground">
                          Press "Summarize my notes" to export a summary.
                        </p>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button variant="outline" size="sm" onClick={handleSave} disabled={saving}>
                    <Save className="mr-2 h-4 w-4" />
                    {saving ? "Saving…" : "Save"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setConfirmDelete(true)}
                    disabled={deleting || (!noteId && !noteToPlainText(content))}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {deleting ? "Deleting…" : "Delete"}
                  </Button>
                </div>
              </div>

              <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete your notes for this class?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This permanently removes everything you have written for this class, including
                      its AI summary. It cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={deleting}>Keep my notes</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={(e) => {
                        e.preventDefault();
                        handleDelete();
                      }}
                      disabled={deleting}
                    >
                      {deleting ? "Deleting…" : "Yes, delete permanently"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <Tabs defaultValue="type" className="mt-4 flex min-h-0 flex-1 flex-col">
                <TabsList className="w-full shrink-0 justify-start">
                  <TabsTrigger value="type">Type</TabsTrigger>
                  <TabsTrigger value="write">Handwrite</TabsTrigger>
                  <TabsTrigger value="record" className="gap-1.5">
                    {isRecording && (
                      <span
                        className="h-2 w-2 animate-pulse rounded-full bg-red-500"
                        aria-label="Recording"
                      />
                    )}
                    Transcribe
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="type" className="flex min-h-0 flex-1 flex-col">
                  <NoteEditor
                    value={content}
                    onChange={setContent}
                    fill
                    placeholder="Start writing what the professor is covering…"
                  />
                </TabsContent>
                {/* Kept mounted so notebook pages and undo history survive switching tabs. */}
                <TabsContent
                  value="write"
                  forceMount
                  className="min-h-0 flex-1 data-[state=inactive]:hidden lg:overflow-y-auto lg:pr-1"
                >
                  <div className="mt-3">
                    <HandwritingNotebook
                      ref={notebookRef}
                      classId={classId}
                      converting={converting}
                      onConvert={handleConvert}
                      onSave={handleSavePage}
                      onRenameNotebook={(id, t) => void renameNotebook(id, t)}
                      defaultTitle={`${klass?.code ? `${klass.code} ` : ""}notebook · ${new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" })}`}
                      slidesPanel={
                        activeSlides ? (
                          <div className="flex min-h-0 flex-1 flex-col gap-2">
                            {lectureSlides && lectureSlides.length > 1 && (
                              <div
                                className="flex shrink-0 gap-1 overflow-x-auto rounded-lg bg-muted p-1 [scrollbar-width:none]"
                                role="tablist"
                                aria-label="Slide decks"
                              >
                                {lectureSlides.map((item) => (
                                  <button
                                    key={item.id}
                                    type="button"
                                    role="tab"
                                    aria-selected={item.id === activeSlides.id}
                                    onClick={() => setSelectedSlideId(item.id)}
                                    className={cn(
                                      "max-w-[12rem] shrink-0 truncate rounded-md px-2.5 py-1 text-xs font-medium",
                                      item.id === activeSlides.id
                                        ? "bg-background text-foreground shadow-sm"
                                        : "text-muted-foreground hover:text-foreground",
                                    )}
                                  >
                                    {item.title || item.file_name}
                                  </button>
                                ))}
                              </div>
                            )}
                            <LectureSlideViewer
                              key={`fullscreen-${activeSlides.id}`}
                              slideId={activeSlides.id}
                              filePath={activeSlides.file_path}
                              fileName={activeSlides.file_name}
                              contentType={activeSlides.content_type}
                            />
                          </div>
                        ) : undefined
                      }
                    />
                  </div>

                  <div className="mt-6">
                    <p className="text-xs uppercase tracking-widest text-muted-foreground">
                      Saved notebooks
                    </p>
                    <NotebookViewer
                      open={Boolean(viewingGroup)}
                      onOpenChange={(o) => !o && setViewing(null)}
                      title={viewingGroup?.title ?? ""}
                      pages={(viewingGroup?.pages ?? []).map((r) => ({ id: r.id, url: r.url }))}
                      startIndex={viewing?.index ?? 0}
                      onDownload={
                        viewingGroup ? () => void downloadSavedNotebook(viewingGroup) : undefined
                      }
                      onEdit={(i) => {
                        const g = viewingGroup;
                        setViewing(null);
                        if (!g) return;
                        if (g.id) void openSavedNotebook(g, i);
                        else if (g.pages[i] && Array.isArray(g.pages[i]!.strokes))
                          void openSavedPage(g.pages[i]!);
                      }}
                    />
                    {savedNotebooks.length > 0 ? (
                      <ul className="mt-3 space-y-3" data-testid="saved-notebooks">
                        {savedNotebooks.map((nb) => (
                          <li
                            key={nb.id ?? "loose"}
                            className="rounded-lg border border-border/60 bg-background/60 p-3"
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium">{nb.title}</p>
                                <p className="text-xs text-muted-foreground">
                                  {nb.pages.length} page{nb.pages.length === 1 ? "" : "s"} · updated{" "}
                                  {new Date(nb.updatedAt).toLocaleString()}
                                </p>
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setViewing({ key: nb.id ?? "loose", index: 0 })}
                                aria-label={`View ${nb.title}`}
                                title="View the pages (no editing)"
                              >
                                <Eye className="mr-1.5 h-3.5 w-3.5" /> View
                              </Button>
                              {nb.id && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => void openSavedNotebook(nb)}
                                  aria-label={`Open ${nb.title}`}
                                  title="Open to keep writing"
                                >
                                  <Pencil className="mr-1.5 h-3.5 w-3.5" /> Open
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => void downloadSavedNotebook(nb)}
                                aria-label={`Download ${nb.title} as PDF`}
                              >
                                <Download className="mr-1.5 h-3.5 w-3.5" /> PDF
                              </Button>
                              {nb.id && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                  onClick={() => void deleteSavedNotebook(nb)}
                                  aria-label={`Delete ${nb.title}`}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                            <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                              {nb.pages.map((page, i) => (
                                <div
                                  key={page.id}
                                  className="w-28 shrink-0 overflow-hidden rounded-md border border-border/60 bg-white"
                                >
                                  <button
                                    type="button"
                                    className="block w-full"
                                    onClick={() => setViewing({ key: nb.id ?? "loose", index: i })}
                                    aria-label={`View page ${i + 1} of ${nb.title}`}
                                  >
                                    {page.url && (
                                      <img
                                        src={page.url}
                                        alt={`${nb.title}, page ${i + 1}`}
                                        loading="lazy"
                                        className="h-20 w-full object-cover object-top"
                                      />
                                    )}
                                  </button>
                                  <div className="flex items-center px-1 py-0.5">
                                    <span className="flex-1 text-[0.625rem] text-muted-foreground">
                                      Page {i + 1}
                                    </span>
                                    {Array.isArray(page.strokes) && (
                                      <button
                                        type="button"
                                        className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                                        onClick={() =>
                                          nb.id
                                            ? void openSavedNotebook(nb, i)
                                            : void openSavedPage(page)
                                        }
                                        aria-label="Edit this page"
                                        title="Edit this page"
                                      >
                                        <Pencil className="h-3 w-3" />
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      className="rounded p-0.5 text-muted-foreground hover:text-destructive"
                                      onClick={() => void deleteSavedPage(page)}
                                      aria-label="Delete this page"
                                      title="Delete this page"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-sm text-muted-foreground">
                        Notebooks you save are kept here. Open one to keep writing, or download it
                        as a single PDF.
                      </p>
                    )}
                  </div>

                  <div className="mt-6">
                    <p className="text-xs uppercase tracking-widest text-muted-foreground">
                      Saved lecture transcripts
                    </p>
                    <RecordingsList
                      recordings={recordings}
                      onExport={(r, f) => void exportRecording(r, f)}
                      onAddToNotes={addRecordingToNotes}
                      onDelete={deleteRecording}
                      emptyText="Transcripts you record in the Transcribe tab are saved here too."
                    />
                  </div>
                </TabsContent>
                {/* Kept mounted so a recording keeps running while you switch tabs. */}
                <TabsContent
                  value="record"
                  forceMount
                  className="min-h-0 flex-1 data-[state=inactive]:hidden lg:overflow-y-auto lg:pr-1"
                >
                  <AudioTranscriber
                    classId={classId}
                    defaultTitle={`${klass?.code ? `${klass.code} ` : ""}lecture – ${new Date().toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`}
                    transcribeChunk={async (args) => (await transcribeAudio({ data: args })).text}
                    onSave={saveRecording}
                    onRecordingChange={setIsRecording}
                    whisperAvailable={transcriptionSetup?.whisper ?? false}
                  />
                  <div className="mt-6">
                    <p className="text-xs uppercase tracking-widest text-muted-foreground">
                      Saved lecture transcripts
                    </p>
                    <RecordingsList
                      recordings={recordings}
                      onExport={(r, f) => void exportRecording(r, f)}
                      onAddToNotes={addRecordingToNotes}
                      onDelete={deleteRecording}
                    />
                  </div>
                </TabsContent>
              </Tabs>
            </section>

            <section
              className="surface-paper flex min-w-0 flex-col rounded-xl p-4 sm:p-5 lg:h-full"
              aria-label="Lecture slides and AI summary"
            >
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
                <h2
                  className="flex items-baseline gap-5 text-2xl"
                  role="tablist"
                  aria-label="Show slides or AI summary"
                >
                  {(
                    [
                      ["slides", "Slides"],
                      ["summary", "Summary"],
                    ] as const
                  ).map(([view, label]) => {
                    const active = rightView === view;
                    return (
                      <button
                        key={view}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => {
                          rightViewChosen.current = true;
                          setRightView(view);
                        }}
                        className={cn(
                          "relative inline-flex items-center gap-1.5 pb-1 transition-colors after:absolute after:inset-x-0 after:-bottom-0.5 after:h-0.5 after:rounded-full after:transition-colors",
                          active
                            ? "text-foreground after:bg-primary"
                            : "text-muted-foreground/70 after:bg-transparent hover:text-foreground",
                        )}
                      >
                        {view === "summary" && <Sparkles className="h-5 w-5 text-primary" />}
                        {label}
                        {view === "summary" && summaryStale && (
                          <span
                            className="absolute -right-2.5 top-0.5 h-2 w-2 rounded-full bg-amber-500"
                            aria-label="Summary is out of date"
                          />
                        )}
                      </button>
                    );
                  })}
                </h2>
                <input
                  ref={slidesInputRef}
                  type="file"
                  accept=".pdf,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                  className="hidden"
                  aria-label="Upload lecture slides"
                  onChange={(event) => void handleSlideUpload(event.target.files?.[0])}
                />
                {rightView === "slides" ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={uploadingSlides}
                    onClick={() => slidesInputRef.current?.click()}
                  >
                    <FileUp className="mr-2 h-4 w-4" />
                    {uploadingSlides ? "Uploading…" : "Add slides"}
                  </Button>
                ) : (
                  mySummary && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={summarizing || !hasNotes}
                      onClick={handleSummarize}
                    >
                      <Sparkles className="mr-2 h-4 w-4" />
                      {summarizing ? "Summarizing…" : "Regenerate"}
                    </Button>
                  )
                )}
              </div>

              {rightView === "summary" && (
                <div
                  className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1 lg:overscroll-contain"
                  aria-label="Your AI summary"
                >
                  {mySummary ? (
                    <>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                          <Sparkles className="h-3.5 w-3.5 text-primary" /> Summary of your notes
                        </span>
                        {myNote?.summary_updated_at && (
                          <span>
                            Generated {new Date(myNote.summary_updated_at).toLocaleString()}
                          </span>
                        )}
                        {summaryStale && (
                          <button
                            type="button"
                            onClick={handleSummarize}
                            disabled={summarizing}
                            className="ml-auto rounded-full bg-amber-100 px-2.5 py-0.5 font-medium text-amber-800 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-200"
                          >
                            Notes changed · update summary
                          </button>
                        )}
                      </div>
                      {keyPoints.length > 0 && (
                        <div className="mt-4 rounded-lg border border-primary/15 bg-primary/5 p-4">
                          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
                            Key takeaways
                          </p>
                          <ul className="mt-2 space-y-1.5 text-[0.9375rem] leading-relaxed">
                            {keyPoints.map((point, i) => (
                              <li key={i} className="flex gap-2">
                                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
                                <span>{point}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <div className="prose-notes mt-4 space-y-2 text-base leading-relaxed [&_h3]:mt-5 [&_h3]:text-xl">
                        {renderNote(mySummary)}
                      </div>
                    </>
                  ) : (
                    <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-border bg-background/40 px-6 text-center">
                      <span className="grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary">
                        <Sparkles className="h-5 w-5" />
                      </span>
                      <span className="text-base font-medium">
                        Turn your notes into a study summary
                      </span>
                      <span className="max-w-xs text-sm text-muted-foreground">
                        Write your notes, then get a comprehensive summary and key takeaways of
                        everything you wrote, right here next to your notes.
                      </span>
                      <Button
                        onClick={handleSummarize}
                        disabled={summarizing || !hasNotes}
                        className="mt-1"
                      >
                        <Sparkles className="mr-2 h-4 w-4" />
                        {summarizing ? "Summarizing…" : "Summarize my notes"}
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* Slides stay mounted while the summary is shown, so switching back is instant. */}
              <div
                className={cn("flex min-h-0 flex-1 flex-col", rightView !== "slides" && "hidden")}
              >
                {lectureSlides && lectureSlides.length > 0 && (
                  <div className="mt-4 flex h-9 shrink-0 items-center gap-1 rounded-lg bg-muted p-1">
                    <div
                      className="flex min-w-0 flex-1 gap-1 overflow-x-auto [scrollbar-width:none]"
                      role="tablist"
                      aria-label="Your slide decks"
                    >
                      {lectureSlides.map((item) => {
                        const active = item.id === activeSlides?.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            role="tab"
                            aria-selected={active}
                            title={item.file_name}
                            onClick={() => setSelectedSlideId(item.id)}
                            className={cn(
                              "max-w-[14rem] shrink-0 truncate rounded-md px-3 py-1 text-sm font-medium transition-colors",
                              active
                                ? "bg-background text-foreground shadow-sm"
                                : "text-muted-foreground hover:text-foreground",
                            )}
                          >
                            {item.title || item.file_name}
                          </button>
                        );
                      })}
                    </div>
                    {activeSlides && (
                      <div className="flex shrink-0 items-center border-l border-border/70 pl-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          aria-label="Rename slides"
                          title="Rename slides"
                          onClick={() => void handleSlideRename()}
                        >
                          <Pencil />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Remove selected slides"
                          title="Remove selected slides"
                          disabled={removingSlideId === activeSlides.id}
                          onClick={() => void handleSlideRemove()}
                          className="h-7 w-7 text-destructive hover:text-destructive"
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {activeSlides ? (
                  <div className="mt-3 flex min-h-0 flex-1 flex-col">
                    <LectureSlideViewer
                      key={activeSlides.id}
                      slideId={activeSlides.id}
                      filePath={activeSlides.file_path}
                      fileName={activeSlides.file_name}
                      contentType={activeSlides.content_type}
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => slidesInputRef.current?.click()}
                    disabled={uploadingSlides}
                    className="mt-4 flex min-h-[320px] flex-1 flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-border bg-background/40 px-6 text-center transition-colors hover:border-primary/40 hover:bg-background/70"
                  >
                    <span className="grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary">
                      <FileUp className="h-5 w-5" />
                    </span>
                    <span className="text-base font-medium">Add your lecture slides</span>
                    <span className="max-w-xs text-sm text-muted-foreground">
                      Upload a PDF or PowerPoint (.pptx) to follow along next to your notes.
                    </span>
                  </button>
                )}
              </div>
            </section>
          </AdjustableClassWorkspace>
        </div>
      </main>
    </div>
  );
}
