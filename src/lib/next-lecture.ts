/**
 * Finds the student's next lecture from their saved NYU sections. All class times are New York
 * wall-clock times (America/New_York), converted to real instants so daylight-saving changes
 * are handled. Pure (the current time is passed in) so it can be unit-tested.
 */

import { DAY_SHORT, type Meeting } from "@/lib/meeting-times";

export const NYU_TIME_ZONE = "America/New_York";

/** A saved section, joined with its class's name. */
export type ScheduledClass = {
  classId: string;
  name: string;
  code?: string;
  sectionNo?: string;
  meets?: string;
  meetings: Meeting[];
  /** "YYYY-MM-DD" (first day of classes), or null if unknown. */
  startDate: string | null;
  /** "YYYY-MM-DD" (last day of classes), or null if unknown. */
  endDate: string | null;
};

export type NextLecture = {
  status: "upcoming" | "now";
  item: ScheduledClass;
  start: Date;
  end: Date;
};

type Civil = { y: number; m: number; d: number };

const partsFormatter = new Map<string, Intl.DateTimeFormat>();
function formatterFor(tz: string) {
  let f = partsFormatter.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    partsFormatter.set(tz, f);
  }
  return f;
}

/** Wall-clock date and time of an instant in a time zone. */
export function zonedParts(date: Date, tz = NYU_TIME_ZONE) {
  const out: Record<string, number> = {};
  for (const p of formatterFor(tz).formatToParts(date)) {
    if (p.type !== "literal") out[p.type] = Number(p.value);
  }
  return {
    y: out["year"]!,
    m: out["month"]!,
    d: out["day"]!,
    hour: out["hour"]! % 24,
    minute: out["minute"]!,
    second: out["second"]!,
  };
}

/** Offset of the zone from UTC at an instant, in milliseconds (New York: -4 h or -5 h). */
function offsetMs(date: Date, tz: string): number {
  const p = zonedParts(date, tz);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/**
 * The instant at which the clock in `tz` shows the given date and time. A time skipped by the
 * spring-forward change (e.g. 2:30 am) is read with the offset before the change (so 3:30 am).
 */
export function zonedTimeToUtc(c: Civil, minutes: number, tz = NYU_TIME_ZONE): Date {
  const guess = Date.UTC(c.y, c.m - 1, c.d, 0, minutes);
  const first = offsetMs(new Date(guess), tz);
  let t = guess - first;
  const second = offsetMs(new Date(t), tz);
  if (second !== first) {
    const t2 = guess - second;
    // Use the second offset only if it reproduces the wall time (not in a skipped hour).
    if (offsetMs(new Date(t2), tz) === second) t = t2;
  }
  return new Date(t);
}

function parseIsoDate(s: string | null | undefined): Civil | null {
  const m = s?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) } : null;
}

function addDays(c: Civil, n: number): Civil {
  const t = new Date(Date.UTC(c.y, c.m - 1, c.d + n));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

const civilKey = (c: Civil) => c.y * 10000 + c.m * 100 + c.d;
/** 0 = Monday … 6 = Sunday. */
const weekday = (c: Civil) => (new Date(Date.UTC(c.y, c.m - 1, c.d)).getUTCDay() + 6) % 7;

/**
 * The lecture happening now (if any) or else the soonest upcoming one, across all classes,
 * counting only days within each section's start and end dates. Null when none is left.
 */
export function findNextLecture(
  items: ScheduledClass[],
  now: Date,
  tz = NYU_TIME_ZONE,
): NextLecture | null {
  const p = zonedParts(now, tz);
  const today: Civil = { y: p.y, m: p.m, d: p.d };
  let best: NextLecture | null = null;
  for (const item of items) {
    if (!item.meetings.length) continue;
    const first = parseIsoDate(item.startDate);
    const last = parseIsoDate(item.endDate);
    if (last && civilKey(last) < civilKey(today)) continue;
    // Start from yesterday (a late lecture could run past midnight) or the first day of term.
    let from = addDays(today, -1);
    if (first && civilKey(first) > civilKey(from)) from = first;
    for (let i = 0; i < 8; i++) {
      const day = addDays(from, i);
      if (last && civilKey(day) > civilKey(last)) break;
      const wd = weekday(day);
      for (const m of item.meetings) {
        if (m.day !== wd) continue;
        const start = zonedTimeToUtc(day, m.start, tz);
        const end = zonedTimeToUtc(day, m.end, tz);
        if (end.getTime() <= now.getTime()) continue;
        const status = start.getTime() <= now.getTime() ? "now" : "upcoming";
        const cand: NextLecture = { status, item, start, end };
        if (!best || better(cand, best)) best = cand;
      }
    }
  }
  return best;
}

function better(a: NextLecture, b: NextLecture) {
  if (a.status !== b.status) return a.status === "now";
  if (a.status === "now") return a.end.getTime() < b.end.getTime();
  return (
    a.start.getTime() < b.start.getTime() ||
    (a.start.getTime() === b.start.getTime() && a.item.name.localeCompare(b.item.name) < 0)
  );
}

/** Hours, minutes and seconds left until `target` (never negative). */
export function timeLeft(target: Date, now: Date) {
  const total = Math.max(0, Math.ceil((target.getTime() - now.getTime()) / 1000));
  return {
    total,
    h: Math.floor(total / 3600),
    m: Math.floor(total / 60) % 60,
    s: total % 60,
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "03:12:09" (hours, minutes, seconds) — or "12:09" when `short` and under an hour. */
export function clockDigits(totalSeconds: number, short = false): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor(totalSeconds / 60) % 60;
  const s = totalSeconds % 60;
  return short && h === 0 ? `${pad(m)}:${pad(s)}` : `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/** "3 hours 12 minutes" / "45 minutes" / "less than a minute", for screen readers (per minute). */
export function durationWords(totalSeconds: number): string {
  const mins = Math.ceil(totalSeconds / 60);
  if (totalSeconds < 60) return "less than a minute";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const part = (n: number, u: string) => `${n} ${u}${n === 1 ? "" : "s"}`;
  if (!h) return part(m, "minute");
  return m ? `${part(h, "hour")} ${part(m, "minute")}` : part(h, "hour");
}

/**
 * "Thu 2:00 pm" in New York time; adds the date when it is more than six days away
 * ("Mon, Jan 25 · 2:00 pm").
 */
export function formatLectureTime(start: Date, now: Date, tz = NYU_TIME_ZONE): string {
  const p = zonedParts(start, tz);
  const minutes = p.hour * 60 + p.minute;
  const h12 = p.hour % 12 === 0 ? 12 : p.hour % 12;
  const time = `${h12}:${pad(p.minute)} ${minutes < 720 ? "am" : "pm"}`;
  const wd = DAY_SHORT[weekday({ y: p.y, m: p.m, d: p.d })];
  if (start.getTime() - now.getTime() > 6 * 86400_000) {
    const month = new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short" }).format(start);
    return `${wd}, ${month} ${p.d} · ${time}`;
  }
  return `${wd} ${time}`;
}
