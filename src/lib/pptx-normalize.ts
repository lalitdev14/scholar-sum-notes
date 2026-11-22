/**
 * Rewrites a .pptx package so pptx-preview reads it the way it reads a deck saved by PowerPoint.
 *
 * pptx-preview is strict about the package layout:
 *  - it finds slides, layouts, masters and themes only through `[Content_Types].xml` Override
 *    entries, and an Override for a part that isn't in the zip stops the whole deck loading;
 *  - it resolves relationship targets with `Target.replace("../", "ppt/")`, so `/ppt/...`,
 *    `./...`, `../../...` or targets outside `ppt/` don't resolve;
 *  - it expects canonical part names (`ppt/slides/slideN.xml`, images in `ppt/media/image*`);
 *  - one slide whose layout can't be found, or a picture whose relationship is missing, throws and
 *    the library silently drops that slide and every slide after it;
 *  - it ignores `mc:AlternateContent` (PowerPoint/LibreOffice equations and OLE objects keep their
 *    picture in `mc:Fallback`), a missing `p:defaultTextStyle` stops every master's shapes from
 *    loading, and `p:bgRef` backgrounds on slides/layouts are ignored.
 *
 * Everything here works on the raw XML strings so parts we don't touch stay byte-for-byte the
 * same. Every fix is reported in `fixes` (logged by the caller).
 */
import JSZip from "jszip";

const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/";
const STRICT_REL = "http://purl.oclc.org/ooxml/officeDocument/relationships/";
const PML = "application/vnd.openxmlformats-officedocument.presentationml.";

type Kind =
  | "presentation"
  | "slide"
  | "slideLayout"
  | "slideMaster"
  | "theme"
  | "notesSlide"
  | "notesMaster"
  | "handoutMaster"
  | "tableStyles"
  | "presProps"
  | "viewProps"
  | "chart"
  | "diagramData"
  | "diagramLayout"
  | "diagramStyle"
  | "diagramColors"
  | "diagramDrawing"
  | "core"
  | "app";

const CONTENT_TYPE: Record<Kind, string> = {
  presentation: `${PML}presentation.main+xml`,
  slide: `${PML}slide+xml`,
  slideLayout: `${PML}slideLayout+xml`,
  slideMaster: `${PML}slideMaster+xml`,
  theme: "application/vnd.openxmlformats-officedocument.theme+xml",
  notesSlide: `${PML}notesSlide+xml`,
  notesMaster: `${PML}notesMaster+xml`,
  handoutMaster: `${PML}handoutMaster+xml`,
  tableStyles: `${PML}tableStyles+xml`,
  presProps: `${PML}presProps+xml`,
  viewProps: `${PML}viewProps+xml`,
  chart: "application/vnd.openxmlformats-officedocument.drawingml.chart+xml",
  diagramData: "application/vnd.openxmlformats-officedocument.drawingml.diagramData+xml",
  diagramLayout: "application/vnd.openxmlformats-officedocument.drawingml.diagramLayout+xml",
  diagramStyle: "application/vnd.openxmlformats-officedocument.drawingml.diagramStyle+xml",
  diagramColors: "application/vnd.openxmlformats-officedocument.drawingml.diagramColors+xml",
  diagramDrawing: "application/vnd.ms-office.drawingml.diagramDrawing+xml",
  core: "application/vnd.openxmlformats-package.core-properties+xml",
  app: "application/vnd.openxmlformats-officedocument.extended-properties+xml",
};

/** Relationship type (last URI segment) → part kind. */
const REL_KIND: Record<string, Kind> = {
  officeDocument: "presentation",
  slide: "slide",
  slideLayout: "slideLayout",
  slideMaster: "slideMaster",
  theme: "theme",
  notesSlide: "notesSlide",
  notesMaster: "notesMaster",
  handoutMaster: "handoutMaster",
  tableStyles: "tableStyles",
  presProps: "presProps",
  viewProps: "viewProps",
  chart: "chart",
  diagramData: "diagramData",
  diagramLayout: "diagramLayout",
  diagramQuickStyle: "diagramStyle",
  diagramColors: "diagramColors",
  diagramDrawing: "diagramDrawing",
  "core-properties": "core",
  "extended-properties": "app",
};

