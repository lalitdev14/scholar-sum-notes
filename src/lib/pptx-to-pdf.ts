/**
 * Exact PDF copies of PowerPoint decks, made by PDF Studio's converter (LibreOffice).
 *
 * A deck at `<uid>/<classId>/<uuid>.pptx` gets its copy at `<uid>/<classId>/<uuid>.converted.pdf`
 * in the same `lecture-slides` bucket (the student's own folder). The slide viewer shows the copy
 * when it exists, so slides look exactly like the original and "Write on slide" works.
 *
 * The deck is sent once to the converter; the result is downloaded straight away (it expires on
 * the converter after an hour), checked (a real PDF with one page per slide, so slide numbers and
 * bookmarks stay 1:1) and saved. Any failure resolves to `null` with a `console.warn("[slides] …")`
 * and the next open tries again. Only one conversion per deck runs at a time (per tab, and across
 * tabs through a short-lived marker in localStorage).
 */
import { supabase } from "@/integrations/supabase/client";
import { pdfCopyPath } from "@/lib/slide-copy-path";

export { pdfCopyPath };

const BUCKET = "lecture-slides";

/** PDF Studio's API (its CORS allows the LectureLoop sites). Override with VITE_PDF_CONVERTER_URL. */
export const PDF_CONVERTER_URL = (
  (import.meta.env["VITE_PDF_CONVERTER_URL"] as string | undefined) ||
  "https://pdf-studio-api-xy4g.onrender.com"
).replace(/\/+$/, "");

/** How long one conversion may take overall (the free server can need a minute to wake up). */
const TIMEOUT_MS = 4 * 60 * 1000;
const POLL_MS = 1500;
/** A marker older than this is treated as left over from a closed tab. */
const MARKER_TTL_MS = TIMEOUT_MS + 30 * 1000;

/** The PDF copy of a deck, or null when it has none (yet). Never throws. */
export async function downloadPdfCopy(deckPath: string): Promise<Blob | null> {
  try {
    const { data, error } = await supabase.storage.from(BUCKET).download(pdfCopyPath(deckPath));
    if (error || !data || !data.size) return null;
    return (await isPdf(data)) ? new Blob([data], { type: "application/pdf" }) : null;
  } catch {
    return null;
  }
}

const running = new Map<string, Promise<Blob | null>>();
/** Decks deleted while their copy was being made: the copy is not saved. */
const deleted = new Set<string>();

/** Call when a deck is deleted, so a conversion still running doesn't save a copy afterwards. */
export function forgetDeck(deckPath: string) {
  if (running.has(deckPath)) deleted.add(deckPath);
}

/** True while this tab is converting the deck. */
export function isConvertingDeck(deckPath: string): boolean {
  return running.has(deckPath);
}

/**
 * Makes (or waits for) the PDF copy of a deck and resolves with it, or with null if it couldn't
 * be made. `deck` is the .pptx itself (e.g. the file just uploaded, or the bytes the viewer
 * downloaded). Calls for a deck that is already being converted share that conversion.
 */
export function ensurePdfCopy(deckPath: string, deck: Blob | ArrayBuffer): Promise<Blob | null> {
  const existing = running.get(deckPath);
  if (existing) return existing;
  const job = convertOnce(deckPath, deck).finally(() => {
    running.delete(deckPath);
    deleted.delete(deckPath);
  });
  running.set(deckPath, job);
  return job;
}

async function convertOnce(deckPath: string, deck: Blob | ArrayBuffer): Promise<Blob | null> {
  const marker = `pdf-copy:${pdfCopyPath(deckPath)}`;
  // Another tab is converting this deck: wait for its copy instead of converting again.
  if (markerFresh(marker)) return waitForOtherTab(deckPath, marker);
  setMarker(marker);
  try {
    const file = deck instanceof Blob ? deck : new Blob([deck]);
    const expected = await deckSlideCount(file);
    const pdf = await convert(file, deckPath);
    if (!(await isPdf(pdf))) throw new Error("the converter did not return a PDF");
    const pages = await pdfPageCount(pdf);
    if (expected && pages !== expected)
      throw new Error(
        `the PDF has ${pages} pages but the deck has ${expected} slides (hidden slides?)`,
      );
    if (deleted.delete(deckPath)) return null;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(pdfCopyPath(deckPath), pdf, { contentType: "application/pdf" });
    // Another tab (or an earlier visit) saved the copy first: use that one.
    if (error && !/exists|duplicate|409/i.test(`${error.message} ${statusOf(error)}`))
      throw new Error(`could not save the PDF copy: ${error.message}`);
    return pdf;
  } catch (err) {
    console.warn(
      `[slides] exact PDF copy not made for ${deckPath}; showing the PowerPoint view:`,
      err instanceof Error ? err.message : err,
    );
    return null;
  } finally {
    clearMarker(marker);
  }
}

