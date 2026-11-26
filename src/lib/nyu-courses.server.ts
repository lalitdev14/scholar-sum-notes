/**
 * NYU public class search (CourseLeaf FOSE at bulletins.nyu.edu), queried from the server
 * because the browser can't call it (no CORS). Server-only: import it dynamically from
 * server function handlers.
 */

import type { NyuCourse, NyuSection, NyuTerm } from "@/lib/nyu-courses.functions";
import { sectionMeetings } from "@/lib/meeting-times";

/** Base URL of the class search; override with NYU_CLASS_SEARCH_URL (e.g. a local mock). */
export function classSearchBase(): string {
  const base =
    process.env["NYU_CLASS_SEARCH_URL"]?.trim() || "https://bulletins.nyu.edu/class-search/";
  return base.endsWith("/") ? base : `${base}/`;
}

export const NYU_TIMEOUT_MS = 8000;

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
};

/** The HTTP call, kept separate so tests can swap it out. */
export type HttpFetch = (url: string, init: RequestInit) => Promise<Response>;
let httpFetch: HttpFetch = (url, init) => fetch(url, init);
export function setNyuHttpFetch(fn: HttpFetch | null) {
  httpFetch = fn ?? ((url, init) => fetch(url, init));
}

async function nyuFetch(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NYU_TIMEOUT_MS);
  try {
    return await httpFetch(url, {
      ...init,
      headers: { ...HEADERS, ...(init.headers as Record<string, string> | undefined) },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Thrown when NYU's search is down, slow or returns something unexpected. */
export class NyuUnavailableError extends Error {
  constructor(cause?: unknown) {
    super("NYU's class search isn't responding right now. Please try again in a moment.");
    this.name = "NyuUnavailableError";
    if (cause !== undefined) (this as { cause?: unknown }).cause = cause;
  }
}

type FoseResult = { code?: unknown; title?: unknown; instr?: unknown };

/** Merges sections into one entry per course code (first instructor named wins). */
export function dedupeCourses(results: FoseResult[], max = 25): NyuCourse[] {
  const byCode = new Map<string, NyuCourse>();
  for (const r of results) {
    const code = typeof r.code === "string" ? r.code.trim().replace(/\s+/g, " ") : "";
    const title = typeof r.title === "string" ? r.title.trim() : "";
    if (!code || !title) continue;
    const instructor = typeof r.instr === "string" ? r.instr.trim() : "";
    const seen = byCode.get(code);
    if (!seen) {
      if (byCode.size >= max) continue;
      byCode.set(code, { code, title, instructor });
    } else if (!seen.instructor && instructor) {
      seen.instructor = instructor;
    }
  }
  return [...byCode.values()];
}

/** Runs a FOSE keyword search and returns its raw result rows. */
async function foseSearch(q: string, term: string): Promise<unknown[]> {
  const url = `${classSearchBase()}api/?page=fose&route=search&keyword=${encodeURIComponent(q)}`;
  let res: Response;
  try {
    res = await nyuFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        other: { srcdb: term },
        criteria: [{ field: "keyword", value: q }],
      }),
    });
  } catch (err) {
    throw new NyuUnavailableError(err);
  }
  if (!res.ok) throw new NyuUnavailableError(`HTTP ${res.status}`);
  let body: unknown;
  try {
    body = await res.json();
  } catch (err) {
    throw new NyuUnavailableError(err);
  }
  const results = (body as { results?: unknown })?.results;
  if (!Array.isArray(results)) {
    // FOSE answers {"fatal": "..."} for an unknown term, etc.
    throw new NyuUnavailableError("Unexpected response");
  }
  return results;
}

export async function searchCourses(q: string, term: string): Promise<NyuCourse[]> {
  return dedupeCourses((await foseSearch(q, term)) as FoseResult[]);
}

const normCode = (s: string) => s.trim().replace(/\s+/g, " ").toUpperCase();
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const isoDate = (v: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(str(v)) ? str(v) : null);

/**
 * The sections of one course code from FOSE search rows: exact code only, cancelled sections
 * left out, sorted by section number. Meetings come from `meetingTimes`, else the meeting text.
 */
