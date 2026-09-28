import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type LectureSlideViewerProps = {
  filePath: string;
  contentType: string;
  fileName: string;
};

export function LectureSlideViewer({ filePath, contentType, fileName }: LectureSlideViewerProps) {
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
          <iframe title={`Lecture slides: ${fileName}`} src={url} className="h-[520px] w-full border border-border sm:h-[620px]" />
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
    </div>
  );
}