import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Folder,
  FileStack,
  FolderOpen,
  Maximize2,
  Minimize2,
  Mic,
  Search,
  Sparkles,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AuthenticatedHeader } from "@/components/AuthenticatedHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SafeNoteHtml } from "@/components/SafeNoteHtml";
import { renderNote } from "@/components/SummaryMarkdown";
import { NotebookViewer } from "@/components/NotebookViewer";
import { noteToPlainText } from "@/lib/note-format";
import { listAudioIds, audioUrl } from "@/lib/lecture-audio";
import { TranscriptText } from "@/components/TranscriptText";
import { AudioPlayer } from "@/components/AudioPlayer";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/notes")({
  staticData: { sitemap: false },
  // ?tool=pdf opens PDF Studio straight away.
  validateSearch: (s: Record<string, unknown>): { tool?: "pdf" } =>
    s["tool"] === "pdf" ? { tool: "pdf" } : {},
  head: () => ({ meta: [{ title: "My notes — LectureLoop" }] }),
  component: MyNotesPage,
});

type Klass = { id: string; subject: string; code: string; professor: string };
type Note = {
  class_id: string;
  content: string;
  summary: string;
  key_points: unknown;
  updated_at: string;
  summary_updated_at: string | null;
};
type Page = {
  id: string;
  class_id: string;
  notebook_id: string | null;
  notebook_title: string | null;
  page_index: number;
  image_path: string;
  created_at: string;
  updated_at: string;
};
type Transcript = {
  id: string;
  class_id: string;
  title: string;
  duration_seconds: number;
  created_at: string;
};
type Notebook = { id: string; title: string; pages: Page[]; updatedAt: string };

