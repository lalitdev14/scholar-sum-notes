import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  BookPlus,
  ChevronLeft,
  ChevronRight,
  FileDown,
  Eraser,
  Expand,
  FilePlus2,
  Hand,
  Highlighter,
  Maximize2,
  Pen,
  Layers,
  MoreHorizontal,
  Presentation,
  Redo2,
  Save,
  Shrink,
  Sparkles,
  Trash2,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { captureAllSlides, captureCurrentSlide, slideCount } from "@/lib/slide-capture";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/* ------------------------------------------------------------------ model */

/** Logical page size; strokes are stored in these units so they scale with the screen. */
export const PAGE_W = 1000;
/** Default page length; pages grow longer as you write near the bottom. */
export const PAGE_H = 700;
const PEN_SEEN_KEY = "lectureloop:pen-seen";
const SLIDES_WIDTH_KEY = "lectureloop:fullscreen-slides-width";
const MAX_PAGE_H = 8000;
/** Grow a page when ink comes this close to the bottom, by this much. */
const GROW_MARGIN = 140;
const GROW_STEP = 500;

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
  /** Page length in page units (width is always PAGE_W). Older drafts may lack it. */
  height?: number | undefined;
  strokes: Stroke[];
  undo: Stroke[][];
  redo: Stroke[][];
  dirty: boolean;
};

const pageHeight = (p: { height?: number | undefined }) => p.height ?? PAGE_H;

/** What the class page receives to save or convert a page. */
export type RenderedPage = {
  savedId?: string | undefined;
  imagePath?: string | undefined;
  backgroundPath?: string | null;
  backgroundDataUrl?: string | null;
  imageDataUrl: string;
  strokes: Stroke[];
  paper: Paper;
  height: number;
  notebookId: string;
  notebookTitle: string;
  pageIndex: number;
};

/** A saved page as loaded back into the notebook. */
export type OpenPage = {
  id: string;
  imagePath: string;
  strokes: Stroke[];
  paper: Paper;
  height: number;
  backgroundPath: string | null;
  background: string | null;
};

export type SavedPageResult = { id: string; imagePath: string; backgroundPath: string | null };

export type NotebookHandle = {
  /** Opens a whole saved notebook (asks first if the current one has unsaved pages). */
  openNotebook: (nb: { id: string; title: string; pages: OpenPage[]; startIndex?: number }) => void;
  /** Opens a saved page for editing (adds it as a page, or jumps to it if already open). */
  openSaved: (page: {
    id: string;
    imagePath: string;
    strokes: Stroke[];
    paper: Paper;
    height: number;
    backgroundPath: string | null;
    background: string | null;
  }) => void;
  /** Downloads every page with ink as one PDF (same as the ⋯ menu's Download PDF). */
  downloadPdf: () => Promise<void>;
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

/**
 * Keeps the view inside the page (when it's bigger than the screen) and centres the page
 * when it's smaller. `aspect` is the viewport's height / width; at zoom 1 the page width
 * fills the viewport.
 */
function clampView(v: View, pageH: number, aspect: number): View {
  const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.z));
  const vw = PAGE_W / z;
  const vh = (PAGE_W * aspect) / z;
  const x = vw >= PAGE_W ? (PAGE_W - vw) / 2 : Math.min(Math.max(v.x, 0), PAGE_W - vw);
  const y = vh >= pageH ? (pageH - vh) / 2 : Math.min(Math.max(v.y, 0), pageH - vh);
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