/** Parts the library looks up by exact canonical name. */
const CANONICAL: Partial<Record<Kind, { re: RegExp; make: (n: number) => string }>> = {
  slide: { re: /^ppt\/slides\/slide\d+\.xml$/, make: (n) => `ppt/slides/slide${n}.xml` },
  slideLayout: {
    re: /^ppt\/slideLayouts\/slideLayout\d+\.xml$/,
    make: (n) => `ppt/slideLayouts/slideLayout${n}.xml`,
  },
  slideMaster: {
    re: /^ppt\/slideMasters\/slideMaster\d+\.xml$/,
    make: (n) => `ppt/slideMasters/slideMaster${n}.xml`,
  },
  theme: { re: /^ppt\/theme\/theme\d+\.xml$/, make: (n) => `ppt/theme/theme${n}.xml` },
};

const IMAGE_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  bmp: "image/bmp",
  svg: "image/svg+xml",
  tif: "image/tiff",
  tiff: "image/tiff",
  emf: "image/x-emf",
  wmf: "image/x-wmf",
  wdp: "image/vnd.ms-photo",
  webp: "image/webp",
};
const OTHER_MIME: Record<string, string> = {
  xml: "application/xml",
  rels: "application/vnd.openxmlformats-package.relationships+xml",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  bin: "application/vnd.openxmlformats-officedocument.oleObject",
  mp4: "video/mp4",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  fntdata: "application/x-fontdata",
};

type Rel = { id: string; type: string; target: string; external: boolean };

export type NormalizeResult = {
  data: ArrayBuffer;
  /** Human-readable list of what was fixed (empty when the deck was already fine). */
  fixes: string[];
};

/** Thrown for files that aren't a readable PowerPoint package. */
export class NotAPresentationError extends Error {}

const decodeXml = (s: string) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
const encodeXml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g))
    out[m[1]!] = decodeXml(m[2] ?? m[3] ?? "");
  return out;
}

const dirOf = (p: string) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");
const baseOf = (p: string) => p.slice(p.lastIndexOf("/") + 1);
const extOf = (p: string) => (/\.([^./]+)$/.exec(p)?.[1] ?? "").toLowerCase();

/** `ppt/slides/_rels/slide1.xml.rels` → `ppt/slides/slide1.xml`; `_rels/.rels` → "". */
function ownerOfRels(rels: string): string {
  const dir = dirOf(rels); // ".../_rels"
  const parent = dirOf(dir);
  const name = baseOf(rels).replace(/\.rels$/i, "");
  return parent ? `${parent}/${name}` : name;
}
const relsOf = (part: string) =>
  part ? `${dirOf(part) ? dirOf(part) + "/" : ""}_rels/${baseOf(part)}.rels` : "_rels/.rels";

/** Resolves a relationship target against the folder of the part that owns it. */
export function resolveTarget(ownerDir: string, target: string): string {
  let t = target.trim().replace(/\\/g, "/");
  try {
    t = decodeURI(t);
  } catch {
    /* keep as written */
  }
  const parts = t.startsWith("/") || !ownerDir ? [] : ownerDir.split("/");
  for (const seg of t.split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") parts.pop();
    else parts.push(seg);
  }
  return parts.join("/");
}

/** Relative path from folder `fromDir` to `to` (e.g. `ppt/slides` → `../media/image1.png`). */
export function relativeTarget(fromDir: string, to: string): string {
  const from = fromDir ? fromDir.split("/") : [];
  const dest = to.split("/");
  let i = 0;
  while (i < from.length && i < dest.length - 1 && from[i] === dest[i]) i++;
  return [...Array<string>(from.length - i).fill(".."), ...dest.slice(i)].join("/");
}

