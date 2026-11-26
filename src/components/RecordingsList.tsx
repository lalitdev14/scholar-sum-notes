import { useEffect, useRef, useState } from "react";
import {
  AudioLines,
  ChevronDown,
  Download,
  FilePlus2,
  Loader2,
  Mic,
  Sparkles,
  Trash2,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { AudioPlayer } from "@/components/AudioPlayer";
import { TranscriptText } from "@/components/TranscriptText";
import { audioUrl } from "@/lib/lecture-audio";
import type { RefineProgress } from "@/lib/refine-transcript";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { cn, formatDuration } from "@/lib/utils";

export type Recording = {
  id: string;
  title: string;
  transcript: string;
  duration_seconds: number;
  created_at: string;
  /** Saved audio recording, if any. */
  audioPath?: string | null;
  /** The original live transcript, kept after "Improve with audio". */
  liveTranscript?: string | null;
  /** When the transcript was improved from the audio. */
  refinedAt?: string | null;
};

export type RecordingExportFormat = "docx" | "pdf" | "txt";

type Props = {
  recordings: Recording[] | undefined;
  onExport: (recording: Recording, format: RecordingExportFormat) => void;
  onAddToNotes: (recording: Recording) => void;
  onDelete: (recording: Recording) => Promise<void>;
  emptyText?: string;
  /** File name (without extension) for a downloaded recording. */
  audioName?: (recording: Recording) => string;
  /** Listen to the saved audio again and correct the transcript. */
  onImprove?: (recording: Recording) => void;
  /** Go back to the original live transcript. */
  onRestoreLive?: (recording: Recording) => void;
  /** Transcripts being improved right now (by id). */
  refining?: Record<string, RefineProgress>;
};

function progressText(p: RefineProgress) {
  if (p.phase === "loading") return "Opening the recording…";
  if (p.phase === "listening")
    return `Listening to the recording… ${p.total ? Math.round((p.done / p.total) * 100) : 0}%`;
  return `Correcting and organising by topic… ${p.done + 1 > p.total ? p.total : p.done + 1} of ${p.total}`;
}

export function RecordingsList({
  recordings,
  onExport,
  onAddToNotes,
  onDelete,
  emptyText,
  audioName,
  onImprove,
  onRestoreLive,
  refining,
}: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [showLive, setShowLive] = useState<Record<string, boolean>>({});
  const [confirm, setConfirm] = useState<Recording | null>(null);
  const [deleting, setDeleting] = useState(false);
  /** Share of each recording played (the transcript follows along). */
  const [played, setPlayed] = useState<Record<string, number>>({});
  /** Recordings whose "Improve with audio" just finished here (their transcript fades in). */
  const [justImproved, setJustImproved] = useState<Record<string, boolean>>({});
  const seenRefined = useRef<Map<string, string | null>>(new Map());
  useEffect(() => {
    const seen = seenRefined.current;
    const fresh: string[] = [];
    for (const rec of recordings ?? []) {
      const now = rec.refinedAt ?? null;
      if (seen.has(rec.id) && now && seen.get(rec.id) !== now) fresh.push(rec.id);
      seen.set(rec.id, now);
    }
    if (fresh.length)
      setJustImproved((m) => ({ ...m, ...Object.fromEntries(fresh.map((id) => [id, true])) }));
  }, [recordings]);

  if (!recordings?.length) {
    return (
      <p className="mt-2 text-sm text-muted-foreground">
        {emptyText ?? "Lecture transcripts you record are saved here."}
      </p>
    );
  }

  return (
    <>
      <ul className="mt-3 flex flex-col gap-2" data-testid="recordings-list">
        {recordings.map((rec) => {
          const open = openId === rec.id;
          const progress = refining?.[rec.id];
          const live = showLive[rec.id] && rec.liveTranscript ? rec.liveTranscript : null;
          const words = rec.transcript.trim() ? rec.transcript.trim().split(/\s+/).length : 0;
          return (
            <li key={rec.id} className="rounded-lg border border-border/60 bg-background/60">
              <div className="flex flex-wrap items-center gap-2 p-3">
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : rec.id)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  aria-expanded={open}
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                    <Mic className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{rec.title}</span>
                      {justImproved[rec.id] && (
                        <span
                          className="motion-pop inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[0.7rem] font-semibold text-primary"
                          data-testid="improved-badge"
                        >
                          <Sparkles className="h-3 w-3" aria-hidden="true" /> Improved
                        </span>
                      )}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {new Date(rec.created_at).toLocaleString()} ·{" "}
                      {formatDuration(rec.duration_seconds)} · {words.toLocaleString()} words
                      {rec.audioPath ? " · audio" : ""}
                      {rec.refinedAt ? " · improved" : ""}
                    </span>
                  </span>
                  <ChevronDown
                    className={cn(
                      "ml-auto h-4 w-4 shrink-0 transition-transform",
                      open && "rotate-180",
                    )}
                  />
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" aria-label={`Export ${rec.title}`}>
                      <Download className="mr-1.5 h-4 w-4" /> Export
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => onExport(rec, "docx")}>
                      Word (.docx)
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => onExport(rec, "pdf")}>PDF</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => onExport(rec, "txt")}>
                      Plain text (.txt)
                    </DropdownMenuItem>
                    {rec.audioPath && (
                      <DropdownMenuItem
                        onSelect={() =>
                          void downloadAudio(rec.audioPath!, audioName?.(rec) ?? rec.title)
                        }
                      >
                        <AudioLines className="mr-2 h-4 w-4" /> Audio recording
                      </DropdownMenuItem>
                    )}
                    {rec.audioPath && onImprove && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem disabled={!!progress} onSelect={() => onImprove(rec)}>
                          <Sparkles className="mr-2 h-4 w-4" />
                          {rec.refinedAt ? "Improve again with audio" : "Improve with audio"}
                        </DropdownMenuItem>
                      </>
                    )}
                    {rec.liveTranscript && onRestoreLive && (
                      <DropdownMenuItem disabled={!!progress} onSelect={() => onRestoreLive(rec)}>
                        <Undo2 className="mr-2 h-4 w-4" /> Use my live transcript
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => onAddToNotes(rec)}>
                      <FilePlus2 className="mr-2 h-4 w-4" /> Add to my notes
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => setConfirm(rec)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="mr-2 h-4 w-4" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              {progress && (
                <p
                  className="flex items-center gap-2 border-t border-border/60 px-4 py-2 text-xs text-muted-foreground"
                  role="status"
                  data-testid="refine-status"
                >
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {progressText(progress)} Keep this page open.
                </p>
              )}
              {open && rec.audioPath && (
                <div className="border-t border-border/60 px-4 pt-3">
                  <AudioPlayer
                    path={rec.audioPath}
                    durationSeconds={rec.duration_seconds}
                    onProgress={(r) =>
                      setPlayed((m) => (m[rec.id] === r ? m : { ...m, [rec.id]: r }))
                    }
                  />
                </div>
              )}
              {open && rec.liveTranscript && (
                <div
                  className="flex flex-wrap items-center gap-1 border-t border-border/60 px-4 pt-3 text-xs"
                  role="group"
                  aria-label="Transcript version"
                >
                  {[
                    { live: false, label: "Improved from audio" },
                    { live: true, label: "Live transcript" },
                  ].map((v) => (
                    <button
                      key={v.label}
                      type="button"
                      aria-pressed={!!showLive[rec.id] === v.live}
                      onClick={() => setShowLive((m) => ({ ...m, [rec.id]: v.live }))}
                      className={cn(
                        "rounded-full border px-2.5 py-1",
                        !!showLive[rec.id] === v.live
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border/60 text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
              )}
              {open && (
                <TranscriptText
                  key={`${rec.refinedAt ?? ""}-${live ? "live" : "best"}`}
                  text={live ?? rec.transcript}
                  progress={played[rec.id] ?? null}
                  className={cn(
                    "max-h-80 overflow-y-auto border-t border-border/60 px-4 py-3 text-sm leading-relaxed [div+&]:border-t-0",
                    justImproved[rec.id] && !live && "motion-fade-in",
                  )}
                />
              )}
            </li>
          );
        })}
      </ul>

      <AlertDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && !deleting && setConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{confirm?.title}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This transcript{confirm?.audioPath ? " and its audio recording are" : " is"}{" "}
              permanently deleted. Export it first if you want to keep a copy.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async (e) => {
                e.preventDefault();
                if (!confirm) return;
                setDeleting(true);
                try {
                  await onDelete(confirm);
                  setConfirm(null);
                } finally {
                  setDeleting(false);
                }
              }}
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** Downloads a saved recording under a readable name (the link sets the file name). */
async function downloadAudio(path: string, name: string) {
  const ext = path.split(".").pop() ?? "webm";
  const safe =
    name
      .replace(/[^\w.-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "lecture";
  const url = await audioUrl(path, `${safe}.${ext}`);
  if (!url) {
    toast.error("Could not download the recording.");
    return;
  }
  const a = document.createElement("a");
  a.href = url;
  a.rel = "noopener";
  a.click();
}
