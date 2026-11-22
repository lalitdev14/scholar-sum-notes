/**
 * Opens a PowerPoint deck with pptx-preview, tolerating decks the library can't fully read.
 *
 * pptx-preview finds each slide's layout, each layout's master and each master's theme by
 * file name, and one slide that throws while loading silently drops that slide and every slide
 * after it (decks saved by LibreOffice, Google Slides, Keynote and converters often ended up as
 * text only). Here we:
 *  1. normalise the package first (`pptx-normalize.ts`) so it reads like a PowerPoint-saved deck;
 *  2. while loading, answer a failed layout/master/theme lookup with one that exists;
 *  3. re-load any slide the library still dropped on its own, leaving out the shapes it can't
 *     read if needed, and put slides back in presentation order;
 *  4. draw each slide on its own: a shape that can't be drawn is skipped, and a slide that still
 *     fails shows its text and a short note.
 * Every reason a slide or shape was dropped is logged with `console.warn("[slides] …")`.
 */
import type { init as initPreview } from "pptx-preview";
import { NotAPresentationError, normalizePptx } from "@/lib/pptx-normalize";

type Viewer = ReturnType<typeof initPreview>;

/* The library's internal objects (not in its public types). */
type Theme = { getColor?: (name: string) => string | undefined };
type Background = {
  type?: string;
  fillRect?: { l?: number; t?: number; r?: number; b?: number };
};
type Master = { name?: string; theme?: Theme; background?: Background };
type Layout = { name?: string; slideMaster?: Master; background?: Background };
type Slide = {
  name?: string;
  source?: unknown;
  slideLayout?: Layout;
  background?: Background;
  textLines?: string[];
};
type ZipFile = { async: (type: "text") => Promise<string> };
type Deck = {
  slides: Slide[];
  slideLayouts: Layout[];
  slideMaster: Master[];
  themes: Theme[];
  _zipContents?: { files: Record<string, ZipFile> };
};
/** pptx-preview's reader (the object `viewer.load` resolves with). */
type Reader = Deck & {
  _loadContentTypes: () => Promise<void>;
  getSlideLayout: (name: string) => Layout | undefined;
  getSlideMaster: (name: string) => Master | undefined;
  getTheme: (name: string) => Theme | undefined;
  getMedia: (name: string) => string | undefined;
};
type Render = {
  renderSlide: (index: number) => void;
  renderPort: { width: number; height: number };
  options: { viewPort: { width: number; height: number } };
  _calcScaleAndRenderPort?: () => void;
  _renderNode?: (node: unknown) => unknown;
};

const SLIDE_TYPE = "application/vnd.openxmlformats-officedocument.presentationml.slide+xml";
export const NOT_A_DECK_MESSAGE =
  "This file couldn't be opened as a PowerPoint deck. It may be damaged: save it again as .pptx, or upload a PDF.";

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
 * Puts the slides in presentation order and adds back, as text-only slides, any slide that
 * could not be loaded at all. Returns how many were added back.
 */
export async function restoreDroppedSlides(deck: Deck): Promise<number> {
  const files = deck._zipContents?.files;
  if (!files) return 0;
  const order = await slideOrder(files);
  const loaded = new Map((deck.slides ?? []).map((sl) => [sl.name, sl]));
  let added = 0;
  const full: Slide[] = [];
  for (const name of order) {
    const existing = loaded.get(name);
    loaded.delete(name);
    if (existing) {
      full.push(existing);
      continue;
    }
    const xml = await files[name]?.async("text").catch(() => "");
    full.push({ name, source: null, textLines: xml ? textFromSlideXml(xml) : [] });
    added++;
  }
  // Slides the library loaded that aren't in the slide list stay at the end.
  full.push(...loaded.values());
  deck.slides.splice(0, deck.slides.length, ...full);
  return added;
}

/**
 * While the library loads, a slide whose layout (or a layout whose master, or a master whose
 * theme) can't be found throws and is dropped. Answer those lookups with one that exists.
 */