function parseRels(xml: string): Rel[] {
  return Array.from(xml.matchAll(/<(?:\w+:)?Relationship\b([^>]*?)\/?>/g)).map((m) => {
    const a = attrs(m[1]!);
    let type = a["Type"] ?? "";
    if (type.startsWith(STRICT_REL)) type = REL + type.slice(STRICT_REL.length);
    return {
      id: a["Id"] ?? "",
      type,
      target: a["Target"] ?? "",
      external: (a["TargetMode"] ?? "").toLowerCase() === "external",
    };
  });
}

function writeRels(rels: Rel[]): string {
  const items = rels
    .map(
      (r) =>
        `<Relationship Id="${encodeXml(r.id)}" Type="${encodeXml(r.type)}" Target="${encodeXml(
          r.target,
        )}"${r.external ? ' TargetMode="External"' : ""}/>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${items}</Relationships>`;
}

const relKind = (type: string): Kind | undefined => REL_KIND[type.split("/").pop() ?? ""];

/**
 * Whitespace between tags becomes stray text nodes in pptx-preview's own XML parser (an element
 * holding only whitespace even turns into a string). Drops it, except inside text runs.
 */
export function stripInterTagWhitespace(xml: string): string {
  return xml.replace(/(<[^>]+>)(\s+)(?=<)/g, (m, tag: string) =>
    /^<(?:\w+:)?t[\s>]/.test(tag) ? m : tag,
  );
}

/** Plain text of an OMML equation (used only when an equation has no picture fallback). */
function ommlText(xml: string): string {
  return Array.from(xml.matchAll(/<m:t\b[^>]*>([^<]*)<\/m:t>/g))
    .map((m) => decodeXml(m[1]!))
    .join("");
}

/** OMML equations (`a14:m`), which the library can't draw, as plain text runs. */
export function equationsToText(xml: string): { xml: string; count: number } {
  let count = 0;
  const out = xml.replace(
    /<a14:m\b[^>]*>([\s\S]*?)<\/a14:m>/g,
    (_all, math: string) => (count++, `<a:r><a:t>${encodeXml(ommlText(math))}</a:t></a:r>`),
  );
  return { xml: out, count };
}

/**
 * Replaces `mc:AlternateContent` with its `mc:Fallback` (the picture PowerPoint and LibreOffice
 * save next to equations, OLE objects and newer shape types). Without a fallback, the choice is
 * kept and any equation in it becomes a plain text run.
 */
export function resolveAlternateContent(xml: string): {
  xml: string;
  count: number;
  shapes: number;
} {
  let count = 0;
  let shapes = 0;
  const re =
    /<mc:AlternateContent\b[^>]*>((?:(?!<mc:AlternateContent\b)[\s\S])*?)<\/mc:AlternateContent>/;
  let out = xml;
  for (let guard = 0; guard < 2000; guard++) {
    const m = re.exec(out);
    if (!m) break;
    const inner = m[1]!;
    const fallback = /<mc:Fallback\b[^>]*>([\s\S]*?)<\/mc:Fallback>/.exec(inner)?.[1];
    let replacement: string;
    if (fallback !== undefined && fallback.trim()) replacement = fallback;
    else {
      const choice = /<mc:Choice\b[^>]*>([\s\S]*?)<\/mc:Choice>/.exec(inner)?.[1] ?? "";
      replacement = equationsToText(choice).xml;
    }
    out = out.slice(0, m.index) + replacement + out.slice(m.index + m[0].length);
    count++;
    if (/<p:(sp|pic|graphicFrame|grpSp|oleObj)\b/.test(replacement)) shapes++;
  }
  return { xml: out, count, shapes };
}

/**
 * An embedded OLE object (MathType/Equation Editor formulas, embedded sheets) is a graphic frame
 * the library ignores; PowerPoint stores a preview picture inside it. Turns the frame into that
 * picture when the browser can show the image format.
 */
function oleFramesToPictures(
  xml: string,
  imageTarget: (rId: string) => string | undefined,
): { xml: string; count: number } {
  let count = 0;
  const out = xml.replace(/<p:graphicFrame\b[\s\S]*?<\/p:graphicFrame>/g, (frame) => {
    if (!frame.includes("/presentationml/2006/ole")) return frame;
    const pic = /<p:pic\b[\s\S]*?<\/p:pic>/.exec(frame)?.[0];
    const xfrm = /<p:xfrm\b[^>]*>([\s\S]*?)<\/p:xfrm>/.exec(frame);
    const rId = pic && /<a:blip\b[^>]*\br:embed="([^"]*)"/.exec(pic)?.[1];
    const target = rId ? imageTarget(rId) : undefined;
    if (!pic || !xfrm || !target || !/^(png|jpe?g|gif|bmp|svg|webp)$/.test(extOf(target)))
      return frame;
    count++;
    const spXfrm = `<a:xfrm${xfrm[0].slice("<p:xfrm".length, xfrm[0].indexOf(">"))}>${xfrm[1]}</a:xfrm>`;
    if (/<a:xfrm\b[\s\S]*?<\/a:xfrm>/.test(pic))
      return pic.replace(/<a:xfrm\b[\s\S]*?<\/a:xfrm>/, spXfrm);
    if (/<p:spPr\s*\/>/.test(pic))
      return pic.replace(/<p:spPr\s*\/>/, `<p:spPr>${spXfrm}</p:spPr>`);
    return pic.replace(/<p:spPr\b[^>]*>/, (open) => open + spXfrm);
  });
  return { xml: out, count };
}

