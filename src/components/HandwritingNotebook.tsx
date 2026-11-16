import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  ChevronLeft,
  ChevronRight,
  Eraser,
  FilePlus2,
  Hand,
  Highlighter,
  Maximize2,
  Pen,
  Presentation,
  Redo2,
  Save,
  Sparkles,
  Trash2,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { captureCurrentSlide } from "@/lib/slide-capture";

/* ------------------------------------------------------------------ model */

/** Logical page size; strokes are stored in these units so they scale with the screen. */
export const PAGE_W = 1000;
export const PAGE_H = 700;

export type Paper = "blank" | "lined" | "grid" | "dotted";
type Tool = "pen" | "highlighter" | "eraser" | "hand";

/** One ink stroke. `pts` is a flat list of x, y, pressure (page units, pressure 0..1). */
export type Stroke = { tool: "pen" | "highlighter"; color: string; size: number; pts: number[] };

type Page = {
  key: string;
  savedId?: string | undefined;
  imagePath?: string | undefined;
  backgroundPath?: string | null;
  background?: string | null; // data URL of a slide image
  paper: Paper;
  strokes: Stroke[];
  undo: Stroke[][];
  redo: Stroke[][];
  dirty: boolean;
};

/** What the class page receives to save or convert a page. */
export type RenderedPage = {
  savedId?: string | undefined;
  imagePath?: string | undefined;
  backgroundPath?: string | null;
  backgroundDataUrl?: string | null;
  imageDataUrl: string;
  strokes: Stroke[];
  paper: Paper;
};

export type SavedPageResult = { id: string; imagePath: string; backgroundPath: string | null };

export type NotebookHandle = {
  /** Opens a saved page for editing (adds it as a page, or jumps to it if already open). */
  openSaved: (page: {
    id: string;
    imagePath: string;
    strokes: Stroke[];
    paper: Paper;
    backgroundPath: string | null;
    background: string | null;
  }) => void;
};

const INK = ["#141414", "#1d4ed8", "#dc2626", "#15803d", "#57068c", "#ea580c"];
const HIGHLIGHT = ["#facc15", "#4ade80", "#f472b6", "#60a5fa"];
const PEN_SIZES = [2.2, 3.4, 5.6];
const HIGHLIGHT_SIZES = [12, 18, 26];
const PAPERS: [Paper, string][] = [
  ["blank", "Blank"],
  ["lined", "Lined"],
  ["grid", "Grid"],
  ["dotted", "Dotted"],
];

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;

/** Visible part of the page: zoom factor and the top-left corner in page units. */
type View = { z: number; x: number; y: number };

/** Keeps the view inside the page when zoomed in, and centres the page when zoomed out. */
function clampView(v: View): View {
  const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.z));
  const vw = PAGE_W / z;
  const vh = PAGE_H / z;
  const x = vw >= PAGE_W ? (PAGE_W - vw) / 2 : Math.min(Math.max(v.x, 0), PAGE_W - vw);
  const y = vh >= PAGE_H ? (PAGE_H - vh) / 2 : Math.min(Math.max(v.y, 0), PAGE_H - vh);
  return { z, x, y };
}

const newKey = () => Math.random().toString(36).slice(2, 10);
const blankPage = (paper: Paper = "lined"): Page => ({
  key: newKey(),
  paper,
  strokes: [],
  undo: [],
  redo: [],
  dirty: false,
});

/* ------------------------------------------------------------------ drawing */

function drawPaper(ctx: CanvasRenderingContext2D, paper: Paper) {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);
  ctx.save();
  if (paper === "lined") {
    ctx.strokeStyle = "#cfdcef";
    ctx.lineWidth = 1;
    for (let y = 64; y < PAGE_H; y += 34) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(PAGE_W, y);
      ctx.stroke();
    }
    ctx.strokeStyle = "#f3b3b3";
    ctx.beginPath();
    ctx.moveTo(72, 0);
    ctx.lineTo(72, PAGE_H);
    ctx.stroke();
  } else if (paper === "grid") {
    ctx.strokeStyle = "#e3e8ef";
    ctx.lineWidth = 1;
    for (let x = 25; x < PAGE_W; x += 25) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, PAGE_H);
      ctx.stroke();
    }
    for (let y = 25; y < PAGE_H; y += 25) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(PAGE_W, y);
      ctx.stroke();
    }
  } else if (paper === "dotted") {
    ctx.fillStyle = "#c3cad6";
    for (let x = 25; x < PAGE_W; x += 25)
      for (let y = 25; y < PAGE_H; y += 25) {
        ctx.beginPath();
        ctx.arc(x, y, 1.3, 0, Math.PI * 2);
        ctx.fill();
      }
  }
  ctx.restore();
}