export function toSections(results: unknown[], code: string, term: string): NyuSection[] {
  const want = normCode(code);
  const seen = new Set<string>();
  const out: NyuSection[] = [];
  for (const raw of results) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    if (normCode(str(r["code"])) !== want) continue;
    if (str(r["isCancelled"]) || str(r["stat"]) === "X") continue;
    const no = str(r["no"]);
    if (!no || seen.has(no)) continue;
    seen.add(no);
    const meets = str(r["meets"]);
    out.push({
      no,
      type: str(r["schd"]),
      meets,
      meetings: sectionMeetings(r["meetingTimes"], meets),
      startDate: isoDate(r["start_date"]),
      endDate: isoDate(r["end_date"]),
      instructor: str(r["instr"]),
      term: str(r["srcdb"]) || term,
    });
  }
  return out.sort((a, b) => a.no.localeCompare(b.no, undefined, { numeric: true }));
}

/** Sections of a course code (e.g. "CS-GY 6033") in a term. */
export async function searchSections(code: string, term: string): Promise<NyuSection[]> {
  return toSections(await foseSearch(code, term), code, term);
}

/** Used when the class-search page can't be fetched or parsed (verified 2026-11-26). */
export const FALLBACK_TERMS: { id: string; label: string }[] = [
  { id: "1274", label: "Spring 2027" },
  { id: "1272", label: "January 2027" },
  { id: "9999", label: "Fall 2026" },
  { id: "1266", label: "Summer 2026" },
  { id: "1264", label: "Spring 2026" },
];

function decodeEntities(s: string) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

/** Reads the term options of the `<select name="srcdb">` on the class-search page. */
export function parseTerms(html: string): { id: string; label: string }[] {
  const select = html.match(/<select\b[^>]*name=["']?srcdb["']?[^>]*>([\s\S]*?)<\/select>/i);
  if (!select?.[1]) return [];
  const out: { id: string; label: string }[] = [];
  const re = /<option\b[^>]*value=["']?([^"'\s>]+)["']?[^>]*>([\s\S]*?)<\/option>/gi;
  for (const m of select[1].matchAll(re)) {
    const id = (m[1] ?? "").trim();
    const label = decodeEntities((m[2] ?? "").replace(/<[^>]*>/g, ""))
      .replace(/\s+/g, " ")
      .trim();
    if (id && label) out.push({ id, label });
  }
  return out;
}

/** The semester for a date: Jan–May Spring, Jun–Aug Summer, Sep–Dec Fall. */
export function currentSemesterLabel(now: Date): string {
  const m = now.getMonth();
  const season = m <= 4 ? "Spring" : m <= 7 ? "Summer" : "Fall";
  return `${season} ${now.getFullYear()}`;
}

export function markCurrent(terms: { id: string; label: string }[], now: Date): NyuTerm[] {
  const want = currentSemesterLabel(now).toLowerCase();
  let idx = terms.findIndex((t) => t.label.toLowerCase() === want);
  if (idx < 0) idx = 0;
  return terms.map((t, i) => ({ ...t, current: i === idx }));
}

const TERMS_TTL_MS = 6 * 60 * 60 * 1000;
let termsCache: { at: number; terms: { id: string; label: string }[] } | null = null;
export function clearNyuTermsCache() {
  termsCache = null;
}

export async function getTerms(now = new Date()): Promise<NyuTerm[]> {
  if (termsCache && Date.now() - termsCache.at < TERMS_TTL_MS) {
    return markCurrent(termsCache.terms, now);
  }
  try {
    const res = await nyuFetch(classSearchBase(), {
      method: "GET",
      headers: { Accept: "text/html,application/xhtml+xml" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const terms = parseTerms(await res.text());
    if (!terms.length) throw new Error("No terms found");
    termsCache = { at: Date.now(), terms };
    return markCurrent(terms, now);
  } catch (err) {
    console.warn("[nyu-terms] using built-in list:", err instanceof Error ? err.message : err);
    return markCurrent(FALLBACK_TERMS, now);
  }
}