function installLookupFallbacks(reader: Reader) {
  const warned = new Set<string>();
  const warnOnce = (msg: string) => {
    if (warned.has(msg)) return;
    warned.add(msg);
    console.warn(msg);
  };
  const getLayout = reader.getSlideLayout.bind(reader);
  reader.getSlideLayout = (name) => {
    const found = getLayout(name);
    guardPlaceholderLookups(found ?? reader.slideLayouts?.[0]);
    if (found) return found;
    const layouts = reader.slideLayouts ?? [];
    const fallback = layouts.find((l) => /slideLayout2\.xml$/.test(l.name ?? "")) ?? layouts[0];
    warnOnce(`[slides] layout "${name}" not found; using ${fallback?.name ?? "none"} instead`);
    return fallback;
  };
  const getMaster = reader.getSlideMaster.bind(reader);
  reader.getSlideMaster = (name) => {
    const found = getMaster(name);
    if (found) return found;
    const fallback = reader.slideMaster?.[0];
    warnOnce(`[slides] master "${name}" not found; using ${fallback?.name ?? "none"} instead`);
    return fallback;
  };
  const getTheme = reader.getTheme.bind(reader);
  reader.getTheme = (name) => {
    const found = getTheme(name);
    if (found) return found;
    warnOnce(`[slides] theme "${name}" not found; using the deck's first theme`);
    return reader.themes?.[0] ?? EMPTY_THEME;
  };
  // The library labels SVG images "image/*", which browsers won't show.
  const getMedia = reader.getMedia.bind(reader);
  reader.getMedia = (name) => {
    const media = getMedia(name);
    return media && /\.svg$/i.test(name)
      ? media.replace(/^data:image\/\*;/, "data:image/svg+xml;")
      : media;
  };
}

/**
 * A slide placeholder its layout doesn't have (common in slides copied between decks) made the
 * library read `.source` of nothing and drop the slide and every slide after it. Layout lookups
 * now return an empty node instead; every other caller already treats it as "nothing to inherit".
 */
function guardPlaceholderLookups(layout: Layout | undefined) {
  const proto = layout && (Object.getPrototypeOf(layout) as Record<PropertyKey, unknown>);
  if (!proto || proto[GUARDED]) return;
  for (const key of ["getNodeByType", "getNodeByIdx"]) {
    const lookup = proto[key];
    if (typeof lookup !== "function") continue;
    proto[key] = function (this: unknown, id: unknown) {
      return (lookup as (this: unknown, id: unknown) => unknown).call(this, id) ?? { source: {} };
    };
  }
  proto[GUARDED] = true;
}
const GUARDED = Symbol("lectureloop-guarded");

/** The last error a slide threw while loading (the library swallows it otherwise). */
let lastSlideError: unknown;
const WATCHED = Symbol("lectureloop-watched");

/** Records why a slide fails to load (wraps the library's slide class once). */
function watchSlideErrors(slide: Slide | undefined) {
  const proto = slide && (Object.getPrototypeOf(slide) as Record<PropertyKey, unknown>);
  if (!proto || proto[WATCHED] || typeof proto["load"] !== "function") return;
  const load = proto["load"] as (this: unknown) => Promise<unknown>;
  proto["load"] = async function (this: unknown) {
    try {
      return await load.call(this);
    } catch (err) {
      lastSlideError = err;
      throw err;
    }
  };
  proto[WATCHED] = true;
}

const textFile = (text: string): ZipFile => ({ async: () => Promise.resolve(text) });

/**
 * Loads one slide with the library's own loader, reusing the deck's layouts, masters, themes and
 * images. `xml` replaces the slide's XML (to leave out shapes the library can't read).
 */
async function loadOneSlide(reader: Reader, name: string, xml?: string) {
  const files = Object.create(reader._zipContents!.files) as Record<string, ZipFile>;
  // Two Overrides: with only one, the library's XML reader doesn't give it a list.
  files["[Content_Types].xml"] = textFile(
    `<Types><Override PartName="/docProps/none.xml" ContentType="application/x-none"/><Override PartName="/${name}" ContentType="${SLIDE_TYPE}"/></Types>`,
  );
  if (xml !== undefined) files[name] = textFile(xml);
  const scratch = Object.create(reader) as Reader;
  scratch._zipContents = { files };
  scratch.slides = [];
  lastSlideError = undefined;
  await reader._loadContentTypes.call(scratch);
  return scratch.slides[0];
}

