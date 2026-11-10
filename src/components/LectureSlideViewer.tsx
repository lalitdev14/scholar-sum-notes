import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Bookmark, ChevronLeft, ChevronRight, ExternalLink, Sparkles, Trash2, X } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { slideOverview } from "@/lib/notes.functions";
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
  const topRef = useRef<HTMLDivElement>(null);
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
  const pdfDocRef = useRef<{ getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: unknown[] }> }>; numPages: number } | null>(null);

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
    let loadingTask: { destroy: () => Promise<void> } | null = null;
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
          void (async () => {
            try {
              const pdfjs = await import("pdfjs-dist");
              const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
              pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
              const task = pdfjs.getDocument({ data: new Uint8Array(await data.arrayBuffer()) });
              loadingTask = task;
              if (cancelled) { void task.destroy(); return; }
              const doc = await task.promise;
              if (cancelled) return;
              pdfDocRef.current = doc as unknown as typeof pdfDocRef.current;
              setPdfReady((t) => t + 1);
            } catch { /* overview just stays unavailable */ }
          })();
        } else {
          const { init } = await import("pptx-preview");
          if (cancelled || !hostRef.current) return;
          const viewer = init(hostRef.current, { width: 960, height: 540, mode: "slide" });
          previewerRef.current = viewer;
          await viewer.preview(await data.arrayBuffer());
          if (cancelled) return;
          setTotal(viewer.slideCount);
          const saved = Number(localStorage.getItem(`slide-pos:${slideId}`)) || 1;
          const target = Math.min(Math.max(saved, 1), viewer.slideCount) - 1;
          let guard = 0;
          while (viewer.currentIndex < target && guard++ < 10000) viewer.renderNextSlide();
          setSlide(viewer.currentIndex + 1);
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
      pdfDocRef.current = null;
      loadingTask?.destroy().catch(() => {});
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
  const [pdfReady, setPdfReady] = useState(0);
  const [overviewOpen, setOverviewOpen] = useState(true);
  const [slideInfo, setSlideInfo] = useState<{ headline: string; text: string } | null>(null);
  const pdfScrollRef = useRef<HTMLDivElement>(null);
  const getOverview = useServerFn(slideOverview);

  useEffect(() => {
    if (loading || error) return;
    let cancelled = false;
    setSlideInfo(null);
    const timer = window.setTimeout(async () => {
      try {
        if (isPdf) {
          const doc = pdfDocRef.current;
          const n = Math.floor(pdfPage);
          if (!doc || n < 1 || n > doc.numPages) return;
          const content = await (await doc.getPage(n)).getTextContent();
          const items = (content.items as { str?: string; transform?: number[] }[])
            .filter((i) => i.str && i.str.trim())
            .map((i) => ({ str: i.str!.trim(), size: Math.abs(i.transform?.[3] ?? 0) }));
          if (!items.length) { if (!cancelled) setSlideInfo({ headline: "", text: "" }); return; }
          const max = Math.max(...items.map((i) => i.size));
          const headline = items.filter((i) => i.size >= max * 0.85).map((i) => i.str).join(" ");
          if (!cancelled) setSlideInfo({ headline: headline.slice(0, 300), text: items.map((i) => i.str).join(" ").slice(0, 3000) });
        } else {
          const host = hostRef.current;
          if (!host) return;
          let best = { text: "", size: 0 };
          const all: string[] = [];
          host.querySelectorAll<HTMLElement>("*").forEach((el) => {
            if (el.offsetParent === null) return;
            const own = Array.from(el.childNodes).filter((c) => c.nodeType === 3).map((c) => c.textContent ?? "").join(" ").trim();
            if (!own) return;
            all.push(own);
            const size = parseFloat(getComputedStyle(el).fontSize) || 0;
            if (size > best.size) best = { text: own, size };
          });
          if (!cancelled) setSlideInfo({ headline: best.text.slice(0, 300), text: all.join(" ").slice(0, 3000) });
        }
      } catch {
        if (!cancelled) setSlideInfo({ headline: "", text: "" });
      }
    }, 600);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [isPdf, pdfPage, slide, loading, error, pdfReady]);

  const overview = useQuery({
    queryKey: ["slide-overview", slideInfo?.headline],
    enabled: overviewOpen && !!slideInfo?.headline,
    staleTime: Infinity,
    retry: false,
    queryFn: async () => (await getOverview({ data: { headline: slideInfo!.headline, slideText: slideInfo!.text } })).text,
  });

  useEffect(() => {
    if (!isPdf) return;
    const saved = Number(localStorage.getItem(`slide-pos:${slideId}`)) || 0;
    if (saved > 1) { setPdfPage(saved); setPdfJump(saved); }
  }, [isPdf, slideId]);

  useEffect(() => {
    if (loading || currentNumber < 1) return;
    localStorage.setItem(`slide-pos:${slideId}`, String(Math.floor(currentNumber)));
  }, [currentNumber, slideId, loading]);

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

  // Track which PDF page is mostly visible while scrolling.
  useEffect(() => {
    const root = pdfScrollRef.current;
    if (!isPdf || !root || !pdfReady) return;
    const ratios = new Map<number, number>();
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((e) => ratios.set(Number((e.target as HTMLElement).dataset["page"]), e.intersectionRatio));
      let best = 0, bestRatio = 0;
      ratios.forEach((r, p) => { if (r > bestRatio) { bestRatio = r; best = p; } });
      if (best) setPdfPage(best);
    }, { root, threshold: [0, 0.25, 0.5, 0.75, 1] });
    root.querySelectorAll("[data-page]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [isPdf, pdfReady]);

  // Scroll to a requested PDF page (bookmark or restored position).
  useEffect(() => {
    if (!pdfJump || !pdfReady) return;
    const el = pdfScrollRef.current?.querySelector<HTMLElement>(`[data-page="${pdfJump}"]`);
    if (el && pdfScrollRef.current) pdfScrollRef.current.scrollTop = el.offsetTop;
  }, [pdfJump, jumpTick, pdfReady]);

  function goTo(n: number) {
    if (isPdf) { setPdfPage(n); setPdfJump(n); setJumpTick((t) => t + 1); topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
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
    <div ref={topRef} className="mt-4 min-w-0 scroll-mt-24">
      {loading && <p className="py-16 text-center text-sm text-muted-foreground">Opening slides…</p>}
      {error && <p role="alert" className="py-10 text-center text-sm text-destructive">{error}</p>}
      <div className="relative">
      {url && (
        <div aria-label={`Lecture slides: ${fileName}`} ref={pdfScrollRef} className="h-[520px] w-full overflow-y-auto rounded-md border border-border bg-muted sm:h-[620px]">
          {pdfReady > 0 && pdfDocRef.current && Array.from({ length: pdfDocRef.current.numPages }, (_, i) => (
            <PdfPage key={`${pdfReady}-${i}`} doc={pdfDocRef.current!} n={i + 1} />
          ))}
        </div>
      )}
      <div ref={frameRef} className="overflow-hidden rounded-md border border-border bg-background" hidden={contentType === "application/pdf" || !!error}>
        <div style={{ height: 540 * scale }}>
          <div ref={hostRef} style={{ width: 960, height: 540, transform: `scale(${scale})`, transformOrigin: "top left" }} className="[&_img]:max-w-none" />
        </div>
      </div>
      {(isPdf ? !!url : total > 0) && (
        overviewOpen ? (
          <div role="dialog" aria-label="AI slide overview" className="absolute right-3 top-3 z-10 max-h-[70%] w-[min(20rem,calc(100%-1.5rem))] overflow-y-auto rounded-lg border border-border bg-background/95 p-3 pr-9 text-xs shadow-lg backdrop-blur-md">
            <Button variant="ghost" size="icon" className="absolute right-1 top-1 h-8 w-8" aria-label="Close AI overview" onClick={() => setOverviewOpen(false)}><X /></Button>
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary"><Sparkles className="h-3.5 w-3.5" /> AI overview · {isPdf ? "Page" : "Slide"} {Math.floor(currentNumber)}</div>
            {slideInfo === null ? (
              <p className="mt-2 text-muted-foreground">Reading the slide…</p>
            ) : !slideInfo.headline ? (
              <p className="mt-2 text-muted-foreground">No headline found on this {isPdf ? "page" : "slide"}.</p>
            ) : (
              <>
                <p className="mt-1 font-semibold">{slideInfo.headline}</p>
                {overview.isFetching ? <p className="mt-2 text-muted-foreground">Writing an overview…</p>
                  : overview.error ? <p className="mt-2 text-destructive">Couldn't create an overview right now.</p>
                  : <p className="prose-notes mt-2 text-foreground">{overview.data}</p>}
                <p className="mt-2 text-xs text-muted-foreground">AI-generated from the headline. It may go beyond your lecture, so check it against your notes.</p>
              </>
            )}
          </div>
        ) : (
          <Button variant="secondary" size="sm" className="absolute right-3 top-3 z-10 shadow-md" onClick={() => setOverviewOpen(true)}><Sparkles /> AI overview</Button>
        )
      )}
      </div>
      {url && (
        <Button asChild variant="outline" size="sm" className="mt-3">
          <a href={url} target="_blank" rel="noreferrer"><ExternalLink /> Open full size</a>
        </Button>
      )}
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
type PdfDocLike = { getPage: (n: number) => Promise<unknown> };

function PdfPage({ doc, n }: { doc: PdfDocLike; n: number }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(n <= 2);
  const [aspect, setAspect] = useState(9 / 16);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || visible) return;
    const io = new IntersectionObserver((e) => { if (e.some((x) => x.isIntersecting)) setVisible(true); }, { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    let task: { cancel: () => void; promise: Promise<void> } | null = null;
    void (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const page = (await doc.getPage(n)) as any;
        const canvas = canvasRef.current;
        const wrap = wrapRef.current;
        if (cancelled || !canvas || !wrap) return;
        const base = page.getViewport({ scale: 1 });
        setAspect(base.height / base.width);
        const scale = ((wrap.clientWidth || 800) / base.width) * (window.devicePixelRatio || 1);
        const viewport = page.getViewport({ scale });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        task = page.render({ canvas, canvasContext: canvas.getContext("2d"), viewport });
        await task!.promise;
      } catch { /* render cancelled */ }
    })();
    return () => { cancelled = true; task?.cancel(); };
  }, [visible, doc, n]);

  return (
    <div ref={wrapRef} data-page={n} className="mb-2 bg-background shadow-sm" style={{ aspectRatio: `${1 / aspect}` }}>
      <canvas ref={canvasRef} className="block h-full w-full" aria-label={`Page ${n}`} />
    </div>
  );
}