function drawBackground(ctx: CanvasRenderingContext2D, img: HTMLImageElement) {
  // Fit the slide inside the page (letterboxed), on white.
  const scale = Math.min(PAGE_W / img.width, PAGE_H / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);
  ctx.drawImage(img, (PAGE_W - w) / 2, (PAGE_H - h) / 2, w, h);
}

function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke) {
  const p = s.pts;
  const n = p.length / 3;
  if (n < 1) return;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = s.color;
  if (s.tool === "highlighter") {
    // One path at constant width so overlapping segments don't darken.
    ctx.globalAlpha = 0.38;
    ctx.globalCompositeOperation = "multiply";
    ctx.lineWidth = s.size;
    ctx.beginPath();
    ctx.moveTo(p[0]!, p[1]!);
    for (let i = 1; i < n; i++) ctx.lineTo(p[i * 3]!, p[i * 3 + 1]!);
    if (n === 1) ctx.lineTo(p[0]! + 0.1, p[1]!);
    ctx.stroke();
  } else {
    // Smooth quadratic curves through midpoints; width follows pressure.
    if (n === 1) {
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(p[0]!, p[1]!, (s.size * (0.5 + p[2]!)) / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 1; i < n; i++) {
      const x0 = p[(i - 1) * 3]!;
      const y0 = p[(i - 1) * 3 + 1]!;
      const x1 = p[i * 3]!;
      const y1 = p[i * 3 + 1]!;
      const pr = p[i * 3 + 2]!;
      const mx0 = i > 1 ? (p[(i - 2) * 3]! + x0) / 2 : x0;
      const my0 = i > 1 ? (p[(i - 2) * 3 + 1]! + y0) / 2 : y0;
      const mx1 = (x0 + x1) / 2;
      const my1 = (y0 + y1) / 2;
      ctx.lineWidth = Math.max(0.8, s.size * (0.45 + pr));
      ctx.beginPath();
      ctx.moveTo(mx0, my0);
      ctx.quadraticCurveTo(x0, y0, mx1, my1);
      if (i === n - 1) ctx.lineTo(x1, y1);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Renders a page (paper or slide, then ink) to a PNG data URL at `scale`× page units. */
async function renderPage(page: Page, scale = 1.5): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = PAGE_W * scale;
  canvas.height = PAGE_H * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);
  if (page.background) drawBackground(ctx, await loadImage(page.background));
  else drawPaper(ctx, page.paper);
  for (const s of page.strokes) drawStroke(ctx, s);
  return canvas.toDataURL("image/png");
}

/* ------------------------------------------------------------------ component */

type Props = {
  classId: string;
  converting?: boolean;
  /** Turns the page into typed text (AI) and saves it. Returns the save result or null. */
  onConvert: (page: RenderedPage) => Promise<SavedPageResult | null>;
  /** Saves the page to the class. Returns the save result or null on failure. */
  onSave: (page: RenderedPage) => Promise<SavedPageResult | null>;
};

export const HandwritingNotebook = forwardRef<NotebookHandle, Props>(function HandwritingNotebook(
  { classId, converting = false, onConvert, onSave },
  ref,
) {
  const draftKey = `lectureloop:notebook:${classId}`;
  const [pages, setPages] = useState<Page[]>(() => [blankPage()]);
  const [index, setIndex] = useState(0);
  const [tool, setTool] = useState<Tool>("pen");
  const [inkColor, setInkColor] = useState(INK[0]!);
  const [hlColor, setHlColor] = useState(HIGHLIGHT[0]!);
  const [sizeIdx, setSizeIdx] = useState(1);
  const [saving, setSaving] = useState(false);
  const [, force] = useState(0);

  const page = pages[Math.min(index, pages.length - 1)]!;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const cacheRef = useRef<HTMLCanvasElement | null>(null); // paper/slide + committed ink
  const bgImgRef = useRef<{ src: string; img: HTMLImageElement } | null>(null);
  const drawingRef = useRef<Stroke | null>(null);
  const erasingRef = useRef(false);
  const penSeenRef = useRef(false);
  const scaleRef = useRef(1);
  const viewRef = useRef<View>({ z: 1, x: 0, y: 0 });
  const [zoomPct, setZoomPct] = useState(100);
  const touchesRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ dist: number; midX: number; midY: number } | null>(null);
  const panRef = useRef<{ id: number; x: number; y: number } | null>(null);
  const frameRef = useRef(0);

  const updatePage = useCallback(
    (fn: (p: Page) => Page) =>
      setPages((all) => all.map((p, i) => (i === Math.min(index, all.length - 1) ? fn(p) : p))),
    [index],
  );

  /* ---------------- restore / persist an unsaved draft */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) return;
      const saved = JSON.parse(raw) as { pages: Omit<Page, "undo" | "redo">[]; index: number };
      if (saved.pages?.length && saved.pages.some((p) => p.strokes.length || p.background)) {
        setPages(saved.pages.map((p) => ({ ...p, undo: [], redo: [] })));
        setIndex(Math.min(saved.index ?? 0, saved.pages.length - 1));
      }
    } catch {
      /* ignore */
    }
  }, [draftKey]);

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const light = pages.map(({ undo: _u, redo: _r, ...p }) => p);
        localStorage.setItem(draftKey, JSON.stringify({ pages: light, index }));
      } catch {
        // Too big for local storage (large slide images): keep the ink, drop the images.
        try {
          const light = pages.map(({ undo: _u, redo: _r, background: _b, ...p }) => p);
          localStorage.setItem(draftKey, JSON.stringify({ pages: light, index }));
        } catch {
          /* storage unavailable */
        }
      }
    }, 400);
    return () => clearTimeout(t);
  }, [pages, index, draftKey]);

  /* ---------------- rendering */
  const rebuildCache = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cache = cacheRef.current ?? document.createElement("canvas");
    cacheRef.current = cache;
    cache.width = canvas.width;
    cache.height = canvas.height;
    if (page.background && bgImgRef.current?.src !== page.background) {
      bgImgRef.current = { src: page.background, img: await loadImage(page.background) };
    }
    const ctx = cache.getContext("2d")!;
    const v = viewRef.current;
    const k = (cache.width / PAGE_W) * v.z;
    // Desk colour around the page (visible when zoomed out).
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#eceef2";
    ctx.fillRect(0, 0, cache.width, cache.height);
    ctx.setTransform(k, 0, 0, k, -v.x * k, -v.y * k);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, PAGE_W, PAGE_H);
    ctx.clip();
    if (page.background && bgImgRef.current) drawBackground(ctx, bgImgRef.current.img);
    else drawPaper(ctx, page.paper);
    for (const st of page.strokes) drawStroke(ctx, st);
    ctx.restore();
  }, [page.background, page.paper, page.strokes]);

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    const cache = cacheRef.current;
    if (!canvas || !cache) return;
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(cache, 0, 0);
    if (drawingRef.current?.color) {
      const v = viewRef.current;
      const k = (canvas.width / PAGE_W) * v.z;
      ctx.setTransform(k, 0, 0, k, -v.x * k, -v.y * k);
      drawStroke(ctx, drawingRef.current);
    }
  }, []);

  // Redraw whenever the page's paper, slide or ink changes.
  const redrawRef = useRef<() => void>(() => {});
  redrawRef.current = () => void rebuildCache().then(paint);
  useEffect(() => {
    redrawRef.current();
  }, [rebuildCache, paint]);

  /* ---------------- zoom */
  const setView = (next: View) => {
    viewRef.current = clampView(next);
    setZoomPct(Math.round(viewRef.current.z * 100));
    cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => redrawRef.current());
  };
  /** Zooms by `factor`, keeping the page point (cx, cy) under the same spot on screen. */
  const zoomAt = (factor: number, cx: number, cy: number) => {
    const v = viewRef.current;
    const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.z * factor));
    setView({ z, x: cx - (cx - v.x) * (v.z / z), y: cy - (cy - v.y) * (v.z / z) });
  };
  const zoomBy = (factor: number) => {
    const v = viewRef.current;
    zoomAt(factor, v.x + PAGE_W / (2 * v.z), v.y + PAGE_H / (2 * v.z));
  };
  const fitPage = () => setView({ z: 1, x: 0, y: 0 });
  /** Page units per screen pixel at the current zoom. */
  const unitsPerPx = () => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return PAGE_W / rect.width / viewRef.current.z;
  };
  const panBy = (dxPx: number, dyPx: number) => {
    const v = viewRef.current;
    const u = unitsPerPx();
    setView({ ...v, x: v.x - dxPx * u, y: v.y - dyPx * u });
  };

  // Trackpad pinch / Ctrl+scroll zooms at the cursor; scrolling pans while zoomed in.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const [cx, cy] = toPage(e);
        zoomAt(Math.exp(-e.deltaY * 0.01), cx, cy);
      } else if (viewRef.current.z > 1.001) {
        e.preventDefault();
        panBy(-e.deltaX, -e.deltaY);
      }
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Size the canvas to its box (crisp on retina) when the panel is resized.
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = wrap.clientWidth;
      if (!w) return; // hidden tab
      const width = Math.round(w * dpr);
      if (canvas.width === width) return;
      scaleRef.current = w / PAGE_W;
      canvas.width = width;
      canvas.height = Math.round(w * (PAGE_H / PAGE_W) * dpr);
      redrawRef.current();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  /* ---------------- input */
  /** Screen point → page units, through the current zoom. */
  const toPage = (e: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const v = viewRef.current;
    return [
      ((e.clientX - rect.left) / rect.width) * (PAGE_W / v.z) + v.x,
      ((e.clientY - rect.top) / rect.height) * (PAGE_H / v.z) + v.y,
    ] as const;
  };

  const eraseAt = (x: number, y: number) => {
    const r = 14 / Math.max(viewRef.current.z, 1);
    const hit = (s: Stroke) => {
      for (let i = 0; i < s.pts.length; i += 3) {
        const dx = s.pts[i]! - x;
        const dy = s.pts[i + 1]! - y;
        if (dx * dx + dy * dy < (r + s.size / 2) ** 2) return true;
      }
      return false;
    };
    if (!page.strokes.some(hit)) return;
    updatePage((p) => ({
      ...p,
      undo: erasingRef.current ? p.undo : [...p.undo.slice(-99), p.strokes],
      redo: [],
      strokes: p.strokes.filter((s) => !hit(s)),
      dirty: true,
    }));
    erasingRef.current = true;
  };

  function onDown(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (e.pointerType === "touch") {
      touchesRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touchesRef.current.size === 2) {
        // Two fingers: pinch to zoom / drag to pan. Drop any stroke the first finger began.
        drawingRef.current = null;
        panRef.current = null;
        const [a, b] = [...touchesRef.current.values()] as [
          { x: number; y: number },
          { x: number; y: number },
        ];
        pinchRef.current = {
          dist: Math.hypot(a.x - b.x, a.y - b.y),
          midX: (a.x + b.x) / 2,
          midY: (a.y + b.y) / 2,
        };
        paint();
        return;
      }
      if (touchesRef.current.size > 2) return;
    }
    if (e.pointerType === "pen") penSeenRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    // Palm rejection: once a stylus is used, a finger pans instead of drawing.
    // The hand tool always pans.
    if ((e.pointerType === "touch" && penSeenRef.current) || tool === "hand") {
      panRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
      return;
    }
    const [x, y] = toPage(e);
    const eraser = tool === "eraser" || e.buttons === 32;
    if (eraser) {
      erasingRef.current = false;
      eraseAt(x, y);
      drawingRef.current = { tool: "pen", color: "", size: 0, pts: [] }; // marks "erasing"
      return;
    }
    const pressure = e.pointerType === "pen" && e.pressure > 0 ? e.pressure : 0.5;
    drawingRef.current =
      tool === "highlighter"
        ? { tool: "highlighter", color: hlColor, size: HIGHLIGHT_SIZES[sizeIdx]!, pts: [x, y, 0.5] }
        : { tool: "pen", color: inkColor, size: PEN_SIZES[sizeIdx]!, pts: [x, y, pressure] };
    paint();
  }

  function onMove(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (e.pointerType === "touch" && touchesRef.current.has(e.pointerId)) {
      touchesRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const prev = pinchRef.current;
      if (prev && touchesRef.current.size >= 2) {
        const [a, b] = [...touchesRef.current.values()] as [
          { x: number; y: number },
          { x: number; y: number },
        ];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const midX = (a.x + b.x) / 2;
        const midY = (a.y + b.y) / 2;
        const [cx, cy] = toPage({ clientX: midX, clientY: midY });
        if (prev.dist > 0) zoomAt(dist / prev.dist, cx, cy);
        panBy(midX - prev.midX, midY - prev.midY);
        pinchRef.current = { dist, midX, midY };
        return;
      }
    }
    const pan = panRef.current;
    if (pan && pan.id === e.pointerId) {
      panBy(e.clientX - pan.x, e.clientY - pan.y);
      panRef.current = { id: pan.id, x: e.clientX, y: e.clientY };
      return;
    }
    const d = drawingRef.current;
    if (!d) return;
    e.preventDefault();
    const events =
      typeof e.nativeEvent.getCoalescedEvents === "function"
        ? e.nativeEvent.getCoalescedEvents()
        : [e.nativeEvent];
    if (!d.color) {
      for (const ev of events) eraseAt(...toPage(ev));
      return;
    }
    for (const ev of events) {
      const [x, y] = toPage(ev);
      const lx = d.pts[d.pts.length - 3]!;
      const ly = d.pts[d.pts.length - 2]!;
      if (Math.abs(x - lx) + Math.abs(y - ly) < 0.6) continue; // skip jitter
      const pr = ev.pointerType === "pen" && ev.pressure > 0 ? ev.pressure : 0.5;
      d.pts.push(Math.round(x * 10) / 10, Math.round(y * 10) / 10, Math.round(pr * 100) / 100);
    }
    paint();
  }

  function onUp(e?: ReactPointerEvent<HTMLCanvasElement>) {
    if (e) {
      touchesRef.current.delete(e.pointerId);
      if (touchesRef.current.size < 2) pinchRef.current = null;
      if (panRef.current?.id === e.pointerId) panRef.current = null;
    }
    const d = drawingRef.current;
    drawingRef.current = null;
    erasingRef.current = false;
    if (!d || !d.color || d.pts.length === 0) return;
    updatePage((p) => ({
      ...p,
      undo: [...p.undo.slice(-99), p.strokes],
      redo: [],
      strokes: [...p.strokes, d],
      dirty: true,
    }));
  }

  /* ---------------- actions */
  const undo = () =>
    updatePage((p) =>
      p.undo.length
        ? {
            ...p,
            strokes: p.undo[p.undo.length - 1]!,
            undo: p.undo.slice(0, -1),
            redo: [...p.redo, p.strokes],
            dirty: true,
          }
        : p,
    );
  const redo = () =>
    updatePage((p) =>
      p.redo.length
        ? {
            ...p,
            strokes: p.redo[p.redo.length - 1]!,
            redo: p.redo.slice(0, -1),
            undo: [...p.undo, p.strokes],
            dirty: true,
          }
        : p,
    );
  const setPaper = (paper: Paper) => updatePage((p) => ({ ...p, paper, dirty: true }));

  function addPage(base?: Partial<Page>) {
    setPages((all) => {
      const next = [...all, { ...blankPage(page.paper), ...base }];
      setIndex(next.length - 1);
      return next;
    });
  }

  function deletePage() {
    if (page.strokes.length && !window.confirm("Remove this page from the notebook?")) return;
    setPages((all) => {
      const next = all.filter((_, i) => i !== index);
      setIndex((i) => Math.max(0, Math.min(i, next.length - 1)));
      return next.length ? next : [blankPage()];
    });
  }

  async function writeOnSlide() {
    const img = await captureCurrentSlide().catch(() => null);
    if (!img) {
      toast.error("Open a PDF slide deck on the Slides side first.");
      return;
    }
    addPage({ background: img, backgroundPath: null, dirty: true });
    toast.success("Added the current slide as a page. Write on it!");
  }

  async function rendered(): Promise<RenderedPage> {
    return {
      savedId: page.savedId,
      imagePath: page.imagePath,
      backgroundPath: page.backgroundPath ?? null,
      backgroundDataUrl: page.backgroundPath ? null : (page.background ?? null),
      imageDataUrl: await renderPage(page),
      strokes: page.strokes,
      paper: page.paper,
    };
  }

  const applySaved = (res: SavedPageResult | null, key: string) => {
    if (!res) return;
    setPages((all) =>
      all.map((p) =>
        p.key === key
          ? {
              ...p,
              savedId: res.id,
              imagePath: res.imagePath,
              backgroundPath: res.backgroundPath,
              dirty: false,
            }
          : p,
      ),
    );
  };

  async function save() {
    if (!page.strokes.length && !page.background) return;
    setSaving(true);
    try {
      const key = page.key;
      applySaved(await onSave(await rendered()), key);
    } finally {
      setSaving(false);
    }
  }

  async function convert() {
    if (!page.strokes.length) return;
    const key = page.key;
    applySaved(await onConvert(await rendered()), key);
  }

  useImperativeHandle(ref, () => ({
    openSaved: (saved) => {
      const open = pages.findIndex((p) => p.savedId === saved.id);
      if (open >= 0) {
        setIndex(open);
        return;
      }
      const fresh: Page = {
        key: newKey(),
        savedId: saved.id,
        imagePath: saved.imagePath,
        backgroundPath: saved.backgroundPath,
        background: saved.background,
        paper: saved.paper,
        strokes: saved.strokes,
        undo: [],
        redo: [],
        dirty: false,
      };
      setPages((all) => {
        // Replace an untouched empty page instead of piling up blanks.
        const base = all.length === 1 && !all[0]!.strokes.length && !all[0]!.background ? [] : all;
        const next = [...base, fresh];
        setIndex(next.length - 1);
        return next;
      });
      wrapRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    },
  }));

  // Keyboard: Cmd/Ctrl+Z undo, Shift+Cmd/Ctrl+Z redo (only while the notebook is visible).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
      const el = wrapRef.current;
      if (!el || el.offsetParent === null) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable='true']")) return;
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
      force((n) => n + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const colors = tool === "highlighter" ? HIGHLIGHT : INK;
  const activeColor = tool === "highlighter" ? hlColor : inkColor;
  const isEmpty = !page.strokes.length;

  return (
    <div className="flex flex-col gap-3" data-testid="notebook">
      {/* Tools */}
      <div
        className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-background p-1.5"
        role="toolbar"
        aria-label="Handwriting tools"
      >
        {(
          [
            ["pen", Pen, "Pen"],
            ["highlighter", Highlighter, "Highlighter"],
            ["eraser", Eraser, "Eraser"],
            ["hand", Hand, "Move"],
          ] as const
        ).map(([t, Icon, label]) => (
          <Button
            key={t}
            type="button"
            size="sm"
            variant={tool === t ? "default" : "ghost"}
            aria-pressed={tool === t}
            onClick={() => setTool(t)}
            className="gap-1.5"
          >
            <Icon className="h-4 w-4" />
            <span className="hidden sm:inline">{label}</span>
          </Button>
        ))}
        <span className="mx-1 h-6 w-px bg-border" aria-hidden />
        {(tool === "pen" || tool === "highlighter") && (
          <>
            <div className="flex items-center gap-1" role="radiogroup" aria-label="Colour">
              {colors.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={activeColor === c}
                  aria-label={`Colour ${c}`}
                  onClick={() => (tool === "highlighter" ? setHlColor(c) : setInkColor(c))}
                  className={cn(
                    "h-6 w-6 rounded-full border border-black/10 transition-transform",
                    activeColor === c && "scale-110 ring-2 ring-primary ring-offset-2",
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <span className="mx-1 h-6 w-px bg-border" aria-hidden />
            <div className="flex items-center gap-0.5" role="radiogroup" aria-label="Thickness">
              {[0, 1, 2].map((i) => (
                <button
                  key={i}
                  type="button"
                  role="radio"
                  aria-checked={sizeIdx === i}
                  aria-label={["Thin", "Medium", "Thick"][i]}
                  onClick={() => setSizeIdx(i)}
                  className={cn(
                    "grid h-8 w-8 place-items-center rounded-md hover:bg-muted",
                    sizeIdx === i && "bg-muted",
                  )}
                >
                  <span
                    className="rounded-full"
                    style={{
                      width: 4 + i * 4,
                      height: 4 + i * 4,
                      backgroundColor: activeColor,
                      opacity: tool === "highlighter" ? 0.6 : 1,
                    }}
                  />
                </button>
              ))}
            </div>
            <span className="mx-1 h-6 w-px bg-border" aria-hidden />
          </>
        )}
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          onClick={undo}
          disabled={!page.undo.length}
          aria-label="Undo"
          title="Undo (⌘Z)"
        >
          <Undo2 className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          onClick={redo}
          disabled={!page.redo.length}
          aria-label="Redo"
          title="Redo (⇧⌘Z)"
        >
          <Redo2 className="h-4 w-4" />
        </Button>
        <select
          value={page.paper}
          onChange={(e) => setPaper(e.target.value as Paper)}
          disabled={Boolean(page.background)}
          aria-label="Paper"
          className="ml-auto h-8 rounded-md border border-input bg-background px-2 text-sm"
        >
          {PAPERS.map(([v, l]) => (
            <option key={v} value={v}>
              {l} paper
            </option>
          ))}
        </select>
      </div>

      {/* Page */}
      <div ref={wrapRef} className="relative w-full">
        <canvas
          ref={canvasRef}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onLostPointerCapture={onUp}
          className={cn(
            "block w-full touch-none rounded-lg border border-border bg-white shadow-sm",
            tool === "eraser"
              ? "cursor-cell"
              : tool === "hand"
                ? "cursor-grab active:cursor-grabbing"
                : "cursor-crosshair",
          )}
          style={{ aspectRatio: `${PAGE_W} / ${PAGE_H}` }}
          aria-label={`Handwriting page ${index + 1} of ${pages.length}`}
        />
        {page.dirty && page.savedId && (
          <span className="pointer-events-none absolute right-2 top-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
            Unsaved changes
          </span>
        )}
        <div
          className="absolute bottom-2 right-2 flex items-center gap-0.5 rounded-lg border border-border bg-background/90 p-0.5 shadow-sm backdrop-blur"
          role="group"
          aria-label="Zoom"
        >
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => zoomBy(1 / 1.25)}
            disabled={zoomPct <= MIN_ZOOM * 100}
            aria-label="Zoom out"
            title="Zoom out"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <button
            type="button"
            onClick={fitPage}
            className="min-w-[3.25rem] rounded px-1 text-xs font-medium tabular-nums hover:bg-muted"
            title="Reset to 100%"
            aria-label={`Zoom ${zoomPct}%, reset`}
          >
            {zoomPct}%
          </button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => zoomBy(1.25)}
            disabled={zoomPct >= MAX_ZOOM * 100}
            aria-label="Zoom in"
            title="Zoom in (or pinch / ⌘ + scroll)"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={fitPage}
            disabled={zoomPct === 100 && viewRef.current.x === 0 && viewRef.current.y === 0}
            aria-label="Fit page"
            title="Fit page"
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Pages + actions */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="h-8 w-8"
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            disabled={index === 0}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[5rem] text-center text-sm tabular-nums text-muted-foreground">
            Page {index + 1} / {pages.length}
          </span>
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="h-8 w-8"
            onClick={() => setIndex((i) => Math.min(pages.length - 1, i + 1))}
            disabled={index >= pages.length - 1}
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => addPage()}>
          <FilePlus2 className="mr-1.5 h-4 w-4" /> New page
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => void writeOnSlide()}>
          <Presentation className="mr-1.5 h-4 w-4" /> Write on slide
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-8 w-8 text-muted-foreground hover:text-destructive"
          onClick={deletePage}
          aria-label="Remove page from notebook"
          title="Remove page from notebook"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={saving || (isEmpty && !page.background) || (!page.dirty && !!page.savedId)}
            onClick={() => void save()}
          >
            <Save className="mr-1.5 h-4 w-4" />
            {saving ? "Saving…" : page.savedId && !page.dirty ? "Saved" : "Save page"}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={isEmpty || converting}
            onClick={() => void convert()}
          >
            <Sparkles className="mr-1.5 h-4 w-4" />
            {converting ? "Converting…" : "Convert to text"}
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Write with an Apple Pencil or stylus (pressure-sensitive; your palm is ignored once the
        pencil is used), a mouse or a trackpad. Pinch or ⌘/Ctrl + scroll to zoom; scroll or use Move
        to get around a zoomed page. Pages are kept on this device until you save them. "Convert to
        text" adds the page to your typed notes.
      </p>
    </div>
  );
});
