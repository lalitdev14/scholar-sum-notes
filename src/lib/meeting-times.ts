/**
 * Weekly meeting times of an NYU class section, read from NYU class search (FOSE).
 * Pure functions (no I/O) so they can be unit-tested and used on the client and server.
 */

/** One weekly meeting: `day` 0 = Monday … 6 = Sunday; `start`/`end` in minutes after midnight (New York time). */
export type Meeting = { day: number; start: number; end: number };

/** Day letters used in NYU meeting text: M T W R(Thursday) F S(Saturday) U(Sunday). */
const DAY_LETTERS: Record<string, number> = { M: 0, T: 1, W: 2, R: 3, F: 4, S: 5, U: 6 };
export const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

function parseDays(token: string): number[] | null {
  const t = token.trim();
  if (!t) return null;
  if (/^[MTWRFSU]+$/.test(t)) return [...new Set([...t].map((c) => DAY_LETTERS[c]!))];
  // Spelled-out short forms ("Mon/Wed", "Th", "Sa", "Su") are accepted as well.
  const named = t.match(/^(mon|tue|tues|wed|thu|thur|thurs|th|fri|sat|sa|sun|su)([\s/,]+|$)/i);
  if (named) {
    const map: Record<string, number> = {
      mon: 0,
      tue: 1,
      tues: 1,
      wed: 2,
      thu: 3,
      thur: 3,
      thurs: 3,
      th: 3,
      fri: 4,
      sat: 5,
      sa: 5,
      sun: 6,
      su: 6,
    };
    const out: number[] = [];
    for (const part of t.split(/[\s/,]+/)) {
      const d = map[part.toLowerCase()];
      if (d === undefined) return null;
      out.push(d);
    }
    return out.length ? [...new Set(out)] : null;
  }
  return null;
}

type ClockPart = { h: number; m: number; mer: "a" | "p" | null };

