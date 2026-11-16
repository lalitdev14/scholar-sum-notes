import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Pencil, X, ZoomIn, ZoomOut } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export type ViewerPage = { id: string; url: string | null };

/**
 * Read-only view of a saved notebook: every page full size, one after another, with zoom
 * and page jumps. Nothing can be changed here; "Edit" hands over to the notebook.
 */
export function NotebookViewer({
  open,
  onOpenChange,
  title,
  pages,
  startIndex = 0,
  onEdit,
  onDownload,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  pages: ViewerPage[];
  startIndex?: number;
  onEdit?: ((index: number) => void) | undefined;
  onDownload?: (() => void) | undefined;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(startIndex);
  const [zoom, setZoom] = useState(1);

  const jumpedAt = useRef(0);
  const jump = (i: number, smooth = true) => {
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-view-page="${i}"]`);
    if (!el || !scrollRef.current) return;
    setCurrent(i);
    jumpedAt.current = Date.now(); // the last page may not reach the top: trust the jump
    scrollRef.current.scrollTo({ top: el.offsetTop - 12, behavior: smooth ? "smooth" : "auto" });
  };

  // Open at the requested page.
  useEffect(() => {
    if (!open) return;
    setCurrent(startIndex);
    setZoom(1);
    const t = setTimeout(() => jump(startIndex, false), 50);
    return () => clearTimeout(t);
  }, [open, startIndex]);

  // Which page is in view.
  useEffect(() => {
    const root = scrollRef.current;
    if (!open || !root) return;
    const io = new IntersectionObserver(
      (entries) => {
        const best = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (best && Date.now() - jumpedAt.current > 900)
          setCurrent(Number((best.target as HTMLElement).dataset["viewPage"]));
      },
      { root, threshold: [0.25, 0.5, 0.75] },
    );
    root.querySelectorAll("[data-view-page]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [open, pages, zoom]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[94vh] max-w-6xl flex-col gap-0 overflow-hidden p-0 [&>button:last-child]:hidden"
        onKeyDown={(e) => {
          if (e.key === "ArrowRight" || e.key === "PageDown")
            jump(Math.min(pages.length - 1, current + 1));
          if (e.key === "ArrowLeft" || e.key === "PageUp") jump(Math.max(0, current - 1));
        }}
      >
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-base">{title}</DialogTitle>
            <DialogDescription className="text-xs">View only</DialogDescription>
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={() => jump(Math.max(0, current - 1))}
              disabled={current <= 0}
              aria-label="Previous saved page"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-[4.5rem] text-center text-sm tabular-nums text-muted-foreground">
              Page {current + 1} / {pages.length}
            </span>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={() => jump(Math.min(pages.length - 1, current + 1))}
              disabled={current >= pages.length - 1}
              aria-label="Next saved page"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center gap-0.5 rounded-md border border-border p-0.5">
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => setZoom((z) => Math.max(0.5, z / 1.25))}
              disabled={zoom <= 0.5}
              aria-label="Zoom out of notebook"
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <button
              type="button"
              className="min-w-[3rem] rounded px-1 text-xs font-medium tabular-nums hover:bg-muted"
              onClick={() => setZoom(1)}
              aria-label={`Notebook zoom ${Math.round(zoom * 100)}%, reset`}
            >
              {Math.round(zoom * 100)}%
            </button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => setZoom((z) => Math.min(3, z * 1.25))}
              disabled={zoom >= 3}
              aria-label="Zoom in on notebook"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
          </div>
          {onDownload && (
            <Button size="sm" variant="outline" className="h-8" onClick={onDownload}>
              <Download className="mr-1.5 h-4 w-4" /> PDF
            </Button>
          )}
          {onEdit && (
            <Button size="sm" className="h-8" onClick={() => onEdit(current)}>
              <Pencil className="mr-1.5 h-4 w-4" /> Edit
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={() => onOpenChange(false)}
            aria-label="Close viewer"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-auto bg-muted/60 p-3"
          data-testid="notebook-viewer"
        >
          {pages.map((pg, i) => (
            <div
              key={pg.id}
              data-view-page={i}
              className="mx-auto mb-3 overflow-hidden rounded-md bg-white shadow-sm last:mb-0"
              style={{ width: `calc(min(100%, 1000px) * ${zoom})` }}
            >
              {pg.url ? (
                <img
                  src={pg.url}
                  alt={`${title}, page ${i + 1}`}
                  loading={Math.abs(i - startIndex) < 2 ? "eager" : "lazy"}
                  className="block h-auto w-full"
                  draggable={false}
                />
              ) : (
                <p className="p-8 text-center text-sm text-muted-foreground">
                  This page could not be loaded.
                </p>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
