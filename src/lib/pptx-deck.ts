/**
 * Opens a PowerPoint deck with pptx-preview, tolerating decks the library can't fully read.
 *
 * pptx-preview finds each slide's layout, each layout's master and each master's theme by
 * file name. Decks saved by Keynote, Google Slides and some converters can name or list these
 * parts differently, so a lookup comes back empty and drawing a slide crashes (for example
 * "Cannot read properties of undefined (reading 'background')"). One bad slide also used to
 * stop the whole deck. Here we:
 *  1. load the deck, then link any slide, layout or master that has no parent to one that exists;
 *  2. draw each slide on its own: a slide that still fails shows its text and a short note.
 */
import type { init as initPreview } from "pptx-preview";

type Viewer = ReturnType<typeof initPreview>;

/* The library's internal objects (not in its public types). */
type Theme = { getColor?: (name: string) => string | undefined };
type Master = { theme?: Theme };
type Layout = { name?: string; slideMaster?: Master };
type Slide = { name?: string; source?: unknown; slideLayout?: Layout; textLines?: string[] };
type ZipFile = { async: (type: "text") => Promise<string> };
type Deck = {
  slides: Slide[];
  slideLayouts: Layout[];
  slideMaster: Master[];
  themes: Theme[];
  _zipContents?: { files: Record<string, ZipFile> };
};
type Render = {
  renderSlide: (index: number) => void;
  renderPort: { width: number; height: number };
  options: { viewPort: { width: number; height: number } };
  _calcScaleAndRenderPort?: () => void;
};

const EMPTY_THEME: Theme & Record<string, unknown> = {
  clrScheme: {},
  borderScheme: [],
  getColor: () => undefined,
  getLineStyle: () => undefined,
};

/** Fills in missing slide → layout → master → theme links. Returns how many were repaired. */
export function repairDeck(deck: Deck): number {
  let repaired = 0;
  const theme = deck.themes?.[0] ?? EMPTY_THEME;
  for (const master of deck.slideMaster ?? []) {
    if (!master.theme) {
      master.theme = theme;
      repaired++;
    }
  }
  const master = deck.slideMaster?.[0];
  for (const layout of deck.slideLayouts ?? []) {
    if (!layout.slideMaster && master) {
      layout.slideMaster = master;
      repaired++;
    }
  }
  const layouts = (deck.slideLayouts ?? []).filter((l) => l.slideMaster);
  for (const slide of deck.slides ?? []) {
    if (!slide.slideLayout && layouts.length) {
      // Prefer a "Title and Content"-style layout (usually slideLayout2), else the first one.
      slide.slideLayout =
        layouts.find((l) => /slideLayout2\.xml$/.test(l.name ?? "")) ?? layouts[0]!;
      repaired++;
    }
  }
  return repaired;
}

/**
 * pptx-preview silently drops slides it can't link to a layout (sometimes all of them).
 * Re-reads the slide list from the file and puts any dropped slide back, in order, as a
 * text-only slide. Returns how many were added back.
 */
export async function restoreDroppedSlides(deck: Deck): Promise<number> {
  const files = deck._zipContents?.files;
  if (!files) return 0;
  const order = await slideOrder(files);
  const loaded = new Map((deck.slides ?? []).map((sl) => [sl.name, sl]));
  if (order.every((name) => loaded.has(name))) return 0;
  let added = 0;
  const full: Slide[] = [];
  for (const name of order) {
    const existing = loaded.get(name);
    if (existing) {
      full.push(existing);
      continue;
    }
    const xml = await files[name]?.async("text").catch(() => "");
    full.push({ name, source: null, textLines: xml ? textFromSlideXml(xml) : [] });
    added++;
  }
  deck.slides.splice(0, deck.slides.length, ...full);
  return added;
}

/** Slide part names in presentation order (from presentation.xml), else by file number. */
async function slideOrder(files: Record<string, ZipFile>): Promise<string[]> {
  const byNumber = Object.keys(files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.match(/(\d+)\.xml$/)![1]) - Number(b.match(/(\d+)\.xml$/)![1]));
  try {
    const [pres, rels] = await Promise.all([
      files["ppt/presentation.xml"]!.async("text"),
      files["ppt/_rels/presentation.xml.rels"]!.async("text"),
    ]);
    const parse = (xml: string) => new DOMParser().parseFromString(xml, "application/xml");
    const targets = new Map<string, string>();
    for (const rel of Array.from(parse(rels).getElementsByTagName("Relationship"))) {
      const target = (rel.getAttribute("Target") ?? "").replace(/^\/?(ppt\/)?/, "ppt/");
      targets.set(rel.getAttribute("Id") ?? "", target);
    }
    const ordered = Array.from(parse(pres).getElementsByTagName("p:sldId"))
      .map((el) => targets.get(el.getAttribute("r:id") ?? ""))
      .filter((n): n is string => !!n && n in files);
    return ordered.length ? ordered : byNumber;
  } catch {
    return byNumber;
  }
}

