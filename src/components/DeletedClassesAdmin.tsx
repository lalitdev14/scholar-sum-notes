import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, ArchiveRestore, Trash2, Undo2 } from "lucide-react";
import { getDeletedClasses, purgeClasses, restoreClasses } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { friendlyError } from "@/lib/utils";

/** Admin: classes moved to Recently deleted, with Restore and Delete permanently. */
export function DeletedClassesAdmin() {
  const queryClient = useQueryClient();
  const fetchDeleted = useServerFn(getDeletedClasses);
  const restore = useServerFn(restoreClasses);
  const purge = useServerFn(purgeClasses);
  const [purgeTarget, setPurgeTarget] = useState<{
    id: string;
    label: string;
    notes: number;
  } | null>(null);

  const { data: deleted, isPending } = useQuery({
    queryKey: ["admin-deleted-classes"],
    queryFn: () => fetchDeleted(),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin-deleted-classes"] });
    void queryClient.invalidateQueries({ queryKey: ["admin-overview"] });
    void queryClient.invalidateQueries({ queryKey: ["admin-audit-log"] });
    void queryClient.invalidateQueries({ queryKey: ["classes"] });
  };

  const restoreMutation = useMutation({
    mutationFn: (classIds: string[]) => restore({ data: { classIds } }),
    onSuccess: (res) => {
      toast.success(`${res.restored} class${res.restored === 1 ? "" : "es"} restored`);
      refresh();
    },
    onError: (e: Error) => toast.error(friendlyError(e, "Could not restore. Please try again.")),
  });

  const purgeMutation = useMutation({
    mutationFn: (classIds: string[]) => purge({ data: { classIds } }),
    onSuccess: () => {
      setPurgeTarget(null);
      toast.success("Class permanently deleted");
      refresh();
    },
    onError: (e: Error) => toast.error(friendlyError(e, "Could not delete. Please try again.")),
  });

  if (!isPending && !deleted?.length) return null;

  return (
    <section className="mt-10" aria-labelledby="deleted-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="deleted-heading" className="flex items-center gap-2 text-2xl">
            <ArchiveRestore className="h-5 w-5 text-primary" /> Recently deleted
            {deleted?.length ? <Badge variant="secondary">{deleted.length}</Badge> : null}
          </h2>
          <p className="text-sm text-muted-foreground">
            Deleted classes are hidden from students but nothing is erased. Restore brings a class
            back with all its notes, slides and enrollments.
          </p>
        </div>
        {deleted && deleted.length > 1 && (
          <Button
            variant="outline"
            size="sm"
            disabled={restoreMutation.isPending || deleted.some((d) => d.code_taken)}
            onClick={() => restoreMutation.mutate(deleted.map((d) => d.id))}
          >
            <Undo2 className="mr-2 h-4 w-4" /> Restore all
          </Button>
        )}
      </div>

      <ul className="mt-4 grid gap-3" data-testid="deleted-classes">
        {isPending && <li className="text-sm text-muted-foreground">Loading…</li>}
        {deleted?.map((c) => (
          <li
            key={c.id}
            className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-dashed border-border bg-background/60 p-4"
          >
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{c.subject}</span>
                <Badge variant="outline">{c.code}</Badge>
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Deleted {new Date(c.deleted_at).toLocaleString()} by {c.deleted_by_name} ·{" "}
                {c.enrolled} student{c.enrolled === 1 ? "" : "s"} · {c.notes} note
                {c.notes === 1 ? "" : "s"} · {c.slides} slide deck{c.slides === 1 ? "" : "s"}
              </p>
              {c.code_taken && (
                <p className="mt-1 flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="h-3.5 w-3.5" /> Another class now uses the code {c.code}
                  . Rename or delete it to restore this one.
                </p>
              )}
            </div>
            <div className="flex shrink-0 gap-2">
              <Button
                size="sm"
                disabled={restoreMutation.isPending || c.code_taken}
                onClick={() => restoreMutation.mutate([c.id])}
                aria-label={`Restore ${c.subject}`}
              >
                <Undo2 className="mr-2 h-4 w-4" /> Restore
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                disabled={purgeMutation.isPending}
                onClick={() =>
                  setPurgeTarget({ id: c.id, label: `${c.code} ${c.subject}`, notes: c.notes })
                }
                aria-label={`Delete ${c.subject} permanently`}
              >
                <Trash2 className="mr-2 h-4 w-4" /> Delete permanently
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <AlertDialog open={Boolean(purgeTarget)} onOpenChange={(o) => !o && setPurgeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {purgeTarget?.label} permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              This erases the class for everyone, including{" "}
              <strong>{purgeTarget?.notes ?? 0} student note(s)</strong>, enrollments, uploaded
              slides, handwriting and transcripts. It can't be restored afterwards.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={purgeMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={purgeMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (purgeTarget) purgeMutation.mutate([purgeTarget.id]);
              }}
            >
              {purgeMutation.isPending ? "Deleting…" : "Delete permanently"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