function parseClock(raw: string): ClockPart | null {
  const m = raw
    .trim()
    .toLowerCase()
    .match(/^(\d{1,2})(?::(\d{2}))?\s*(a|p|am|pm|a\.m\.|p\.m\.)?$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  if (h < 0 || h > 23 || min > 59) return null;
  const mer = m[3] ? (m[3][0] as "a" | "p") : null;
  if (mer && (h < 1 || h > 12)) return null;
  return { h, m: min, mer };
}

function toMinutes(c: ClockPart, mer: "a" | "p" | null): number {
  if (!mer) return c.h * 60 + c.m; // 24-hour clock
  const h12 = c.h % 12;
  return (mer === "p" ? h12 + 12 : h12) * 60 + c.m;
}

/**
 * Parses a time range such as "2-3:15p", "11a-1:30p", "9:30-10:45a", "6:20 PM - 8:50 PM".
 * A start time without am/pm takes the end time's, unless that would put it after the end
 * ("11-12:15p" is 11 am to 12:15 pm). Returns null if the range can't be read.
 */
export function parseTimeRange(raw: string): { start: number; end: number } | null {
  const parts = raw.split(/\s*[-–—]\s*/);
  if (parts.length !== 2) return null;
  const a = parseClock(parts[0]!);
  const b = parseClock(parts[1]!);
  if (!a || !b) return null;
  const endMer = b.mer;
  const end = toMinutes(b, endMer);
  let start: number;
  if (a.mer) start = toMinutes(a, a.mer);
  else if (endMer) {
    start = toMinutes(a, endMer);
    if (start >= end) start = toMinutes(a, endMer === "p" ? "a" : "p");
  } else start = toMinutes(a, null);
  // A class meeting is at most 10 hours; anything longer is a misread.
  if (!(start < end) || end > 24 * 60 || end - start > 600) return null;
  return { start, end };
}

/**
 * Parses NYU meeting text into weekly meetings: "TR 2-3:15p", "M 2-4:30p", "T 11a-1:30p",
 * "MW 9:30-10:45a", or several groups ("MW 9:30-10:45a; F 2-3p"). "TBA", "Does Not Meet",
 * empty or unreadable text gives no meetings.
 */
export function parseMeetingText(text: string | null | undefined): Meeting[] {
  if (!text) return [];
  const out: Meeting[] = [];
  for (const group of text.split(/\s*[;|\n]\s*|\s*,\s*(?=[A-Za-z])/)) {
    const g = group.trim();
    if (!g || /\b(tba|tbd|arranged|does not meet|online|asynchronous)\b/i.test(g)) continue;
    // Days, then the time range starting at the first digit.
    const idx = g.search(/\d/);
    if (idx <= 0) continue;
    const days = parseDays(g.slice(0, idx));
    const range = parseTimeRange(g.slice(idx));
    if (!days || !range) continue;
    for (const day of days) out.push({ day, ...range });
  }
  return dedupeMeetings(out);
}

function hhmmToMinutes(v: unknown): number | null {
  const s = typeof v === "number" ? String(v) : typeof v === "string" ? v.trim() : "";
  if (!/^\d{3,4}$/.test(s)) return null;
  const n = Number(s);
  const h = Math.floor(n / 100);
  const m = n % 100;
  if (h > 24 || m > 59) return null;
  return h * 60 + m;
}

/**
 * Reads FOSE `meetingTimes`, a JSON string (or array) like
 * `[{"meet_day":"1","start_time":"1655","end_time":"1855"}]` where meet_day 0 = Monday.
 */
export function parseMeetingTimesJson(raw: unknown): Meeting[] {
  let list: unknown = raw;
  if (typeof raw === "string") {
    try {
      list = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(list)) return [];
  const out: Meeting[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const day = Number(r["meet_day"]);
    const start = hhmmToMinutes(r["start_time"]);
    const end = hhmmToMinutes(r["end_time"]);
    if (!Number.isInteger(day) || day < 0 || day > 6 || start === null || end === null) continue;
    if (!(start < end)) continue;
    out.push({ day, start, end });
  }
  return dedupeMeetings(out);
}

/** Meetings of a FOSE section: `meetingTimes` when present, otherwise parsed from the text. */
export function sectionMeetings(meetingTimes: unknown, meets: unknown): Meeting[] {
  const fromJson = parseMeetingTimesJson(meetingTimes);
  if (fromJson.length) return fromJson;
  return parseMeetingText(typeof meets === "string" ? meets : "");
}

function dedupeMeetings(list: Meeting[]): Meeting[] {
  const seen = new Set<string>();
  return list
    .filter((m) => {
      const k = `${m.day}:${m.start}:${m.end}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => a.day - b.day || a.start - b.start);
}

/** Checks a value read back from the database (jsonb) is a list of meetings. */
export function asMeetings(v: unknown): Meeting[] {
  if (!Array.isArray(v)) return [];
  return v.filter(
    (m): m is Meeting =>
      !!m &&
      typeof m === "object" &&
      Number.isInteger((m as Meeting).day) &&
      (m as Meeting).day >= 0 &&
      (m as Meeting).day <= 6 &&
      typeof (m as Meeting).start === "number" &&
      typeof (m as Meeting).end === "number" &&
      (m as Meeting).start < (m as Meeting).end,
  );
}

/** "2:00 pm" for 840. */
export function formatClock(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

/** "Tue, Thu 2:00 pm–3:15 pm" for showing a section's meetings. */
export function describeMeetings(list: Meeting[]): string {
  if (!list.length) return "No set meeting times";
  const byTime = new Map<string, number[]>();
  for (const m of list) {
    const k = `${m.start}-${m.end}`;
    byTime.set(k, [...(byTime.get(k) ?? []), m.day]);
  }
  return [...byTime.entries()]
    .map(([k, days]) => {
      const [s, e] = k.split("-").map(Number) as [number, number];
      return `${days.map((d) => DAY_SHORT[d]).join(", ")} ${formatClock(s)}–${formatClock(e)}`;
    })
    .join("; ");
}