/** Paragraph texts of a slide's XML. */
export function textFromSlideXml(xml: string): string[] {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  return Array.from(doc.getElementsByTagName("a:p"))
    .map((p) =>
      Array.from(p.getElementsByTagName("a:t"))
        .map((t) => t.textContent ?? "")
        .join("")
        .trim(),
    )
    .filter(Boolean);
}

/** All text on a slide (the a:t runs), one line per paragraph-ish chunk. */
export function slideText(source: unknown): string[] {
  const out: string[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(walk);
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === "a:t") {
        const text = typeof value === "string" ? value : (value as { value?: string })?.value;
        if (typeof text === "string" && text.trim()) out.push(text.trim());
      } else if (key === "a:p") {
        const before = out.length;
        walk(value);
        // Join the runs of one paragraph into a line.
        if (out.length - before > 1)
          out.splice(before, out.length - before, out.slice(before).join(" "));
      } else walk(value);
    }
  };
  walk(source);
  return out;
}

/**
 * Loads `file` into `host` in single-slide mode (with the library's own arrows and page count).
 * Returns the viewer; `failedSlides` lists slides shown as text only.
 */
export async function openDeck(
  host: HTMLElement,
  file: ArrayBuffer,
  size: { width: number; height: number },
): Promise<{ viewer: Viewer; repaired: number }> {
  const { init } = await import("pptx-preview");
  const viewer = init(host, { ...size, mode: "slide" });
  const deck = (await viewer.load(file)) as unknown as Deck;
  const repaired = repairDeck(deck) + (await restoreDroppedSlides(deck));

  const render = viewer.htmlRender as unknown as Render;
  // The library fits slides to the frame's width only, so a 4:3 deck was cut off at the top
  // and bottom. Fit by height too, and centre the slide.
  const { width: deckW, height: deckH } = deck as unknown as { width?: number; height?: number };
  if (deckW && deckH && render._calcScaleAndRenderPort) {
    const fit = Math.min(size.width, (size.height * deckW) / deckH);
    if (fit < size.width - 0.5) {
      render.options.viewPort.width = fit;
      render._calcScaleAndRenderPort();
    }
  }
  const left = Math.max(0, (size.width - render.renderPort.width) / 2);
  // No black bars beside a narrower slide.
  if (left) viewer.wrapper.style.background = "transparent";

  // Draw slides one at a time; a slide that can't be drawn shows its text instead.
  const draw = render.renderSlide.bind(render);
  render.renderSlide = (index: number) => {
    try {
      draw(index);
      const el = viewer.wrapper.querySelector<HTMLElement>(`.pptx-preview-slide-wrapper-${index}`);
      if (el && left) {
        el.style.left = `${left}px`;
        el.style.margin = "0";
      }
    } catch (err) {
      console.warn("[slides] slide could not be drawn", index + 1, err);
      viewer.wrapper.querySelector(`.pptx-preview-slide-wrapper-${index}`)?.remove();
      viewer.wrapper.append(fallbackSlide(index, deck.slides[index], render, left));
    }
  };

  // The same controls pptx-preview's own preview() adds in slide mode.
  const next = viewer.renderNextButton();
  next.onclick = () => viewer.renderNextSlide();
  viewer.wrapper.append(next);
  const prev = viewer.renderPreButton();
  prev.onclick = () => viewer.renderPreSlide();
  viewer.wrapper.append(prev);
  viewer.renderPagination(viewer.wrapper);
  viewer.currentIndex = 0;
  render.renderSlide(0);
  return { viewer, repaired };
}

function fallbackSlide(
  index: number,
  slide: Slide | undefined,
  render: Render,
  left: number,
): HTMLElement {
  const { width, height } = render.renderPort;
  const el = document.createElement("div");
  el.className = `pptx-preview-slide-wrapper pptx-preview-slide-wrapper-${index}`;
  el.dataset["fallback"] = "true";
  Object.assign(el.style, {
    width: `${width}px`,
    height: `${height}px`,
    position: "absolute",
    top: `${(render.options.viewPort.height - height) / 2}px`,
    left: `${left}px`,
    margin: "0",
    background: "#fff",
    overflow: "auto",
    padding: "36px 48px",
    boxSizing: "border-box",
    font: "16px/1.5 Inter, system-ui, sans-serif",
    color: "#1f2330",
  } satisfies Partial<CSSStyleDeclaration>);
  const lines = slide?.textLines ?? slideText(slide?.source);
  const note = document.createElement("p");
  note.textContent =
    "This slide's design can't be shown here, so here is its text. For exact slides, export the deck as PDF and upload that.";
  Object.assign(note.style, { fontSize: "13px", color: "#6b6f7b", margin: "0 0 18px" });
  el.append(note);
  lines.forEach((line, i) => {
    const p = document.createElement(i === 0 ? "h3" : "p");
    p.textContent = line;
    Object.assign(
      p.style,
      i === 0 ? { fontSize: "26px", fontWeight: "700", margin: "0 0 12px" } : { margin: "0 0 8px" },
    );
    el.append(p);
  });
  if (!lines.length) {
    const p = document.createElement("p");
    p.textContent = "(No text on this slide.)";
    el.append(p);
  }
  return el;
}