/** Ways to make a slide readable, each leaving out more of what the library may choke on. */
const SIMPLER: { without: string; tags: string[] }[] = [
  { without: "charts, diagrams, tables and embedded objects", tags: ["p:graphicFrame"] },
  { without: "pictures", tags: ["p:graphicFrame", "p:pic"] },
  { without: "pictures and grouped shapes", tags: ["p:graphicFrame", "p:pic", "p:grpSp"] },
];
const SHAPES = new Set(["p:sp", "p:pic", "p:cxnSp", "p:graphicFrame", "p:grpSp"]);
const MAX_SINGLE_SHAPE_TRIES = 60;

/**
 * Simpler versions of a slide's XML to try, in order: first leaving out one shape at a time
 * (usually a single shape is the problem), then whole kinds of shapes.
 */
function* simplerSlides(xml: string): Generator<{ without: string; xml: string }> {
  const parse = () => new DOMParser().parseFromString(xml, "application/xml");
  const doc = parse();
  if (!xml || doc.getElementsByTagName("parsererror").length) return;
  const serialize = (d: Document) => new XMLSerializer().serializeToString(d);
  const tree = doc.getElementsByTagName("p:spTree")[0];
  const shapes = tree ? Array.from(tree.children).filter((el) => SHAPES.has(el.tagName)) : [];
  if (shapes.length > 1)
    for (let i = 0; i < Math.min(shapes.length, MAX_SINGLE_SHAPE_TRIES); i++) {
      const copy = parse();
      const shape = Array.from(copy.getElementsByTagName("p:spTree")[0]!.children).filter((el) =>
        SHAPES.has(el.tagName),
      )[i]!;
      const label = shape.getElementsByTagName("p:cNvPr")[0]?.getAttribute("name") ?? "";
      shape.remove();
      yield { without: `shape "${label || shape.tagName}"`, xml: serialize(copy) };
    }
  let previous = "";
  for (const step of SIMPLER) {
    const copy = parse();
    for (const tag of step.tags)
      for (const el of Array.from(copy.getElementsByTagName(tag))) el.remove();
    const simpler = serialize(copy);
    if (simpler !== previous) yield { without: step.without, xml: simpler };
    previous = simpler;
  }
}

const reason = (err: unknown) =>
  err instanceof Error ? `${err.name}: ${err.message}` : err ? String(err) : "unknown error";

/**
 * Re-loads each slide the library dropped, one at a time, so one bad slide no longer takes the
 * rest of the deck with it. Returns how many were recovered.
 */
async function recoverDroppedSlides(reader: Reader): Promise<number> {
  const files = reader._zipContents?.files;
  if (!files) return 0;
  watchSlideErrors(reader.slides[0]);
  const order = await slideOrder(files);
  const loaded = new Set(reader.slides.map((sl) => sl.name));
  const missing = order.filter((name) => !loaded.has(name));
  if (!missing.length) return 0;
  console.warn(
    `[slides] ${missing.length} of ${order.length} slides were dropped while loading; retrying each on its own`,
  );
  let recovered = 0;
  for (const name of missing) {
    const number = order.indexOf(name) + 1;
    const xml = await files[name]!.async("text").catch(() => "");
    const tryLoad = (version?: string) =>
      loadOneSlide(reader, name, version).catch((err: unknown) => {
        lastSlideError = err;
        return undefined;
      });
    let slide = await tryLoad();
    let without = "";
    if (!slide) {
      console.warn(`[slides] slide ${number} (${name}) could not be read:`, reason(lastSlideError));
      for (const version of simplerSlides(xml)) {
        slide = await tryLoad(version.xml);
        if (slide) {
          without = version.without;
          break;
        }
      }
    }
    if (slide) {
      watchSlideErrors(slide);
      reader.slides.push(slide);
      recovered++;
      if (without) console.warn(`[slides] slide ${number} is shown without its ${without}`);
    } else
      console.warn(
        `[slides] slide ${number} could not be read even with shapes left out:`,
        reason(lastSlideError),
      );
  }
  return recovered;
}