function drawPaper(ctx: CanvasRenderingContext2D, paper: Paper, h = PAGE_H) {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, PAGE_W, h);
  ctx.save();
  if (paper === "lined") {
    ctx.strokeStyle = "#cfdcef";
    ctx.lineWidth = 1;
    for (let y = 64; y < h; y += 34) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(PAGE_W, y);
      ctx.stroke();
    }
    ctx.strokeStyle = "#f3b3b3";
    ctx.beginPath();
    ctx.moveTo(72, 0);
    ctx.lineTo(72, h);
    ctx.stroke();
  } else if (paper === "grid") {
    ctx.strokeStyle = "#e3e8ef";
    ctx.lineWidth = 1;
    for (let x = 25; x < PAGE_W; x += 25) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 25; y < h; y += 25) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(PAGE_W, y);
      ctx.stroke();
    }
  } else if (paper === "dotted") {
    ctx.fillStyle = "#c3cad6";
    for (let x = 25; x < PAGE_W; x += 25)
      for (let y = 25; y < h; y += 25) {
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
async function renderPage(page: Page): Promise<string> {
  const h = pageHeight(page);
  // Long pages are saved at a slightly lower resolution to stay well under 5 MB.
  const scale = h > 1600 ? 1 : 1.5;
  const canvas = document.createElement("canvas");
  canvas.width = PAGE_W * scale;
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);
  if (page.background) drawBackground(ctx, await loadImage(page.background));
  else drawPaper(ctx, page.paper, h);
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
  onSave: (page: RenderedPage, opts?: { quiet?: boolean }) => Promise<SavedPageResult | null>;
  /** Renames a notebook that already has saved pages. */
  onRenameNotebook?: (id: string, title: string) => void;
  /** Title for new notebooks, e.g. "CS-221 notebook · Nov 16". */
  defaultTitle?: string;
  /** Slide viewer shown in the sidebar of full-screen mode. */
  slidesPanel?: ReactNode;
  /** Told whether the open notebook has any ink or slide pages (e.g. to enable Export). */
  onHasContentChange?: (hasContent: boolean) => void;
};

export const HandwritingNotebook = forwardRef<NotebookHandle, Props>(function HandwritingNotebook(
  {
    classId,
    converting = false,
    onConvert,
    onSave,
    onRenameNotebook,
    defaultTitle = "Notebook",
    slidesPanel,
    onHasContentChange,
  },
  ref,
) {
  const draftKey = `lectureloop:notebook:${classId}`;
  const [notebookId, setNotebookId] = useState<string>(() => crypto.randomUUID());
  const [title, setTitle] = useState(defaultTitle);
  // The default title can change once the class has loaded; follow it until the user edits it.
  const lastDefault = useRef(defaultTitle);
  useEffect(() => {
    const prev = lastDefault.current;
    lastDefault.current = defaultTitle;
    setTitle((t) => (t === prev ? defaultTitle : t));
  }, [defaultTitle]);
  const [savingAll, setSavingAll] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
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
  // Once a stylus has been used on this device, fingers never draw (palm rejection).
  const penSeenRef = useRef(false);
  /** The one pointer that is drawing/erasing right now; every other pointer is ignored. */
  const drawPtrRef = useRef<{ id: number; type: string } | null>(null);
  /** Touches set aside as a palm: ignored until they lift. */
  const palmIdsRef = useRef(new Set<number>());
  /** When the pen last lifted; touches just after that are treated as the resting hand. */
  const penUpAtRef = useRef(0);
  const scaleRef = useRef(1);
  const viewRef = useRef<View>({ z: 1, x: 0, y: 0 });
  const aspectRef = useRef(PAGE_H / PAGE_W); // viewport height / width
  const pageRef = useRef<Page | null>(null);
  pageRef.current = page;
  const [scrollInfo, setScrollInfo] = useState<{ top: number; size: number } | null>(null);
  const [zoomPct, setZoomPct] = useState(100);
  const touchesRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ dist: number; midX: number; midY: number } | null>(null);
  const panRef = useRef<{ id: number; x: number; y: number } | null>(null);
  /** Where a one- or two-finger gesture began, to spot a page-turn swipe when it ends. */
  const swipeRef = useRef<{
    x: number;
    y: number;
    dist: number;
    t: number;
    fingers: number;
  } | null>(null);
  /** Latest page-turn function, for listeners registered once. */
  const turnPageRef = useRef<(dir: 1 | -1) => void>(() => {});
  /** Which way the page just turned, for the slide-in animation. */
  const [flip, setFlip] = useState<{ dir: 1 | -1; n: number } | null>(null);
  const frameRef = useRef(0);
  const [fullscreen, setFullscreen] = useState(false);
  /** Progress while "Write on all slides" renders the deck. */
  const [allSlides, setAllSlides] = useState<{ done: number; total: number } | null>(null);
  const [slidesOpen, setSlidesOpen] = useState(false);
  /** Full screen: the slides panel's share of the width (dragged with the divider). */
  const [slidesFrac, setSlidesFrac] = useState<number | null>(() => {
    try {
      const v = Number(localStorage.getItem(SLIDES_WIDTH_KEY));
      return v > 0.15 && v < 0.85 ? v : null;
    } catch {
      return null;
    }
  });
  const splitRef = useRef<HTMLDivElement>(null);
  const [moreOpen, setMoreOpen] = useState(false);

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
      const saved = JSON.parse(raw) as {
        pages: Omit<Page, "undo" | "redo">[];
        index: number;
        notebookId?: string;
        title?: string;
      };
      if (saved.pages?.length && saved.pages.some((p) => p.strokes.length || p.background)) {
        setPages(saved.pages.map((p) => ({ ...p, undo: [], redo: [] })));
        setIndex(Math.min(saved.index ?? 0, saved.pages.length - 1));
        if (saved.notebookId) setNotebookId(saved.notebookId);
        if (saved.title) setTitle(saved.title);
      }
    } catch {
      /* ignore */
    }
  }, [draftKey]);

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const light = pages.map(({ undo: _u, redo: _r, ...p }) => p);
        localStorage.setItem(draftKey, JSON.stringify({ pages: light, index, notebookId, title }));
      } catch {
        // Too big for local storage (large slide images): keep the ink, drop the images.
        try {
          const light = pages.map(({ undo: _u, redo: _r, background: _b, ...p }) => p);
          localStorage.setItem(
            draftKey,
            JSON.stringify({ pages: light, index, notebookId, title }),
          );
        } catch {
          /* storage unavailable */
        }
      }
    }, 400);
    return () => clearTimeout(t);
  }, [pages, index, draftKey, notebookId, title]);

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
    const h = page.height ?? PAGE_H;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, PAGE_W, h);
    ctx.clip();
    if (page.background && bgImgRef.current) drawBackground(ctx, bgImgRef.current.img);
    else drawPaper(ctx, page.paper, h);
    for (const st of page.strokes) drawStroke(ctx, st);
    ctx.restore();
  }, [page.background, page.paper, page.strokes, page.height]);

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
    const h = pageHeight(pageRef.current ?? { height: PAGE_H });
    const v = clampView(next, h, aspectRef.current);
    viewRef.current = v;
    setZoomPct(Math.round(v.z * 100));
    // Scroll indicator for pages longer than the screen.
    const vh = (PAGE_W * aspectRef.current) / v.z;
    setScrollInfo(vh < h - 1 ? { top: Math.max(0, v.y / h), size: Math.min(1, vh / h) } : null);
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
    zoomAt(factor, v.x + PAGE_W / (2 * v.z), v.y + (PAGE_W * aspectRef.current) / (2 * v.z));
  };
  /** Back to 100% (page width fits the screen), keeping the current scroll position. */
  const fitPage = () => setView({ z: 1, x: 0, y: viewRef.current.y });
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
    const wheelSwipe = { sum: 0, last: 0, lockedUntil: 0 };
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const [cx, cy] = toPage(e);
        zoomAt(Math.exp(-e.deltaY * 0.01), cx, cy);
      } else {
        // Scroll the page when it's bigger than the screen (zoomed in or a long page).
        const v = viewRef.current;
        const h = pageHeight(pageRef.current ?? { height: PAGE_H });
        // Trackpad: a sideways two-finger swipe turns the page (when not zoomed in).
        if (v.z <= 1.001 && Math.abs(e.deltaX) > Math.abs(e.deltaY) * 1.5) {
          e.preventDefault(); // also stops the browser's swipe-back navigation
          const now = Date.now();
          const w = wheelSwipe;
          if (now - w.last > 250) w.sum = 0; // a new gesture
          w.last = now;
          if (now < w.lockedUntil) return;
          w.sum += e.deltaX;
          if (Math.abs(w.sum) > 120) {
            turnPageRef.current(w.sum > 0 ? 1 : -1);
            w.sum = 0;
            w.lockedUntil = now + 700; // one turn per swipe (momentum keeps sending events)
          }
          return;
        }
        const overflow = v.z > 1.001 || (PAGE_W * aspectRef.current) / v.z < h - 1;
        if (!overflow) return;
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
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      if (!w || !h) return; // hidden tab
      const width = Math.round(w * dpr);
      const height = Math.round(h * dpr);
      if (canvas.width === width && canvas.height === height) return;
      scaleRef.current = w / PAGE_W;
      aspectRef.current = h / w;
      canvas.width = width;
      canvas.height = height;
      setView(viewRef.current); // re-clamp for the new box
      setBoxTick((t) => t + 1);
      redrawRef.current();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  /* ---------------- input */
  /** Screen point → page units, through the current zoom. */
  const toPage = (e: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const v = viewRef.current;
    const u = PAGE_W / rect.width / v.z; // page units per screen pixel
    return [(e.clientX - rect.left) * u + v.x, (e.clientY - rect.top) * u + v.y] as const;
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

  const PALM_SIZE = 32; // CSS px: a contact wider/taller than this is a palm, not a fingertip
  const PEN_GRACE_MS = 400; // touches this soon after the pen lifts are the resting hand

  function markPenSeen() {
    if (penSeenRef.current) return;
    penSeenRef.current = true;
    try {
      localStorage.setItem(PEN_SEEN_KEY, "1");
    } catch {
      /* private mode */
    }
  }

  /** Puts every current touch aside as a palm (and stops any pan/pinch they started). */
  function rejectTouches() {
    for (const id of touchesRef.current.keys()) palmIdsRef.current.add(id);
    touchesRef.current.clear();
    pinchRef.current = null;
    if (panRef.current && palmIdsRef.current.has(panRef.current.id)) panRef.current = null;
  }

  const SWIPE_MIN_PX = 70;
  const SWIPE_MAX_MS = 600;
  /** A quick sideways swipe turns the page, like a book (only when the page isn't zoomed in). */
  function endSwipe(endX: number, endY: number, endDist = 0) {
    const sw = swipeRef.current;
    swipeRef.current = null;
    if (!sw || viewRef.current.z > 1.001) return;
    const dx = endX - sw.x;
    const dy = endY - sw.y;
    const pinched = sw.fingers === 2 && sw.dist > 0 && Math.abs(endDist / sw.dist - 1) > 0.2;
    if (pinched || Date.now() - sw.t > SWIPE_MAX_MS) return;
    if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    turnPageRef.current(dx < 0 ? 1 : -1); // right-to-left → next page
  }

  function onDown(e: ReactPointerEvent<HTMLCanvasElement>) {
    window.getSelection()?.removeAllRanges(); // a stray text selection would steal the pen
    const drawing = drawPtrRef.current;

    if (e.pointerType === "pen") {
      markPenSeen();
      // The pen always wins: a palm that landed first and started a stroke loses it.
      if (drawing && drawing.type !== "pen") {
        drawingRef.current = null;
        drawPtrRef.current = null;
        erasingRef.current = false;
      } else if (drawing) return;
      rejectTouches();
    } else if (e.pointerType === "touch") {
      const palmLike =
        e.width > PALM_SIZE ||
        e.height > PALM_SIZE ||
        drawing?.type === "pen" ||
        Date.now() - penUpAtRef.current < PEN_GRACE_MS;
      if (palmLike) {
        palmIdsRef.current.add(e.pointerId);
        return;
      }
      touchesRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touchesRef.current.size === 2) {
        // Two fingers: pinch to zoom / drag to pan. Drop any stroke the first finger began.
        if (drawing?.type === "touch") {
          drawingRef.current = null;
          drawPtrRef.current = null;
          erasingRef.current = false;
        }
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
        swipeRef.current = {
          x: pinchRef.current.midX,
          y: pinchRef.current.midY,
          dist: pinchRef.current.dist,
          t: Date.now(),
          fingers: 2,
        };
        paint();
        return;
      }
      if (touchesRef.current.size > 2 || drawing) return;
    } else if (drawing) {
      return;
    }

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* pointer already gone */
    }
    // Once a stylus is used, a finger pans instead of drawing. The hand tool always pans.
    if ((e.pointerType === "touch" && penSeenRef.current) || tool === "hand") {
      panRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
      if (e.pointerType === "touch")
        swipeRef.current = { x: e.clientX, y: e.clientY, dist: 0, t: Date.now(), fingers: 1 };
      return;
    }
    const [x, y] = toPage(e);
    drawPtrRef.current = { id: e.pointerId, type: e.pointerType };
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
    if (palmIdsRef.current.has(e.pointerId)) return;
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
    // Only the pointer that started the stroke adds to it (a resting palm never does).
    if (!d || drawPtrRef.current?.id !== e.pointerId) return;
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

  function onUp(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (palmIdsRef.current.delete(e.pointerId)) return;
    const pinch = pinchRef.current;
    if (pinch && swipeRef.current?.fingers === 2 && e.type === "pointerup") {
      endSwipe(pinch.midX, pinch.midY, pinch.dist);
    } else if (panRef.current?.id === e.pointerId && swipeRef.current?.fingers === 1) {
      if (e.type === "pointerup") endSwipe(e.clientX, e.clientY);
      else swipeRef.current = null;
    }
    touchesRef.current.delete(e.pointerId);
    if (touchesRef.current.size < 2) pinchRef.current = null;
    if (panRef.current?.id === e.pointerId) panRef.current = null;
    // Lifting (or cancelling) any other pointer never ends the stroke in progress.
    if (drawPtrRef.current?.id !== e.pointerId) return;
    if (drawPtrRef.current.type === "pen") penUpAtRef.current = Date.now();
    drawPtrRef.current = null;
    const d = drawingRef.current;
    drawingRef.current = null;
    erasingRef.current = false;
    if (!d || !d.color || d.pts.length === 0) return;
    let maxY = 0;
    for (let i = 1; i < d.pts.length; i += 3) maxY = Math.max(maxY, d.pts[i]!);
    updatePage((p) => {
      const h = pageHeight(p);
      // Dynamic page: writing near the bottom adds more paper (slide pages keep their size).
      const grow = !p.background && maxY > h - GROW_MARGIN;
      return {
        ...p,
        height: grow ? Math.min(MAX_PAGE_H, h + GROW_STEP) : p.height,
        undo: [...p.undo.slice(-99), p.strokes],
        redo: [],
        strokes: [...p.strokes, d],
        dirty: true,
      };
    });
  }

  // iPad Safari: block its own touch gestures on the page (text selection, the magnifier,
  // swipe-to-scroll, double-tap zoom, swipe down out of full screen). Must be non-passive.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      penSeenRef.current ||= localStorage.getItem(PEN_SEEN_KEY) === "1";
    } catch {
      /* private mode */
    }
    const block = (ev: Event) => {
      if (ev.cancelable) ev.preventDefault();
    };
    const opts = { passive: false } as const;
    canvas.addEventListener("touchstart", block, opts);
    canvas.addEventListener("touchmove", block, opts);
    canvas.addEventListener("gesturestart", block, opts);
    canvas.addEventListener("contextmenu", block);
    canvas.addEventListener("selectstart", block);
    return () => {
      canvas.removeEventListener("touchstart", block);
      canvas.removeEventListener("touchmove", block);
      canvas.removeEventListener("gesturestart", block);
      canvas.removeEventListener("contextmenu", block);
      canvas.removeEventListener("selectstart", block);
    };
  }, []);

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

  /** Next/previous page; turning past the last page opens a new one (unless it's blank). */
  function turnPage(dir: 1 | -1) {
    if (dir < 0) {
      if (index === 0) return;
      setIndex(index - 1);
    } else if (index < pages.length - 1) {
      setIndex(index + 1);
    } else if (hasContent(page)) {
      addPage();
    } else {
      return;
    }
    setFlip((f) => ({ dir, n: (f?.n ?? 0) + 1 }));
  }
  turnPageRef.current = turnPage;
  // Slide the new page in from the side it came from.
  useEffect(() => {
    const el = wrapRef.current;
    if (!flip || !el?.animate || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    el.animate(
      [
        { transform: `translateX(${flip.dir * 48}px)`, opacity: 0.35 },
        { transform: "none", opacity: 1 },
      ],
      { duration: 240, easing: "cubic-bezier(.2,.8,.2,1)" },
    );
  }, [flip]);

  async function writeOnSlide() {
    const img = await captureCurrentSlide().catch(() => null);
    if (!img) {
      toast.error("Open a PDF slide deck on the Slides side first.");
      return;
    }
    addPage({ background: img, backgroundPath: null, dirty: true });
    toast.success("Added the current slide as a page. Write on it!");
  }

  /** Adds every slide of the open deck as its own page, in order. */
  async function writeOnAllSlides() {
    const total = slideCount();
    if (!total) {
      toast.error("Open a PDF slide deck on the Slides side first.");
      return;
    }
    if (total > 40 && !window.confirm(`Add all ${total} slides as pages?`)) return;
    setAllSlides({ done: 0, total });
    try {
      const imgs = await captureAllSlides((done) => setAllSlides({ done, total }));
      if (!imgs.length) throw new Error("no slides");
      const added = imgs.map((img) => ({
        ...blankPage(page.paper),
        background: img,
        backgroundPath: null,
        dirty: true,
      }));
      setPages((all) => {
        // Replace an untouched empty page instead of keeping a blank in front.
        const base = all.length === 1 && !hasContent(all[0]!) ? [] : all;
        setIndex(base.length);
        return [...base, ...added];
      });
      setFlip((f) => ({ dir: 1, n: (f?.n ?? 0) + 1 }));
      toast.success(
        `Added all ${imgs.length} slides as pages. Write on them, swipe to turn the page.`,
      );
    } catch {
      toast.error("Could not load the slides. Try again.");
    } finally {
      setAllSlides(null);
    }
  }

  async function rendered(p: Page = page, i: number = index): Promise<RenderedPage> {
    return {
      savedId: p.savedId,
      imagePath: p.imagePath,
      backgroundPath: p.backgroundPath ?? null,
      backgroundDataUrl: p.backgroundPath ? null : (p.background ?? null),
      imageDataUrl: await renderPage(p),
      strokes: p.strokes,
      paper: p.paper,
      height: pageHeight(p),
      notebookId,
      notebookTitle: title.trim() || defaultTitle,
      pageIndex: i,
    };
  }

  const hasContent = (p: Page) => p.strokes.length > 0 || Boolean(p.background);
  const unsavedPages = pages.filter((p) => hasContent(p) && (p.dirty || !p.savedId));

  /** Saves every page with unsaved ink in this notebook. Returns false if one failed. */
  async function saveAll(): Promise<boolean> {
    const todo = pages
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => hasContent(p) && (p.dirty || !p.savedId));
    if (!todo.length) return true;
    setSavingAll(true);
    let ok = 0;
    try {
      for (const { p, i } of todo) {
        const res = await onSave(await rendered(p, i), { quiet: true });
        if (!res) break;
        applySaved(res, p.key);
        ok++;
      }
    } finally {
      setSavingAll(false);
    }
    if (ok === todo.length) toast.success(`Saved ${ok} page${ok === 1 ? "" : "s"} in "${title}"`);
    return ok === todo.length;
  }

  /** Before replacing this notebook: offer to save unsaved pages, or confirm discarding them. */
  async function confirmLeave(): Promise<boolean> {
    if (!unsavedPages.length) return true;
    const n = unsavedPages.length;
    if (window.confirm(`Save the ${n} unsaved page${n === 1 ? "" : "s"} in this notebook first?`)) {
      return saveAll();
    }
    return window.confirm("Continue without saving? Unsaved pages will be lost.");
  }

  async function newNotebook() {
    if (!(await confirmLeave())) return;
    setPages([blankPage(page.paper)]);
    setIndex(0);
    setNotebookId(crypto.randomUUID());
    setTitle(defaultTitle);
    toast.success("Started a new notebook");
  }

  async function downloadPdf() {
    const withInk = pages.filter(hasContent);
    if (!withInk.length) {
      toast.error("Write something first.");
      return;
    }
    setExportingPdf(true);
    try {
      const { downloadNotebookPdf } = await import("@/lib/notebook-pdf");
      const images = [];
      for (const p of withInk) images.push(await renderPage(p));
      await downloadNotebookPdf(title.trim() || defaultTitle, images);
      toast.success(`Downloaded ${withInk.length}-page PDF`);
    } catch (err) {
      console.error("[notebook-pdf]", err);
      toast.error("Could not create the PDF. Please try again.");
    } finally {
      setExportingPdf(false);
    }
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

  const anyContent = pages.some(hasContent);
  useEffect(() => onHasContentChange?.(anyContent), [anyContent, onHasContentChange]);

  useImperativeHandle(ref, () => ({
    downloadPdf,
    openNotebook: (nb) => {
      void (async () => {
        if (nb.id === notebookId && pages.some((p) => p.savedId)) {
          // Already open: just jump to the page.
          const at = nb.pages[nb.startIndex ?? 0];
          const i = at ? pages.findIndex((p) => p.savedId === at.id) : -1;
          if (i >= 0) setIndex(i);
          return;
        }
        if (!(await confirmLeave())) return;
        setPages(
          nb.pages.map((sp) => ({
            key: newKey(),
            savedId: sp.id,
            imagePath: sp.imagePath,
            backgroundPath: sp.backgroundPath,
            background: sp.background,
            paper: sp.paper,
            height: sp.height,
            strokes: sp.strokes,
            undo: [],
            redo: [],
            dirty: false,
          })),
        );
        setIndex(Math.min(nb.startIndex ?? 0, Math.max(0, nb.pages.length - 1)));
        setNotebookId(nb.id);
        setTitle(nb.title);
        wrapRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      })();
    },
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
        height: saved.height,
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

  /* ---------------- dynamic page */
  // Full screen: a page shorter than the box grows to fill it (slide pages keep their size).
  const [boxTick, setBoxTick] = useState(0);
  useEffect(() => {
    if (!fullscreen || page.background) return;
    const minH = Math.ceil(PAGE_W * aspectRef.current);
    if (pageHeight(page) < minH) {
      updatePage((p) => ({ ...p, height: Math.min(MAX_PAGE_H, Math.max(pageHeight(p), minH)) }));
    }
  }, [fullscreen, page, boxTick, updatePage]);
  // Opening another page starts at its top; growth refreshes the scroll indicator.
  useEffect(() => {
    setView({ ...viewRef.current, y: 0 });
  }, [page.key]);
  useEffect(() => {
    setView(viewRef.current);
  }, [page.height]);

  /* ---------------- full screen */
  function enterFullscreen() {
    setFullscreen(true);
    // Also hide the browser's own bars where supported (the whole document, so messages
    // and dialogs stay visible). Not on touch screens: there a downward pen or finger swipe
    // ends the browser's full screen. The overlay alone covers the window just as well.
    const root = document.documentElement;
    const touchScreen = navigator.maxTouchPoints > 0 || matchMedia("(pointer: coarse)").matches;
    if (!touchScreen && !document.fullscreenElement && root.requestFullscreen) {
      root.requestFullscreen({ navigationUI: "hide" }).catch(() => {});
    }
  }
  function exitFullscreen() {
    setFullscreen(false);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }
  useEffect(() => {
    if (!fullscreen) return;
    const html = document.documentElement;
    const prevOverflow = html.style.overflow;
    const prevOverscroll = html.style.overscrollBehavior;
    html.style.overflow = "hidden"; // no page scrolling behind the overlay
    html.style.overscrollBehavior = "none"; // no pull-to-refresh / bounce while writing
    const onKey = (e: KeyboardEvent) => {
      // Esc closes an open menu first (it marks the event handled), then full screen.
      if (e.key === "Escape" && !e.defaultPrevented) exitFullscreen();
    };
    // Leaving the browser's full screen (Esc, gesture) also leaves full-screen writing.
    let wasNative = Boolean(document.fullscreenElement);
    const onChange = () => {
      if (document.fullscreenElement) wasNative = true;
      else if (wasNative) setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onChange);
    return () => {
      html.style.overflow = prevOverflow;
      html.style.overscrollBehavior = prevOverscroll;
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("fullscreenchange", onChange);
    };
  }, [fullscreen]);

  const colors = tool === "highlighter" ? HIGHLIGHT : INK;
  const activeColor = tool === "highlighter" ? hlColor : inkColor;
  const isEmpty = !page.strokes.length;
  /** Drag the divider between the page and the slides (full screen). */
  function setSlidesWidth(frac: number) {
    const f = Math.min(0.85, Math.max(0.2, frac));
    setSlidesFrac(f);
    try {
      localStorage.setItem(SLIDES_WIDTH_KEY, f.toFixed(3));
    } catch {
      /* private mode */
    }
  }
  function onSplitDown(e: ReactPointerEvent<HTMLDivElement>) {
    const box = splitRef.current?.getBoundingClientRect();
    if (!box) return;
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    // The handle is the panel's left edge: the panel spans from the pointer to its right edge.
    const right = el.parentElement?.getBoundingClientRect().right ?? box.right;
    const move = (ev: PointerEvent) => setSlidesWidth((right - ev.clientX) / box.width);
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  }

  const colorRadios = () => (
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
  );
  const sizeRadios = () => (
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
  );

  return (
    <div
      className={cn(
        "flex flex-col gap-3",
        fullscreen && "fixed inset-0 z-50 bg-background p-3 sm:p-4",
        // No text selection / iOS callout around the page (it would grab the pen).
        "select-none [-webkit-touch-callout:none] [&_input]:select-text",
      )}
      data-testid="notebook"
      data-fullscreen={fullscreen || undefined}
      role={fullscreen ? "dialog" : undefined}
      aria-modal={fullscreen || undefined}
      aria-label={fullscreen ? "Full-screen handwriting" : undefined}
    >
      {/* One toolbar. Labels show only when there's room; everything else is in "More". */}
      <div className="@container">
        <div
          className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-background p-1.5"
          role="toolbar"
          aria-label="Handwriting tools"
        >
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={() => turnPage(-1)}
            disabled={index === 0}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[3.25rem] text-center text-sm tabular-nums text-muted-foreground">
            <span className="sr-only @min-[44rem]:not-sr-only">Page </span>
            {index + 1} / {pages.length}
          </span>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={() => turnPage(1)}
            disabled={index >= pages.length - 1}
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="mx-0.5 h-6 w-px bg-border" aria-hidden />
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
              aria-label={label}
              title={label}
              onClick={() => setTool(t)}
              className="h-8 gap-1.5 px-2"
            >
              <Icon className="h-4 w-4" />
              <span className="hidden @min-[62rem]:inline">{label}</span>
            </Button>
          ))}
          {(tool === "pen" || tool === "highlighter") && (
            <>
              <span className="mx-0.5 h-6 w-px bg-border" aria-hidden />
              {/* Wide bar: colours inline. Narrow bar: one swatch that opens them. */}
              <div className="hidden items-center gap-1 @min-[62rem]:flex">{colorRadios()}</div>
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="grid h-8 w-8 place-items-center rounded-md hover:bg-muted @min-[62rem]:hidden"
                    aria-label="Colour and thickness"
                    title="Colour and thickness"
                  >
                    <span
                      className="rounded-full ring-2 ring-border ring-offset-1"
                      style={{
                        width: 10 + sizeIdx * 4,
                        height: 10 + sizeIdx * 4,
                        backgroundColor: activeColor,
                      }}
                    />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto space-y-3 p-3" align="start">
                  <div className="flex items-center gap-1.5">{colorRadios()}</div>
                  <div className="flex items-center gap-1">{sizeRadios()}</div>
                </PopoverContent>
              </Popover>
              <div className="hidden items-center gap-0.5 @min-[62rem]:flex">{sizeRadios()}</div>
            </>
          )}
          <span className="mx-0.5 h-6 w-px bg-border" aria-hidden />
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

          <div className="ml-auto flex items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5 px-2"
                  aria-label="Add page"
                  title="Add a page"
                  disabled={Boolean(allSlides)}
                >
                  <FilePlus2 className="h-4 w-4" />
                  {allSlides ? (
                    <span className="tabular-nums">
                      {allSlides.done}/{allSlides.total}
                    </span>
                  ) : (
                    <span className="hidden @min-[44rem]:inline">Add page</span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuItem onSelect={() => addPage()}>
                  <FilePlus2 className="h-4 w-4" /> New page
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void writeOnSlide()}>
                  <Presentation className="h-4 w-4" /> Write on slide
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void writeOnAllSlides()}>
                  <Layers className="h-4 w-4" /> Write on all slides
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="relative h-8 gap-1.5 px-2"
              disabled={saving || (isEmpty && !page.background) || (!page.dirty && !!page.savedId)}
              onClick={() => void save()}
              aria-label="Save page"
              title={page.savedId && !page.dirty ? "Saved" : "Save this page"}
            >
              <Save className="h-4 w-4" />
              <span className="hidden @min-[44rem]:inline">
                {saving ? "Saving…" : page.savedId && !page.dirty ? "Saved" : "Save"}
              </span>
              {hasContent(page) && (page.dirty || !page.savedId) && (
                <span
                  className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-amber-500"
                  aria-hidden
                />
              )}
            </Button>
            <Popover open={moreOpen} onOpenChange={setMoreOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="h-8 w-8"
                  aria-label="More options"
                  title="Notebook, PDF, paper, convert…"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72 p-2">
                <div className="px-1 pb-2">
                  <label className="text-xs font-medium text-muted-foreground" htmlFor="nb-title">
                    Notebook
                  </label>
                  <Input
                    id="nb-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value.slice(0, 200))}
                    onBlur={() => {
                      if (pages.some((p) => p.savedId) && title.trim())
                        onRenameNotebook?.(notebookId, title.trim());
                    }}
                    aria-label="Notebook title"
                    className="mt-1 h-8"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {pages.length} page{pages.length === 1 ? "" : "s"}
                    {unsavedPages.length ? ` · ${unsavedPages.length} unsaved` : ""}
                  </p>
                </div>
                <div className="grid gap-0.5 border-t border-border pt-2">
                  {(
                    [
                      [
                        Save,
                        savingAll ? "Saving…" : "Save all",
                        "Save all",
                        () => void saveAll(),
                        savingAll || !unsavedPages.length,
                      ],
                      [
                        FileDown,
                        exportingPdf ? "Making PDF…" : "Download PDF",
                        "PDF",
                        () => void downloadPdf(),
                        exportingPdf,
                      ],
                      [
                        Sparkles,
                        converting ? "Converting…" : "Convert to text",
                        "Convert to text",
                        () => void convert(),
                        isEmpty || converting,
                      ],
                      [BookPlus, "New notebook", "New notebook", () => void newNotebook(), false],
                    ] as const
                  ).map(([Icon, text, name, run, off]) => (
                    <Button
                      key={name}
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="justify-start gap-2"
                      onClick={() => {
                        setMoreOpen(false);
                        run();
                      }}
                      disabled={off}
                      aria-label={name}
                    >
                      <Icon className="h-4 w-4" /> {text}
                    </Button>
                  ))}
                </div>
                <div className="mt-2 flex items-center gap-2 border-t border-border px-1 pt-2">
                  <select
                    value={page.paper}
                    onChange={(e) => setPaper(e.target.value as Paper)}
                    disabled={Boolean(page.background)}
                    aria-label="Paper"
                    className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-sm"
                  >
                    {PAPERS.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l} paper
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => {
                      setMoreOpen(false);
                      deletePage();
                    }}
                    aria-label="Remove page from notebook"
                    title="Remove this page from the notebook"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
            <Button
              type="button"
              size="sm"
              variant={fullscreen ? "default" : "outline"}
              onClick={fullscreen ? exitFullscreen : enterFullscreen}
              aria-label={fullscreen ? "Exit full screen" : "Full screen"}
              title={fullscreen ? "Exit full screen (Esc)" : "Write in full screen"}
              className="h-8 gap-1.5 px-2"
            >
              {fullscreen ? <Shrink className="h-4 w-4" /> : <Expand className="h-4 w-4" />}
              <span className="hidden @min-[44rem]:inline">
                {fullscreen ? "Exit" : "Full screen"}
              </span>
            </Button>
          </div>
        </div>
      </div>

      {/* Full screen: page column + slides sidebar. Inline: these wrappers do nothing. */}
      <div ref={splitRef} className={fullscreen ? "relative flex min-h-0 flex-1" : "contents"}>
        <div
          className={
            fullscreen ? "flex min-w-0 flex-1 flex-col gap-3 overflow-hidden pr-2" : "contents"
          }
        >
          {/* Page */}
          <div ref={wrapRef} className={cn("relative w-full", fullscreen && "min-h-0 flex-1")}>
            <canvas
              ref={canvasRef}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
              onLostPointerCapture={onUp}
              className={cn(
                "block w-full touch-none select-none rounded-lg border border-border bg-white shadow-sm",
                fullscreen && "h-full",
                tool === "eraser"
                  ? "cursor-cell"
                  : tool === "hand"
                    ? "cursor-grab active:cursor-grabbing"
                    : "cursor-crosshair",
              )}
              style={fullscreen ? undefined : { aspectRatio: `${PAGE_W} / ${PAGE_H}` }}
              aria-label={`Handwriting page ${index + 1} of ${pages.length}`}
            />
            {scrollInfo && (
              // Where you are on a long page.
              <div
                className="pointer-events-none absolute bottom-2 right-1 top-2 w-1 rounded-full bg-black/5"
                aria-hidden
              >
                <div
                  className="absolute w-full rounded-full bg-black/30"
                  style={{ top: `${scrollInfo.top * 100}%`, height: `${scrollInfo.size * 100}%` }}
                />
              </div>
            )}
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
        </div>

        {fullscreen && (
          <>
            {/* Click the bar to show the slides; click it again to hide them. */}
            <button
              type="button"
              onClick={() => setSlidesOpen((o) => !o)}
              aria-expanded={slidesOpen}
              aria-controls="notebook-slides"
              aria-label={slidesOpen ? "Hide slides" : "Show slides"}
              title={slidesOpen ? "Hide slides" : "Show slides"}
              className={cn(
                "flex w-9 shrink-0 flex-col items-center justify-center gap-2 border border-border bg-muted/70 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                slidesOpen ? "rounded-none border-r-0" : "rounded-lg",
              )}
            >
              {slidesOpen ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronLeft className="h-4 w-4" />
              )}
              <span className="tracking-wide" style={{ writingMode: "vertical-rl" }}>
                Slides
              </span>
              <Presentation className="h-4 w-4" />
            </button>
            {slidesOpen && (
              <aside
                id="notebook-slides"
                aria-label="Lecture slides"
                style={slidesFrac ? { width: `${slidesFrac * 100}%` } : undefined}
                className="relative flex w-[42%] min-w-[15rem] shrink-0 flex-col overflow-hidden rounded-r-lg border border-border bg-background p-3 pl-5 max-lg:absolute max-lg:inset-y-0 max-lg:right-9 max-lg:z-10 max-lg:w-[85%] max-lg:shadow-xl"
              >
                {/* Drag to give the page or the slides more room (arrow keys work too). */}
                <div
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="Resize slides panel"
                  aria-valuenow={Math.round((slidesFrac ?? 0.42) * 100)}
                  aria-valuemin={20}
                  aria-valuemax={85}
                  tabIndex={0}
                  onPointerDown={onSplitDown}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowLeft") setSlidesWidth((slidesFrac ?? 0.42) + 0.03);
                    if (e.key === "ArrowRight") setSlidesWidth((slidesFrac ?? 0.42) - 0.03);
                  }}
                  className="group absolute inset-y-0 left-0 z-10 flex w-4 cursor-col-resize touch-none items-center justify-center focus-visible:outline-none"
                >
                  <span className="flex h-14 w-1.5 items-center justify-center rounded-full bg-border transition-colors group-hover:bg-primary/60 group-focus-visible:bg-primary group-active:bg-primary" />
                </div>
                {slidesPanel ?? (
                  <p className="m-auto max-w-xs text-center text-sm text-muted-foreground">
                    Add lecture slides on the Slides side to see them here.
                  </p>
                )}
              </aside>
            )}
          </>
        )}
      </div>

      <p className={cn("text-xs text-muted-foreground", fullscreen && "hidden")}>
        Write with an Apple Pencil or stylus (pressure-sensitive; your palm is ignored once the
        pencil is used), a mouse or a trackpad. Pinch or ⌘/Ctrl + scroll to zoom; scroll or use Move
        to get around a zoomed page. Swipe sideways (two fingers, or one once you've used a pencil)
        to turn the page; swiping past the last page starts a new one. Pages are kept on this device
        until you save them. "Convert to text" adds the page to your typed notes.
      </p>
    </div>
  );
});