/** `p:bgRef` (theme background) on a slide/layout → a solid fill of the colour it names. */
function bgRefToFill(xml: string): { xml: string; count: number } {
  let count = 0;
  const out = xml.replace(
    /<p:bgRef\b[^>]*>([\s\S]*?)<\/p:bgRef>/,
    (_m, color: string) => (
      count++,
      `<p:bgPr><a:solidFill>${color}</a:solidFill><a:effectLst/></p:bgPr>`
    ),
  );
  return { xml: out, count };
}

/**
 * The library draws a layout/master shape only when it is flagged `userDrawn="1"`, which
 * PowerPoint writes for decorations (logos, bars) but LibreOffice and other tools don't.
 * Flags every non-placeholder shape on a layout or master.
 */
function markUserDrawn(xml: string): { xml: string; count: number } {
  let count = 0;
  const out = xml.replace(/<p:sp\b[\s\S]*?<\/p:sp>/g, (sp) => {
    if (/<p:ph\b/.test(sp) || /\buserDrawn=/.test(sp)) return sp;
    const marked = sp.replace(/<p:nvPr\b([^>]*?)(\/?)>/, '<p:nvPr$1 userDrawn="1"$2>');
    if (marked !== sp) count++;
    return marked;
  });
  return { xml: out, count };
}

type Placeholder = { type: string; idx: string | undefined; xfrm: string | undefined };

/** Placeholders (type, idx, position) on a slide, layout or master. */
function placeholders(xml: string): Placeholder[] {
  return Array.from(xml.matchAll(/<p:sp\b[\s\S]*?<\/p:sp>/g)).flatMap(([sp]) => {
    const ph = /<p:ph\b([^>]*)>/.exec(sp);
    if (!ph) return [];
    const a = attrs(ph[1]!);
    const type = a["type"] === "obj" || !a["type"] ? "body" : a["type"];
    const xfrm = /<p:spPr\b[^>]*>[\s\S]*?(<a:xfrm\b[\s\S]*?<\/a:xfrm>)/.exec(sp)?.[1];
    return [{ type, idx: a["idx"], xfrm }];
  });
}

/**
 * A slide placeholder without its own position takes it from the layout placeholder with the
 * same idx. When the layout has none (slides copied between decks), PowerPoint places it like
 * the layout's or master's placeholder of the same type; copy that position onto the slide.
 */