/** What's selected in the tree. */
type Sel =
  | { kind: "all" }
  | { kind: "pdf" }
  | { kind: "class"; classId: string }
  | { kind: "typed"; classId: string }
  | { kind: "summary"; classId: string }
  | { kind: "notebook"; classId: string; notebookId: string }
  | { kind: "transcript"; classId: string; transcriptId: string };

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const fmtDuration = (s: number) =>
  `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

function downloadText(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name.replace(/[^\w.-]+/g, "-").replace(/-+/g, "-")}.txt`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function MyNotesPage() {
  const { data, isPending } = useQuery({
    queryKey: ["my-notes-library"],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user!.id;
      const { data: enr } = await supabase
        .from("enrollments")
        .select("class_id")
        .eq("user_id", userId);
      const ids = (enr ?? []).map((e) => e.class_id);
      if (!ids.length)
        return {
          classes: [] as Klass[],
          notes: [] as Note[],
          pages: [] as Page[],
          transcripts: [] as Transcript[],
        };
      const [c, n, p, t] = await Promise.all([
        supabase
          .from("classes")
          .select("id, subject, code, professor")
          .in("id", ids)
          .order("subject"),
        supabase
          .from("notes")
          .select("class_id, content, summary, key_points, updated_at, summary_updated_at")
          .eq("user_id", userId)
          .in("class_id", ids),
        supabase
          .from("handwriting_pages")
          .select(
            "id, class_id, notebook_id, notebook_title, page_index, image_path, created_at, updated_at",
          )
          .eq("user_id", userId)
          .in("class_id", ids)
          .order("page_index")
          .limit(2000),
        supabase
          .from("audio_transcripts")
          .select("id, class_id, title, duration_seconds, created_at")
          .eq("user_id", userId)
          .in("class_id", ids)
          .order("created_at", { ascending: false })
          .limit(500),
      ]);
      return {
        classes: (c.data ?? []) as Klass[],
        notes: (n.data ?? []) as Note[],
        pages: (p.data ?? []) as Page[],
        transcripts: (t.data ?? []) as Transcript[],
      };
    },
  });

  // Everything grouped by subject.
  const library = useMemo(() => {
    if (!data) return [];
    return data.classes.map((k) => {
      const note = data.notes.find((n) => n.class_id === k.id) ?? null;
      const books = new Map<string, Notebook>();
      for (const pg of data.pages.filter((x) => x.class_id === k.id)) {
        const id = pg.notebook_id ?? "loose";
        const b = books.get(id) ?? {
          id,
          title: pg.notebook_id ? pg.notebook_title || "Notebook" : "Earlier pages",
          pages: [],
          updatedAt: pg.updated_at,
        };
        b.pages.push(pg);
        if (pg.updated_at > b.updatedAt) b.updatedAt = pg.updated_at;
        books.set(id, b);
      }
      const typed = note && noteToPlainText(note.content) ? note : null;
      const summary = note?.summary?.trim() ? note : null;
      const notebooks = [...books.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      const transcripts = data.transcripts.filter((x) => x.class_id === k.id);
      const count = (typed ? 1 : 0) + (summary ? 1 : 0) + notebooks.length + transcripts.length;
      return { klass: k, typed, summary, notebooks, transcripts, count };
    });
  }, [data]);

  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [sel, setSelState] = useState<Sel>(
    search.tool === "pdf" ? { kind: "pdf" } : { kind: "all" },
  );
  // Keep ?tool=pdf in the address bar while PDF Studio is open (shareable, survives reload).
  const setSel = (s: Sel) => {
    setSelState(s);
    void navigate({
      search: s.kind === "pdf" ? { tool: "pdf" } : {},
      replace: true,
      resetScroll: false,
    });
  };
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const visible = library.filter(
    (s) =>
      !q ||
      `${s.klass.subject} ${s.klass.code} ${s.klass.professor}`.toLowerCase().includes(q) ||
      s.notebooks.some((b) => b.title.toLowerCase().includes(q)) ||
      s.transcripts.some((t) => t.title.toLowerCase().includes(q)),
  );
  const isOpen = (id: string) => open[id] ?? (q ? true : false);
  const toggle = (id: string) => setOpen((o) => ({ ...o, [id]: !isOpen(id) }));
  const viewerRef = useRef<HTMLElement>(null);
  const choose = (s: Sel) => {
    setSel(s);
    if ("classId" in s) setOpen((o) => ({ ...o, [s.classId]: true }));
    // Phones and narrow windows: the viewer is under the tree, so bring it into view.
    if (s.kind !== "class" && window.innerWidth < 1024)
      requestAnimationFrame(() =>
        viewerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      );
  };

  const subject = "classId" in sel ? library.find((s) => s.klass.id === sel.classId) : undefined;
  const totals = library.reduce((n, s) => n + s.count, 0);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AuthenticatedHeader />
      <main className="mx-auto w-full max-w-[100rem] flex-1 px-4 py-8 sm:px-6 lg:px-10 xl:px-16">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl sm:text-4xl">My notes</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Everything you've saved, in a folder for each subject.
            </p>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search subjects and notebooks"
              aria-label="Search my notes"
              className="pl-8"
            />
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[20rem_1fr]">
          {/* Folder tree */}
          <nav
            aria-label="Notes folders"
            className="surface-paper h-fit rounded-xl p-2 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto"
          >
            <ul role="tree" aria-label="Subjects" data-testid="notes-tree">
              <TreeRow
                depth={0}
                icon={<FolderOpen className="h-4 w-4 text-primary" />}
                label="All subjects"
                meta={isPending ? "" : String(totals)}
                selected={sel.kind === "all"}
                onClick={() => setSel({ kind: "all" })}
              />
              {isPending && <li className="px-3 py-2 text-sm text-muted-foreground">Loading…</li>}
              {visible.map((s) => {
                const id = s.klass.id;
                const expanded = isOpen(id);
                return (
                  <li
                    key={id}
                    role="treeitem"
                    aria-expanded={expanded}
                    aria-selected={sel.kind === "class" && sel.classId === id}
                  >
                    <TreeRow
                      depth={0}
                      chevron={expanded ? "open" : "closed"}
                      onChevron={() => toggle(id)}
                      icon={
                        expanded ? (
                          <FolderOpen className="h-4 w-4 text-amber-500" />
                        ) : (
                          <Folder className="h-4 w-4 text-amber-500" />
                        )
                      }
                      label={
                        s.klass.code ? `${s.klass.code} · ${s.klass.subject}` : s.klass.subject
                      }
                      meta={String(s.count)}
                      selected={sel.kind === "class" && sel.classId === id}
                      onClick={() => choose({ kind: "class", classId: id })}
                      asItem={false}
                    />
                    {expanded && (
                      <ul role="group">
                        {s.count === 0 && (
                          <li className="py-1 pl-12 text-xs text-muted-foreground">
                            Nothing saved yet
                          </li>
                        )}
                        {s.typed && (
                          <TreeRow
                            depth={1}
                            icon={<FileText className="h-4 w-4 text-sky-600" />}
                            label="Typed notes"
                            meta={fmtDate(s.typed.updated_at)}
                            selected={sel.kind === "typed" && sel.classId === id}
                            onClick={() => choose({ kind: "typed", classId: id })}
                          />
                        )}
                        {s.summary && (
                          <TreeRow
                            depth={1}
                            icon={<Sparkles className="h-4 w-4 text-violet-600" />}
                            label="AI summary"
                            selected={sel.kind === "summary" && sel.classId === id}
                            onClick={() => choose({ kind: "summary", classId: id })}
                          />
                        )}
                        {s.notebooks.length > 0 && (
                          <SubFolder
                            id={`${id}:hw`}
                            label="Handwritten"
                            count={s.notebooks.length}
                            open={isOpen(`${id}:hw`) || ("notebookId" in sel && sel.classId === id)}
                            onToggle={() => toggle(`${id}:hw`)}
                          >
                            {s.notebooks.map((b) => (
                              <TreeRow
                                key={b.id}
                                depth={2}
                                icon={<BookOpen className="h-4 w-4 text-emerald-600" />}
                                label={b.title}
                                meta={`${b.pages.length} p`}
                                selected={
                                  sel.kind === "notebook" &&
                                  sel.notebookId === b.id &&
                                  sel.classId === id
                                }
                                onClick={() =>
                                  choose({ kind: "notebook", classId: id, notebookId: b.id })
                                }
                              />
                            ))}
                          </SubFolder>
                        )}
                        {s.transcripts.length > 0 && (
                          <SubFolder
                            id={`${id}:audio`}
                            label="Lecture transcripts"
                            count={s.transcripts.length}
                            open={
                              isOpen(`${id}:audio`) || ("transcriptId" in sel && sel.classId === id)
                            }
                            onToggle={() => toggle(`${id}:audio`)}
                          >
                            {s.transcripts.map((t) => (
                              <TreeRow
                                key={t.id}
                                depth={2}
                                icon={<Mic className="h-4 w-4 text-rose-600" />}
                                label={t.title || "Lecture recording"}
                                meta={fmtDate(t.created_at)}
                                selected={sel.kind === "transcript" && sel.transcriptId === t.id}
                                onClick={() =>
                                  choose({ kind: "transcript", classId: id, transcriptId: t.id })
                                }
                              />
                            ))}
                          </SubFolder>
                        )}
                      </ul>
                    )}
                  </li>
                );
              })}
              {!isPending && !library.length && (
                <li className="px-3 py-3 text-sm text-muted-foreground">
                  You haven't joined a class yet.{" "}
                  <Link to="/dashboard" className="text-primary underline">
                    Go to your dashboard
                  </Link>
                </li>
              )}
            </ul>
            <p className="mt-3 border-t border-border px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Tools
            </p>
            <ul role="tree" aria-label="Tools">
              <TreeRow
                depth={0}
                icon={<FileStack className="h-4 w-4 text-red-600" />}
                label="PDF Studio"
                meta="merge · split · convert"
                selected={sel.kind === "pdf"}
                onClick={() => choose({ kind: "pdf" })}
              />
            </ul>
          </nav>

          {/* Viewer */}
          <section
            ref={viewerRef}
            className="min-w-0 scroll-mt-4"
            aria-live="polite"
            data-testid="notes-viewer"
          >
            {sel.kind === "pdf" ? (
              <PdfStudio onBack={() => setSel({ kind: "all" })} />
            ) : sel.kind === "all" || !subject ? (
              <Overview
                library={library}
                loading={isPending}
                onOpen={(id) => choose({ kind: "class", classId: id })}
                onPdf={() => choose({ kind: "pdf" })}
              />
            ) : (
              <>
                <Breadcrumb
                  items={[
                    { label: "My notes", onClick: () => setSel({ kind: "all" }) },
                    {
                      label: subject.klass.code || subject.klass.subject,
                      onClick: () => setSel({ kind: "class", classId: subject.klass.id }),
                    },
                    ...(sel.kind === "class" ? [] : [{ label: itemLabel(sel, subject) }]),
                  ]}
                />
                <ItemView sel={sel} subject={subject} onChoose={choose} />
              </>
            )}
          </section>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

type Subject = {
  klass: Klass;
  typed: Note | null;
  summary: Note | null;
  notebooks: Notebook[];
  transcripts: Transcript[];
  count: number;
};

function itemLabel(sel: Sel, s: Subject) {
  if (sel.kind === "typed") return "Typed notes";
  if (sel.kind === "summary") return "AI summary";
  if (sel.kind === "notebook")
    return s.notebooks.find((b) => b.id === sel.notebookId)?.title ?? "Notebook";
  if (sel.kind === "transcript")
    return s.transcripts.find((t) => t.id === sel.transcriptId)?.title ?? "Transcript";
  return "";
}

function TreeRow({
  depth,
  icon,
  label,
  meta,
  selected,
  onClick,
  chevron,
  onChevron,
  asItem = true,
}: {
  depth: number;
  icon: ReactNode;
  label: string;
  meta?: string;
  selected?: boolean;
  onClick: () => void;
  chevron?: "open" | "closed";
  onChevron?: () => void;
  asItem?: boolean;
}) {
  const row = (
    <div
      className={cn(
        "group flex items-center gap-1 rounded-md pr-2 text-sm",
        selected ? "bg-primary/10 font-medium text-primary" : "hover:bg-muted",
      )}
      style={{ paddingLeft: 4 + depth * 18 }}
    >
      {chevron ? (
        <button
          type="button"
          onClick={onChevron}
          className="grid h-7 w-6 shrink-0 place-items-center rounded text-muted-foreground hover:text-foreground"
          aria-label={chevron === "open" ? `Collapse ${label}` : `Expand ${label}`}
        >
          {chevron === "open" ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>
      ) : (
        <span className="w-6 shrink-0" />
      )}
      <button
        type="button"
        onClick={onClick}
        className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left"
        aria-current={selected ? "true" : undefined}
      >
        {icon}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {meta && <span className="shrink-0 text-xs font-normal text-muted-foreground">{meta}</span>}
      </button>
    </div>
  );
  return asItem ? (
    <li role="treeitem" aria-selected={!!selected}>
      {row}
    </li>
  ) : (
    row
  );
}

function SubFolder({
  id,
  label,
  count,
  open,
  onToggle,
  children,
}: {
  id: string;
  label: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <li role="treeitem" aria-expanded={open} aria-selected={false} data-folder={id}>
      <TreeRow
        depth={1}
        chevron={open ? "open" : "closed"}
        onChevron={onToggle}
        icon={
          open ? (
            <FolderOpen className="h-4 w-4 text-amber-500" />
          ) : (
            <Folder className="h-4 w-4 text-amber-500" />
          )
        }
        label={label}
        meta={String(count)}
        onClick={onToggle}
        asItem={false}
      />
      {open && <ul role="group">{children}</ul>}
    </li>
  );
}

function Breadcrumb({ items }: { items: { label: string; onClick?: () => void }[] }) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="mb-4 flex flex-wrap items-center gap-1 text-sm text-muted-foreground"
    >
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="h-3.5 w-3.5" />}
          {it.onClick && i < items.length - 1 ? (
            <button
              type="button"
              onClick={it.onClick}
              className="hover:text-foreground hover:underline"
            >
              {it.label}
            </button>
          ) : (
            <span className="font-medium text-foreground">{it.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

function Overview({
  library,
  loading,
  onOpen,
  onPdf,
}: {
  library: Subject[];
  loading: boolean;
  onOpen: (id: string) => void;
  onPdf: () => void;
}) {
  return (
    <div className="space-y-6">
      <SubjectFolders library={library} loading={loading} onOpen={onOpen} />
      <button
        type="button"
        onClick={onPdf}
        className="flex w-full items-center gap-4 rounded-xl border border-red-200 bg-red-50/60 p-4 text-left transition-colors hover:bg-red-50 dark:border-red-900 dark:bg-red-950/30"
        data-testid="pdf-studio-card"
      >
        <FileStack className="h-8 w-8 shrink-0 text-red-600" />
        <span className="min-w-0 flex-1">
          <span className="block font-medium">PDF Studio</span>
          <span className="block text-sm text-muted-foreground">
            Merge, split, compress, convert, edit and sign PDFs, and turn Word, Excel, PowerPoint or
            images into PDFs.
          </span>
        </span>
        <ChevronRight className="h-5 w-5 text-muted-foreground" />
      </button>
    </div>
  );
}

function SubjectFolders({
  library,
  loading,
  onOpen,
}: {
  library: Subject[];
  loading: boolean;
  onOpen: (id: string) => void;
}) {
  if (loading)
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-hidden>
        {[0, 1, 2].map((i) => (
          <div key={i} className="surface-paper h-32 animate-pulse rounded-xl" />
        ))}
      </div>
    );
  if (!library.length)
    return (
      <p className="text-sm text-muted-foreground">
        Join a class on your dashboard to start saving notes.
      </p>
    );
  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" data-testid="subject-folders">
      {library.map((s) => (
        <li key={s.klass.id}>
          <button
            type="button"
            onClick={() => onOpen(s.klass.id)}
            className="surface-paper flex h-full w-full flex-col rounded-xl p-5 text-left transition-shadow hover:shadow-md"
          >
            <Folder className="h-6 w-6 text-amber-500" />
            <span className="mt-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {s.klass.code}
            </span>
            <span className="text-lg font-medium leading-snug">{s.klass.subject}</span>
            <span className="mt-2 text-xs text-muted-foreground">
              {s.count === 0
                ? "Nothing saved yet"
                : [
                    s.typed && "typed notes",
                    s.summary && "AI summary",
                    s.notebooks.length &&
                      `${s.notebooks.length} notebook${s.notebooks.length === 1 ? "" : "s"}`,
                    s.transcripts.length &&
                      `${s.transcripts.length} transcript${s.transcripts.length === 1 ? "" : "s"}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function ItemView({
  sel,
  subject,
  onChoose,
}: {
  sel: Sel;
  subject: Subject;
  onChoose: (s: Sel) => void;
}) {
  const k = subject.klass;
  const openClass = (
    <Button asChild size="sm" variant="outline">
      <Link to="/class/$classId" params={{ classId: k.id }}>
        <ExternalLink className="mr-1.5 h-4 w-4" /> Open in class
      </Link>
    </Button>
  );

  if (sel.kind === "class") {
    const files: { key: string; icon: ReactNode; label: string; meta: string; go: Sel }[] = [
      ...(subject.typed
        ? [
            {
              key: "t",
              icon: <FileText className="h-5 w-5 text-sky-600" />,
              label: "Typed notes",
              meta: `Edited ${fmtDate(subject.typed.updated_at)}`,
              go: { kind: "typed", classId: k.id } as Sel,
            },
          ]
        : []),
      ...(subject.summary
        ? [
            {
              key: "s",
              icon: <Sparkles className="h-5 w-5 text-violet-600" />,
              label: "AI summary",
              meta: subject.summary.summary_updated_at
                ? `Made ${fmtDate(subject.summary.summary_updated_at)}`
                : "",
              go: { kind: "summary", classId: k.id } as Sel,
            },
          ]
        : []),
      ...subject.notebooks.map((b) => ({
        key: b.id,
        icon: <BookOpen className="h-5 w-5 text-emerald-600" />,
        label: b.title,
        meta: `${b.pages.length} page${b.pages.length === 1 ? "" : "s"} · ${fmtDate(b.updatedAt)}`,
        go: { kind: "notebook", classId: k.id, notebookId: b.id } as Sel,
      })),
      ...subject.transcripts.map((t) => ({
        key: t.id,
        icon: <Mic className="h-5 w-5 text-rose-600" />,
        label: t.title || "Lecture recording",
        meta: `${fmtDuration(t.duration_seconds)} · ${fmtDate(t.created_at)}`,
        go: { kind: "transcript", classId: k.id, transcriptId: t.id } as Sel,
      })),
    ];
    return (
      <div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl">{k.subject}</h2>
            <p className="text-sm text-muted-foreground">
              {[k.code, k.professor].filter(Boolean).join(" · ")}
            </p>
          </div>
          {openClass}
        </div>
        {files.length ? (
          <ul className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="folder-files">
            {files.map((f) => (
              <li key={f.key}>
                <button
                  type="button"
                  onClick={() => onChoose(f.go)}
                  className="flex w-full items-center gap-3 rounded-xl border border-border/70 bg-background p-4 text-left transition-colors hover:bg-muted/50"
                >
                  {f.icon}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{f.label}</span>
                    {f.meta && (
                      <span className="block text-xs text-muted-foreground">{f.meta}</span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-5 text-sm text-muted-foreground">
            Nothing saved in this subject yet. Notes, notebooks and transcripts you save in the
            class show up here.
          </p>
        )}
      </div>
    );
  }

  if (sel.kind === "typed" && subject.typed) {
    const n = subject.typed;
    return (
      <article>
        <Header title="Typed notes" meta={`${k.subject} · edited ${fmtDate(n.updated_at)}`}>
          <Button
            size="sm"
            variant="outline"
            onClick={() => downloadText(`${k.code || k.subject} notes`, noteToPlainText(n.content))}
          >
            <Download className="mr-1.5 h-4 w-4" /> .txt
          </Button>
          {openClass}
        </Header>
        <div className="surface-paper mt-4 rounded-xl">
          <SafeNoteHtml content={n.content} className="note-doc px-6 py-5" />
        </div>
      </article>
    );
  }

  if (sel.kind === "summary" && subject.summary) {
    const n = subject.summary;
    const points = Array.isArray(n.key_points) ? (n.key_points as string[]) : [];
    return (
      <article>
        <Header
          title="AI summary"
          meta={`${k.subject}${n.summary_updated_at ? ` · made ${fmtDate(n.summary_updated_at)}` : ""}`}
        >
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              downloadText(
                `${k.code || k.subject} summary`,
                n.summary + (points.length ? `\n\nKey points\n- ${points.join("\n- ")}` : ""),
              )
            }
          >
            <Download className="mr-1.5 h-4 w-4" /> .txt
          </Button>
          {openClass}
        </Header>
        {points.length > 0 && (
          <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50/60 p-4 dark:border-violet-900 dark:bg-violet-950/30">
            <p className="text-xs font-semibold uppercase tracking-wider text-violet-700 dark:text-violet-300">
              Key points
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
              {points.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="surface-paper prose-notes mt-4 rounded-xl px-6 py-5 text-sm">
          {renderNote(n.summary)}
        </div>
      </article>
    );
  }

  if (sel.kind === "notebook") {
    const book = subject.notebooks.find((b) => b.id === sel.notebookId);
    if (book) return <NotebookView book={book} subject={subject} openClass={openClass} />;
  }

  if (sel.kind === "transcript") {
    const t = subject.transcripts.find((x) => x.id === sel.transcriptId);
    if (t) return <TranscriptView t={t} subject={subject} openClass={openClass} />;
  }

  return <p className="text-sm text-muted-foreground">This item isn't available any more.</p>;
}

function Header({ title, meta, children }: { title: string; meta: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="truncate text-2xl">{title}</h2>
        <p className="text-sm text-muted-foreground">{meta}</p>
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function NotebookView({
  book,
  subject,
  openClass,
}: {
  book: Notebook;
  subject: Subject;
  openClass: ReactNode;
}) {
  const { data: urls } = useQuery({
    queryKey: ["notebook-urls", book.id, book.pages.map((p) => p.image_path).join()],
    staleTime: 50 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase.storage.from("handwriting").createSignedUrls(
        book.pages.map((p) => p.image_path),
        3600,
      );
      return (data ?? []).map((d) => d.signedUrl ?? null);
    },
  });
  const [viewAt, setViewAt] = useState<number | null>(null);
  return (
    <article>
      <Header
        title={book.title}
        meta={`${subject.klass.subject} · ${book.pages.length} page${book.pages.length === 1 ? "" : "s"} · updated ${fmtDate(book.updatedAt)}`}
      >
        <Button size="sm" variant="outline" onClick={() => setViewAt(0)}>
          <Eye className="mr-1.5 h-4 w-4" /> View
        </Button>
        {openClass}
      </Header>
      <ul
        className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4"
        data-testid="notebook-pages"
      >
        {book.pages.map((pg, i) => (
          <li key={pg.id}>
            <button
              type="button"
              onClick={() => setViewAt(i)}
              className="block w-full overflow-hidden rounded-lg border border-border bg-white text-left shadow-sm transition-shadow hover:shadow-md"
              aria-label={`View page ${i + 1}`}
            >
              {urls?.[i] ? (
                <img
                  src={urls[i]!}
                  alt={`${book.title}, page ${i + 1}`}
                  loading="lazy"
                  className="aspect-[4/3] w-full object-cover object-top"
                />
              ) : (
                <div className="aspect-[4/3] w-full animate-pulse bg-muted" />
              )}
              <span className="block border-t border-border px-2 py-1 text-xs text-muted-foreground">
                Page {i + 1}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <NotebookViewer
        open={viewAt !== null}
        onOpenChange={(o) => !o && setViewAt(null)}
        title={book.title}
        pages={book.pages.map((p, i) => ({ id: p.id, url: urls?.[i] ?? null }))}
        startIndex={viewAt ?? 0}
      />
    </article>
  );
}

function TranscriptView({
  t,
  subject,
  openClass,
}: {
  t: Transcript;
  subject: Subject;
  openClass: ReactNode;
}) {
  const { data: audio } = useQuery({
    queryKey: ["transcript-audio", t.id],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const ids = userData.user ? await listAudioIds(userData.user.id, t.class_id) : null;
      return ids?.get(t.id) ?? null;
    },
  });
  const { data: text, isPending } = useQuery({
    queryKey: ["transcript-text", t.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("audio_transcripts")
        .select("transcript")
        .eq("id", t.id)
        .maybeSingle();
      return data?.transcript ?? "";
    },
  });
  return (
    <article>
      <Header
        title={t.title || "Lecture recording"}
        meta={`${subject.klass.subject} · ${fmtDuration(t.duration_seconds)} · ${fmtDate(t.created_at)}`}
      >
        <Button
          size="sm"
          variant="outline"
          disabled={!text}
          onClick={() => downloadText(t.title || "transcript", text ?? "")}
        >
          <Download className="mr-1.5 h-4 w-4" /> .txt
        </Button>
        {openClass}
      </Header>
      {audio && (
        <div className="mt-4 flex flex-wrap items-center gap-2" data-testid="transcript-audio">
          <div className="min-w-0 flex-1">
            <AudioPlayer path={audio} />
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              const ext = audio.split(".").pop() ?? "webm";
              const name = (t.title || "lecture").replace(/[^\w.-]+/g, "-").replace(/-+/g, "-");
              const url = await audioUrl(audio, `${name}.${ext}`);
              if (url) {
                const a = document.createElement("a");
                a.href = url;
                a.rel = "noopener";
                a.click();
              }
            }}
          >
            <Download className="mr-1.5 h-4 w-4" /> Audio
          </Button>
        </div>
      )}
      <div
        className="surface-paper prose-notes mt-4 rounded-xl px-6 py-5 text-sm"
        data-testid="transcript-text"
      >
        {isPending ? (
          <span className="text-muted-foreground">Loading…</span>
        ) : (
          (text && <TranscriptText text={text} />) || (
            <span className="text-muted-foreground">This transcript is empty.</span>
          )
        )}
      </div>
    </article>
  );
}

/** PDF Studio (pdfstudioapp.vercel.app), embedded. It processes files on its own server. */
const PDF_STUDIO_URL = "https://pdfstudioapp.vercel.app";

function PdfStudio({ onBack }: { onBack: () => void }) {
  const [full, setFull] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!full) return;
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFull(false);
    window.addEventListener("keydown", onKey);
    return () => {
      html.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [full]);
  return (
    <div
      className={cn("flex flex-col", full && "fixed inset-0 z-50 bg-background p-3 sm:p-4")}
      data-testid="pdf-studio"
    >
      {!full && (
        <Breadcrumb items={[{ label: "My notes", onClick: onBack }, { label: "PDF Studio" }]} />
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-2xl">
            <FileStack className="h-5 w-5 text-red-600" /> PDF Studio
          </h2>
          <p className="text-sm text-muted-foreground">
            Merge, split, compress, convert, edit and sign PDFs. PDF Studio is a separate app: files
            you add are processed on its server and deleted automatically.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setFull((f) => !f)}>
            {full ? (
              <Minimize2 className="mr-1.5 h-4 w-4" />
            ) : (
              <Maximize2 className="mr-1.5 h-4 w-4" />
            )}
            {full ? "Exit full screen" : "Full screen"}
          </Button>
          <Button asChild size="sm" variant="outline">
            <a href={PDF_STUDIO_URL} target="_blank" rel="noreferrer noopener">
              <ExternalLink className="mr-1.5 h-4 w-4" /> Open in new tab
            </a>
          </Button>
        </div>
      </div>
      <div
        className={cn(
          "relative mt-4 overflow-hidden rounded-xl border border-border bg-white shadow-sm",
          full ? "min-h-0 flex-1" : "h-[calc(100vh-14rem)] min-h-[34rem]",
        )}
      >
        {!loaded && (
          <p className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">
            Opening PDF Studio…
          </p>
        )}
        <iframe
          src={PDF_STUDIO_URL}
          title="PDF Studio"
          className="relative h-full w-full"
          onLoad={() => setLoaded(true)}
          // Its own origin: scripts and storage work, downloads, file pickers and sign-in
          // pop-ups are allowed, and it can't navigate LectureLoop itself.
          sandbox="allow-scripts allow-same-origin allow-downloads allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-storage-access-by-user-activation"
          allow="clipboard-write; fullscreen"
          referrerPolicy="no-referrer"
        />
      </div>
    </div>
  );
}