type Job = {
  id?: string;
  status?: string;
  outputs?: { url?: string; kind?: string; mime?: string }[];
  error?: { code?: string; message?: string } | null;
};

/** Sends the deck to PDF Studio, waits for the job and downloads the PDF. */
async function convert(file: Blob, deckPath: string): Promise<Blob> {
  const deadline = Date.now() + TIMEOUT_MS;
  const withTimeout = (ms = deadline - Date.now()) => AbortSignal.timeout(Math.max(1000, ms));
  const name = (deckPath.split("/").pop() || "deck.pptx").replace(/[^\w.-]/g, "_");
  const form = new FormData();
  form.append(
    "files",
    new File([file], name, {
      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    }),
  );
  const start = await fetch(`${PDF_CONVERTER_URL}/api/convert/office-to-pdf`, {
    method: "POST",
    body: form,
    signal: withTimeout(),
  });
  if (!start.ok) throw new Error(`the converter answered ${start.status}`);
  let job = (await start.json()) as Job;
  if (!job.id) throw new Error("the converter did not start a job");
  while (job.status !== "done") {
    if (job.status === "failed" || job.status === "cancelled")
      throw new Error(`conversion ${job.status}: ${job.error?.message ?? "no reason given"}`);
    if (Date.now() > deadline) throw new Error("conversion timed out");
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    const res = await fetch(`${PDF_CONVERTER_URL}/api/jobs/${encodeURIComponent(job.id!)}`, {
      signal: withTimeout(),
    });
    if (!res.ok) throw new Error(`the converter answered ${res.status} while converting`);
    job = (await res.json()) as Job;
  }
  const output = job.outputs?.find((o) => o.kind === "pdf" || o.mime === "application/pdf");
  if (!output?.url) throw new Error("the converter returned no PDF");
  const url = /^https?:/i.test(output.url) ? output.url : `${PDF_CONVERTER_URL}${output.url}`;
  const download = await fetch(url, { signal: withTimeout() });
  if (!download.ok) throw new Error(`downloading the PDF failed (${download.status})`);
  return new Blob([await download.arrayBuffer()], { type: "application/pdf" });
}

/** Number of slides in a .pptx (the slide list in presentation.xml, hidden slides included). */
export async function deckSlideCount(deck: Blob): Promise<number> {
  try {
    const { default: JSZip } = await import("jszip");
    const zip = await JSZip.loadAsync(await deck.arrayBuffer());
    const pres = await zip.file("ppt/presentation.xml")?.async("text");
    const listed = pres ? (pres.match(/<p:sldId\b/g) ?? []).length : 0;
    if (listed) return listed;
    return Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).length;
  } catch {
    return 0;
  }
}

async function isPdf(blob: Blob): Promise<boolean> {
  const head = new Uint8Array(await blob.slice(0, 5).arrayBuffer());
  return String.fromCharCode(...head) === "%PDF-";
}

async function pdfPageCount(pdf: Blob): Promise<number> {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const task = pdfjs.getDocument({ data: new Uint8Array(await pdf.arrayBuffer()) });
  try {
    return (await task.promise).numPages;
  } finally {
    void task.destroy();
  }
}

/** Polls for the copy another tab is making, until its marker goes away or expires. */
async function waitForOtherTab(deckPath: string, marker: string): Promise<Blob | null> {
  while (markerFresh(marker)) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    const copy = await downloadPdfCopy(deckPath);
    if (copy) return copy;
  }
  return downloadPdfCopy(deckPath);
}

function statusOf(error: unknown): string {
  const e = error as { statusCode?: unknown; status?: unknown };
  return String(e.statusCode ?? e.status ?? "");
}

function markerFresh(key: string): boolean {
  try {
    const at = Number(localStorage.getItem(key));
    return !!at && Date.now() - at < MARKER_TTL_MS;
  } catch {
    return false;
  }
}
function setMarker(key: string) {
  try {
    localStorage.setItem(key, String(Date.now()));
  } catch {
    /* private mode: the in-memory lock still applies */
  }
}
function clearMarker(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