function placeOrphanPlaceholders(
  xml: string,
  layoutXml: string,
  masterXml: string,
): { xml: string; count: number } {
  const layoutPh = placeholders(layoutXml);
  const masterPh = placeholders(masterXml);
  let count = 0;
  const out = xml.replace(/<p:sp\b[\s\S]*?<\/p:sp>/g, (sp) => {
    const [ph] = placeholders(sp);
    if (!ph || ph.xfrm) return sp;
    if (ph.idx ? layoutPh.some((p) => p.idx === ph.idx) : layoutPh.some((p) => p.type === ph.type))
      return sp;
    const sameType = (p: Placeholder) => p.type === ph.type && p.xfrm;
    const xfrm = (layoutPh.find(sameType) ?? masterPh.find(sameType))?.xfrm;
    if (!xfrm) return sp;
    count++;
    if (/<p:spPr\s*\/>/.test(sp)) return sp.replace(/<p:spPr\s*\/>/, `<p:spPr>${xfrm}</p:spPr>`);
    return sp.replace(/<p:spPr\b[^>]*>/, (open) => open + xfrm);
  });
  return { xml: out, count };
}

/** Removes pictures whose image relationship is missing (they make the library drop the slide). */
function dropBrokenPictures(xml: string, okIds: Set<string>): { xml: string; count: number } {
  let count = 0;
  const out = xml.replace(/<p:pic\b[\s\S]*?<\/p:pic>/g, (pic) => {
    const blip = /<p:blipFill\b[\s\S]*?<a:blip\b([^>]*)>/.exec(pic)?.[1] ?? "";
    const id = /\br:embed="([^"]*)"/.exec(blip)?.[1];
    if (id && okIds.has(id)) return pic;
    count++;
    return "";
  });
  return { xml: out, count };
}

