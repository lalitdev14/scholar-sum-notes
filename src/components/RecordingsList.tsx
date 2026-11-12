import { useState } from "react";
import { ChevronDown, Download, FilePlus2, Mic, Trash2 } from "lucide-react";
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
};

export type RecordingExportFormat = "docx" | "pdf" | "txt";

type Props = {
  recordings: Recording[] | undefined;
  onExport: (recording: Recording, format: RecordingExportFormat) => void;
  onAddToNotes: (recording: Recording) => void;
  onDelete: (recording: Recording) => Promise<void>;
  emptyText?: string;
};

export function RecordingsList({ recordings, onExport, onAddToNotes, onDelete, emptyText }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Recording | null>(null);
  const [deleting, setDeleting] = useState(false);

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
                    <span className="block truncate text-sm font-medium">{rec.title}</span>
                    <span className="block text-xs text-muted-foreground">
                      {new Date(rec.created_at).toLocaleString()} ·{" "}
                      {formatDuration(rec.duration_seconds)} · {words.toLocaleString()} words
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
              {open && (
                <p className="max-h-64 overflow-y-auto whitespace-pre-wrap border-t border-border/60 px-4 py-3 text-sm leading-relaxed">
                  {rec.transcript}
                </p>
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
              This transcript is permanently deleted. Export it first if you want to keep a copy.
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