/**
 * The library sets a picture background's size without units, so the browser ignores it and the
 * picture is drawn at its own size. Sets the size it meant (the stretch rectangle).
 */
function fixBackgroundSize(el: HTMLElement, slide: Slide | undefined, render: Render) {
  const bgEl = el.querySelector<HTMLElement>(".slide-background");
  if (!bgEl || !bgEl.style.backgroundImage || bgEl.style.backgroundSize) return;
  const bg = [
    slide?.background,
    slide?.slideLayout?.background,
    slide?.slideLayout?.slideMaster?.background,
  ].find((b) => b && b.type && b.type !== "none");
  const { l = 0, t = 0, r = 0, b = 0 } = bg?.fillRect ?? {};
  const { width, height } = render.renderPort;
  bgEl.style.backgroundSize = `${width * (1 - l - r)}px ${height * (1 - t - b)}px`;
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
 * Returns the viewer and how many slides needed repair.
 */
export async function openDeck(
  host: HTMLElement,
  file: ArrayBuffer,
  size: { width: number; height: number },
): Promise<{ viewer: Viewer; repaired: number }> {
  let data = file;
  try {
    const normalized = await normalizePptx(file);
    data = normalized.data;
    if (normalized.fixes.length)
      console.warn(
        `[slides] deck package fixed before drawing (${normalized.fixes.length}):\n  ${normalized.fixes.join("\n  ")}`,
      );
  } catch (err) {
    if (err instanceof NotAPresentationError) throw new Error(NOT_A_DECK_MESSAGE);
    console.warn("[slides] could not normalise the deck; drawing it as it is", err);
  }

  const { init } = await import("pptx-preview");
  const viewer = init(host, { ...size, mode: "slide" });
  const loading = viewer.load(data);
  // The reader exists as soon as load() starts; patch its lookups before slides are read.
  const reader = (viewer as unknown as { pptx: Reader }).pptx;
  installLookupFallbacks(reader);
  let deck: Deck;
  try {
    deck = (await loading) as unknown as Deck;
  } catch (err) {
    console.warn("[slides] the deck could not be loaded", err);
    throw new Error(NOT_A_DECK_MESSAGE);
  }
  const recovered = await recoverDroppedSlides(reader);
  const repaired = recovered + repairDeck(deck) + (await restoreDroppedSlides(deck));
  if (!deck.slides.length) throw new Error("This deck has no slides to show.");

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

  // A shape that can't be drawn is skipped instead of losing the whole slide.
  let drawing = 0;
  const renderNode = render._renderNode?.bind(render);
  if (renderNode)
    render._renderNode = (node: unknown) => {
      try {
        return renderNode(node);
      } catch (err) {
        console.warn(`[slides] slide ${drawing + 1}: a shape could not be drawn`, reason(err));
        return undefined;
      }
    };

  // Draw slides one at a time; a slide that can't be drawn shows its text instead.
  const draw = render.renderSlide.bind(render);
  render.renderSlide = (index: number) => {
    drawing = index;
    const slide = deck.slides[index];
    try {
      if (!slide?.source) throw new Error("the slide could not be read when the deck loaded");
      draw(index);
      const el = viewer.wrapper.querySelector<HTMLElement>(`.pptx-preview-slide-wrapper-${index}`);
      if (el) {
        fixBackgroundSize(el, slide, render);
        if (left) {
          el.style.left = `${left}px`;
          el.style.margin = "0";
        }
      }
    } catch (err) {
      console.warn(`[slides] slide ${index + 1} is shown as text only:`, reason(err));
      viewer.wrapper.querySelector(`.pptx-preview-slide-wrapper-${index}`)?.remove();
      viewer.wrapper.append(fallbackSlide(index, slide, render, left));
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