/** Normalises `buf` (a .pptx). Throws NotAPresentationError for non-PowerPoint files. */
export async function normalizePptx(buf: ArrayBuffer): Promise<NormalizeResult> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buf);
  } catch {
    throw new NotAPresentationError("not a zip");
  }
  // What was fixed, grouped: category → the parts it applied to.
  const notes = new Map<string, string[]>();
  const fix = (category: string, detail = "") => {
    const list = notes.get(category) ?? [];
    if (detail && !list.includes(detail)) list.push(detail);
    notes.set(category, list);
  };
  const names = Object.keys(zip.files).filter(
    (n) => !zip.files[n]!.dir && !n.startsWith("__MACOSX/"),
  );
  const lower = new Map(names.map((n) => [n.toLowerCase(), n]));
  /** The zip entry a path refers to (exact, else case-insensitive). */
  const find = (p: string) =>
    zip.files[p] && !zip.files[p]!.dir ? p : lower.get(p.replace(/^\//, "").toLowerCase());
  const read = async (p: string) => (await zip.file(p)?.async("string")) ?? "";

  // --- Content types and relationships as written ---------------------------------------
  const ctName = find("[Content_Types].xml");
  const ctXml = ctName ? await read(ctName) : "";
  const defaults = new Map<string, string>();
  const overrides = new Map<string, string>(); // zip path → content type
  for (const m of ctXml.matchAll(/<(?:\w+:)?(Default|Override)\b([^>]*?)\/?>/g)) {
    const a = attrs(m[2]!);
    if (m[1] === "Default" && a["Extension"])
      defaults.set(a["Extension"].toLowerCase(), a["ContentType"] ?? "");
    else if (m[1] === "Override" && a["PartName"]) {
      const real = find(decodeURI(a["PartName"]));
      if (real) overrides.set(real, a["ContentType"] ?? "");
      else fix("content type listed for a missing part (dropped)", a["PartName"]);
    }
  }

  const relsFiles = names.filter((n) => /(^|\/)_rels\/[^/]*\.rels$/i.test(n));
  const relsByOwner = new Map<string, Rel[]>();
  for (const rf of relsFiles) relsByOwner.set(ownerOfRels(rf), parseRels(await read(rf)));

  // --- What kind of part is each file? --------------------------------------------------
  const kind = new Map<string, Kind>();
  const typeKinds = new Map(
    (Object.entries(CONTENT_TYPE) as [Kind, string][]).map(([k, v]) => [v, k]),
  );
  for (const [p, ct] of overrides) {
    const k =
      typeKinds.get(ct) ??
      (/presentation(ml)?\..*main\+xml$/.test(ct) ? "presentation" : undefined);
    if (k) kind.set(p, k);
  }
  // Relationship types are the most reliable signal (they're what PowerPoint itself follows).
  const targetOf = new Map<string, Map<string, string>>(); // owner → rId → resolved zip path
  for (const [owner, rels] of relsByOwner) {
    const ids = new Map<string, string>();
    for (const r of rels) {
      if (r.external) continue;
      const real = find(resolveTarget(dirOf(owner), r.target));
      if (!real) continue;
      ids.set(r.id, real);
      const k = relKind(r.type);
      if (k) kind.set(real, k);
    }
    targetOf.set(owner, ids);
  }
  for (const n of names) {
    if (kind.has(n)) continue;
    for (const [k, c] of Object.entries(CANONICAL) as [Kind, { re: RegExp }][])
      if (c.re.test(n)) kind.set(n, k);
    if (n === "ppt/presentation.xml") kind.set(n, "presentation");
  }

  const presentation = [...kind].find(([, k]) => k === "presentation")?.[0];
  if (!presentation) throw new NotAPresentationError("no presentation part");

  // --- Canonical names ------------------------------------------------------------------
  const rename = new Map<string, string>();
  if (presentation !== "ppt/presentation.xml") rename.set(presentation, "ppt/presentation.xml");
  for (const [k, c] of Object.entries(CANONICAL) as [
    Kind,
    { re: RegExp; make: (n: number) => string },
  ][]) {
    const taken = new Set(names.filter((n) => c.re.test(n)));
    let next = 1;
    const todo = [...kind]
      .filter(([p, pk]) => pk === k && !c.re.test(p))
      .map(([p]) => p)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    for (const p of todo) {
      while (taken.has(c.make(next)) || find(c.make(next))) next++;
      const to = c.make(next++);
      taken.add(to);
      rename.set(p, to);
    }
  }
  // Images: the library only loads `ppt/media/image*` files, and picks the MIME type from a
  // lower-case extension.
  let mediaNo = 1;
  for (const [owner, rels] of relsByOwner)
    for (const r of rels) {
      if (r.external || !/\/image$/.test(r.type)) continue;
      const real = targetOf.get(owner)?.get(r.id);
      if (!real || rename.has(real)) continue;
      const ext = extOf(real);
      if (/^ppt\/media\/image[^/]*$/.test(real) && real.endsWith(`.${ext}`)) continue;
      let to: string;
      do to = `ppt/media/image-n${mediaNo++}.${ext || "png"}`;
      while (find(to));
      rename.set(real, to);
    }
  for (const [from, to] of rename) fix("renamed to the standard part name", `${from} → ${to}`);
  const newName = (p: string) => rename.get(p) ?? p;

  // --- Rewrite relationships with library-friendly targets --------------------------------
  const finalKind = new Map<string, Kind>();
  for (const [p, k] of kind) finalKind.set(newName(p), k);
  const partsOf = (k: Kind) =>
    [...finalKind]
      .filter(([, pk]) => pk === k)
      .map(([p]) => p)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const layouts = partsOf("slideLayout");
  const masters = partsOf("slideMaster");
  const themes = partsOf("theme");

  const newRels = new Map<string, Rel[]>(); // new owner path → rels
  for (const [owner, rels] of relsByOwner) {
    if (owner && !find(owner)) continue; // rels of a part that isn't there
    const nOwner = newName(owner);
    const out: Rel[] = [];
    for (const r of rels) {
      if (r.external) {
        out.push(r);
        continue;
      }
      const real = targetOf.get(owner)?.get(r.id);
      const target = relativeTarget(
        dirOf(nOwner),
        real ? newName(real) : resolveTarget(dirOf(owner), r.target),
      );
      if (target !== r.target && real)
        fix("relationship target rewritten", `${r.target} → ${target}`);
      out.push({ ...r, target });
    }
    newRels.set(nOwner, out);
  }
  const theme0 =
    (newRels.get("ppt/presentation.xml") ?? [])
      .filter((r) => relKind(r.type) === "theme")
      .map((r) => resolveTarget("ppt", r.target))[0] ?? themes[0];
  const preferredLayout =
    layouts.find((l) => l === "ppt/slideLayouts/slideLayout2.xml") ?? layouts[0];
  const ensureLink = (part: string, k: Kind, to: string | undefined) => {
    if (!to) return;
    const rels = newRels.get(part) ?? [];
    const has = rels.some(
      (r) => relKind(r.type) === k && finalKind.get(resolveTarget(dirOf(part), r.target)) === k,
    );
    if (has) return;
    const kept = rels.filter((r) => relKind(r.type) !== k);
    let n = rels.length + 1;
    while (kept.some((r) => r.id === `rId${n}`)) n++;
    kept.push({
      id: `rId${n}`,
      type: REL + k,
      target: relativeTarget(dirOf(part), to),
      external: false,
    });
    newRels.set(part, kept);
    fix(`added missing ${k} link`, `${part} → ${to}`);
  };
  for (const s of partsOf("slide")) ensureLink(s, "slideLayout", preferredLayout);
  for (const l of layouts) ensureLink(l, "slideMaster", masters[0]);
  for (const m of masters) ensureLink(m, "theme", theme0);

  // --- Rebuild the zip ---------------------------------------------------------------
  const out = new JSZip();
  const texts = new Map<string, string>(); // new path → rewritten text
  const sourceName = new Map([...rename].map(([from, to]) => [to, from]));
  /** The (original) XML of the part a slide/layout links to with relationship kind `k`. */
  const linked = async (part: string, k: Kind) => {
    const r = (newRels.get(part) ?? []).find((x) => !x.external && relKind(x.type) === k);
    if (!r) return { path: "", xml: "" };
    const path = resolveTarget(dirOf(part), r.target);
    return { path, xml: await read(sourceName.get(path) ?? path) };
  };
  for (const n of names) {
    if (n === ctName || relsFiles.includes(n)) continue;
    const to = newName(n);
    const k = finalKind.get(to);
    if (k === "slide" || k === "slideLayout" || k === "slideMaster") {
      const rels = newRels.get(to) ?? [];
      const imageTarget = (id: string) => {
        const r = rels.find((x) => x.id === id && !x.external);
        return r ? resolveTarget(dirOf(to), r.target) : undefined;
      };
      // Relationship types the library keeps for pictures on this kind of part.
      const okTypes =
        k === "slide"
          ? /\/(image|audio|media|video|diagramLayout|diagramData|diagramDrawing|diagramColors|chart)$/
          : /\/(image|audio|media|video)$/;
      const okIds = new Set(
        rels.filter((r) => !r.external && okTypes.test(r.type)).map((r) => r.id),
      );
      let xml = stripInterTagWhitespace(await read(n));
      const ac = resolveAlternateContent(xml);
      const math = equationsToText(ac.xml);
      const ole = oleFramesToPictures(math.xml, imageTarget);
      const bg = k === "slideMaster" ? { xml: ole.xml, count: 0 } : bgRefToFill(ole.xml);
      const pics = dropBrokenPictures(bg.xml, okIds);
      xml = pics.xml;
      if (k !== "slide") {
        const drawn = markUserDrawn(xml);
        xml = drawn.xml;
        if (drawn.count) fix("layout/master decoration flagged so it is drawn", to);
      }
      if (k === "slide" && /<p:ph\b/.test(xml)) {
        const layout = await linked(to, "slideLayout");
        const master = layout.path ? await linked(layout.path, "slideMaster") : { xml: "" };
        const placed = placeOrphanPlaceholders(xml, layout.xml, master.xml);
        xml = placed.xml;
        if (placed.count) fix("placeholder missing from its layout placed like the master's", to);
      }
      if (ac.shapes) fix("equation/object shown as its saved fallback picture", to);
      if (math.count) fix("equation without a picture shown as text", to);
      if (ole.count) fix("embedded object shown as its preview picture", to);
      if (bg.count) fix("theme background reference drawn as a solid fill", to);
      if (pics.count) fix("picture with a missing image removed", to);
      texts.set(to, xml);
    } else if (k === "presentation") {
      let xml = stripInterTagWhitespace(await read(n));
      if (!/<p:sldSz\b/.test(xml)) {
        const at = xml.search(/<p:notesSz\b|<\/p:presentation>/);
        xml = `${xml.slice(0, at)}<p:sldSz cx="9144000" cy="6858000"/>${xml.slice(at)}`;
        fix("added missing slide size (4:3)");
      }
      if (!/<p:defaultTextStyle\b/.test(xml)) {
        const at = xml.search(/<p:modifyVerifier\b|<p:extLst\b|<\/p:presentation>/);
        xml = `${xml.slice(0, at)}<p:defaultTextStyle/>${xml.slice(at)}`;
        fix("added empty default text style (masters' shapes failed to load without it)");
      }
      texts.set(to, xml);
    } else if (k === "theme") {
      texts.set(to, stripInterTagWhitespace(await read(n)));
    }
    const text = texts.get(to);
    if (text !== undefined) out.file(to, text);
    else out.file(to, await zip.file(n)!.async("uint8array"));
  }
  for (const [owner, rels] of newRels) out.file(relsOf(owner), writeRels(rels));

  // --- [Content_Types].xml listing every part ------------------------------------------------
  const finalNames = Object.keys(out.files).filter((n) => !out.files[n]!.dir);
  for (const n of finalNames) {
    const ext = extOf(n);
    if (ext && !defaults.has(ext)) {
      const mime = IMAGE_MIME[ext] ?? OTHER_MIME[ext];
      if (mime) defaults.set(ext, mime);
    }
  }
  defaults.set("rels", OTHER_MIME["rels"]!);
  if (!defaults.has("xml")) defaults.set("xml", "application/xml");
  const slideOrder = presentationSlideOrder(
    texts.get("ppt/presentation.xml") ?? "",
    newRels.get("ppt/presentation.xml") ?? [],
  );
  const finalOverrides = new Map<string, string>();
  for (const [p, ct] of overrides) {
    const to = newName(p);
    if (!finalKind.has(to)) finalOverrides.set(to, ct);
  }
  const original = new Map([...rename].map(([from, to]) => [to, from]));
  for (const [p, k] of finalKind) {
    if (!out.files[p]) continue;
    if (k === "slide" && slideOrder.length && !slideOrder.includes(p)) {
      // A leftover slide part that isn't in the deck's slide list (PowerPoint doesn't show it).
      fix("slide part not in the slide list (not shown)", p);
      continue;
    }
    const before = overrides.get(original.get(p) ?? p);
    const ct = k === "presentation" ? before || CONTENT_TYPE[k] : CONTENT_TYPE[k];
    if (before !== ct) fix("content type added or fixed", p);
    finalOverrides.set(p, ct);
  }
  const rank = (p: string) => {
    const i = slideOrder.indexOf(p);
    return i < 0 ? slideOrder.length : i;
  };
  const ordered = [...finalOverrides].sort(
    ([a], [b]) => rank(a) - rank(b) || a.localeCompare(b, undefined, { numeric: true }),
  );
  const ct =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    [...defaults]
      .map(([e, t]) => `<Default Extension="${encodeXml(e)}" ContentType="${encodeXml(t)}"/>`)
      .join("") +
    ordered
      .map(([p, t]) => `<Override PartName="/${encodeXml(p)}" ContentType="${encodeXml(t)}"/>`)
      .join("") +
    `</Types>`;
  out.file("[Content_Types].xml", ct);

  const data = await out.generateAsync({ type: "arraybuffer", compression: "STORE" });
  const fixes = [...notes].map(([category, list]) =>
    list.length
      ? `${category} (${list.length}): ${list.slice(0, 3).join(", ")}${list.length > 3 ? ", …" : ""}`
      : category,
  );
  return { data, fixes };
}

/** Slide part names in presentation order, from presentation.xml and its rels. */
function presentationSlideOrder(xml: string, rels: Rel[]): string[] {
  const byId = new Map(rels.map((r) => [r.id, resolveTarget("ppt", r.target)]));
  return Array.from(xml.matchAll(/<p:sldId\b([^>]*?)\/?>/g))
    .map((m) => byId.get(attrs(m[1]!)["r:id"] ?? ""))
    .filter((p): p is string => !!p);
}
