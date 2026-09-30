import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Bookmark, ChevronLeft, ChevronRight, ExternalLink, Trash2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type LectureSlideViewerProps = {
  slideId: string;
  filePath: string;
  contentType: string;
  fileName: string;
};

export function LectureSlideViewer({ slideId, filePath, contentType, fileName }: LectureSlideViewerProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const previewerRef = useRef<{
    currentIndex: number;
    slideCount: number;
    renderNextSlide: () => void;
    renderPreSlide: () => void;
    destroy: () => void;
  } | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [slide, setSlide] = useState(1);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const update = () => setScale(Math.min(1, frame.clientWidth / 960));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setLoading(true);
    setError(null);
    setSlide(1);
    setTotal(0);
    setUrl(null);
    previewerRef.current?.destroy();
    previewerRef.current = null;

    async function load() {
      try {
        const { data, error: downloadError } = await supabase.storage.from("lecture-slides").download(filePath);
        if (downloadError || !data) throw downloadError ?? new Error("Could not open file");
        if (cancelled) return;
        if (contentType === "application/pdf") {
          objectUrl = URL.createObjectURL(data);
          setUrl(objectUrl);
        } else {
          const { init } = await import("pptx-preview");
          if (cancelled || !hostRef.current) return;
          const viewer = init(hostRef.current, { width: 960, height: 540, mode: "slide" });
          previewerRef.current = viewer;
          await viewer.preview(await data.arrayBuffer());
          if (cancelled) return;
          setTotal(viewer.slideCount);
        }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not open the slides");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
      previewerRef.current?.destroy();
      previewerRef.current = null;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [filePath, contentType]);

  const queryClient = useQueryClient();
  const isPdf = contentType === "application/pdf";
  const [pdfPage, setPdfPage] = useState(1);
  const [pdfJump, setPdfJump] = useState<number | null>(null);
  const [jumpTick, setJumpTick] = useState(0);
  const [comment, setComment] = useState("");
  const [adding, setAdding] = useState(false);
  const { data: bookmarks } = useQuery({
    queryKey: ["slide-bookmarks", slideId],
    queryFn: async () => {
      const { data, error } = await supabase.from("slide_bookmarks")
        .select("id, slide_number, comment, created_at")
        .eq("slide_id", slideId).order("slide_number").order("created_at");
      if (error) throw error;
      return data;
    },
  });
  const currentNumber = isPdf ? pdfPage : slide;

  async function addBookmark() {
    const n = Math.floor(currentNumber);
    if (!n || n < 1 || (!isPdf && total && n > total)) { toast.error("Choose a valid slide number."); return; }
    setAdding(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Sign in to add bookmarks.");
      const { error } = await supabase.from("slide_bookmarks").insert({ slide_id: slideId, user_id: u.user.id, slide_number: n, comment: comment.trim().slice(0, 1000) });
      if (error) throw error;
      setComment("");
      await queryClient.invalidateQueries({ queryKey: ["slide-bookmarks", slideId] });
      toast.success(`Bookmarked slide ${n}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add bookmark");
    } finally { setAdding(false); }
  }

  async function removeBookmark(id: string) {
    const { error } = await supabase.from("slide_bookmarks").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    await queryClient.invalidateQueries({ queryKey: ["slide-bookmarks", slideId] });
  }

  function goTo(n: number) {
    if (isPdf) { setPdfPage(n); setPdfJump(n); return; }
    const viewer = previewerRef.current;
    if (!viewer) return;
    const target = Math.min(Math.max(n, 1), viewer.slideCount) - 1;
    let guard = 0;
    while (viewer.currentIndex < target && guard++ < 10000) viewer.renderNextSlide();
    while (viewer.currentIndex > target && guard++ < 10000) viewer.renderPreSlide();
    setSlide(viewer.currentIndex + 1);
  }

  function move(direction: -1 | 1) {
    const viewer = previewerRef.current;
    if (!viewer) return;
    if (direction === -1) viewer.renderPreSlide();
    else viewer.renderNextSlide();
    setSlide(viewer.currentIndex + 1);
  }

  return (
    <div className="mt-4 min-w-0">
      {loading && <p className="py-16 text-center text-sm text-muted-foreground">Opening slides…</p>}
      {error && <p role="alert" className="py-10 text-center text-sm text-destructive">{error}</p>}
      {url && (
        <>
          <iframe title={`Lecture slides: ${fileName}`} key={pdfJump ?? 0} src={pdfJump ? `${url}#page=${pdfJump}` : url} className="h-[520px] w-full border border-border sm:h-[620px]" />
          <Button asChild variant="outline" size="sm" className="mt-3">
            <a href={url} target="_blank" rel="noreferrer"><ExternalLink /> Open full size</a>
          </Button>
        </>
      )}
      <div ref={frameRef} className="overflow-hidden rounded-md border border-border bg-background" hidden={contentType === "application/pdf" || !!error}>
        <div style={{ height: 540 * scale }}>
          <div ref={hostRef} style={{ width: 960, height: 540, transform: `scale(${scale})`, transformOrigin: "top left" }} className="[&_img]:max-w-none" />
        </div>
      </div>
      {contentType !== "application/pdf" && total > 0 && (
        <div className="mt-3 flex items-center justify-between gap-2">
          <Button aria-label="Previous slide" title="Previous slide" size="icon" variant="outline" disabled={slide <= 1} onClick={() => move(-1)}><ChevronLeft /></Button>
          <span className="text-sm tabular-nums text-muted-foreground">{slide} / {total}</span>
          <Button aria-label="Next slide" title="Next slide" size="icon" variant="outline" disabled={slide >= total} onClick={() => move(1)}><ChevronRight /></Button>
        </div>
      )}
      {(isPdf ? !!url : total > 0) && (
        <div className="mt-4 border-t border-border pt-4">
          <div className="flex items-center gap-2 text-sm font-semibold"><Bookmark className="h-4 w-4" /> Bookmarks</div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {isPdf ? (
              <label className="flex items-center gap-1 text-sm text-muted-foreground">Page
                <Input type="number" min={1} value={pdfPage} onChange={(e) => setPdfPage(Number(e.target.value))} className="h-9 w-20" aria-label="Page number to bookmark" />
              </label>
            ) : (
              <span className="text-sm text-muted-foreground">Slide {slide}</span>
            )}
            <Input value={comment} maxLength={1000} onChange={(e) => setComment(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void addBookmark(); }} placeholder="Add a comment (optional)" className="h-9 min-w-0 flex-1" aria-label="Bookmark comment" />
            <Button size="sm" onClick={() => void addBookmark()} disabled={adding}><Bookmark /> {adding ? "Saving…" : "Bookmark"}</Button>
          </div>
          {bookmarks && bookmarks.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {bookmarks.map((b) => (
                <li key={b.id} className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${b.slide_number === currentNumber ? "border-primary bg-primary/5" : "border-border"}`}>
                  <button type="button" onClick={() => goTo(b.slide_number)} className="min-w-0 flex-1 text-left">
                    <span className="font-semibold">{isPdf ? "Page" : "Slide"} {b.slide_number}</span>
                    {b.comment && <span className="mt-0.5 block break-words text-muted-foreground">{b.comment}</span>}
                  </button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-destructive hover:text-destructive" aria-label={`Remove bookmark on ${b.slide_number}`} onClick={() => void removeBookmark(b.id)}><Trash2 /></Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">Bookmark important slides to jump back to them later.</p>
          )}
        </div>
      )}
    </div>
  );
}