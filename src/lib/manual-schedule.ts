/**
 * Class times a student types in themselves (REQ-2026-11-26-manual-class-times), for when
 * NYU's class search can't give them. Saved in `class_sections` like an NYU section, with
 * `section_no = 'Manual'` and `schedule_type = 'MANUAL'`, so the home countdown uses them as is.
 * Pure functions (no I/O) so they can be unit-tested.
 */

import { DAY_SHORT, type Meeting } from "@/lib/meeting-times";
import type { NyuSection } from "@/lib/nyu-courses.functions";

export const MANUAL_SECTION_NO = "Manual";
export const MANUAL_SCHEDULE_TYPE = "MANUAL";
export const MAX_MANUAL_MEETINGS = 5;
/** `class_sections.meets` is at most 200 characters. */
export const MAX_MEETS_LENGTH = 200;

/** One weekly meeting as typed in the form: days 0 = Monday … 6 = Sunday, times "HH:MM" (24 h). */
export type ManualMeetingDraft = { days: number[]; start: string; end: string };

/** The manual form: weekly meetings and optional first/last day of classes ("YYYY-MM-DD" or ""). */
export type ManualDraft = {
  meetings: ManualMeetingDraft[];
  startDate: string;
  endDate: string;
};

export type ManualErrors = {
  meetings: { days?: string; start?: string; end?: string }[];
  startDate?: string;
  endDate?: string;
  /** For the form as a whole (e.g. no meetings at all). */
  form?: string;
};

export function emptyMeetingDraft(): ManualMeetingDraft {
  return { days: [], start: "", end: "" };
}

export function emptyManualDraft(): ManualDraft {
  return { meetings: [emptyMeetingDraft()], startDate: "", endDate: "" };
}

/** True for a saved or listed section that holds manually entered times. */
export function isManualSection(
  s: { scheduleType?: string; type?: string; sectionNo?: string; no?: string } | null | undefined,
): boolean {
  if (!s) return false;
  const type = s.scheduleType ?? s.type ?? "";
  return type.toUpperCase() === MANUAL_SCHEDULE_TYPE;
}

/** "14:05" (from `<input type="time">`, seconds ignored) → 845; null when empty or unreadable. */
export function timeInputToMinutes(v: string): number | null {
  const m = v.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** 845 → "14:05", the value an `<input type="time">` expects. */
export function minutesToTimeInput(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
function validIsoDate(v: string): boolean {
  if (!ISO_DATE.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Checks the manual form. Messages are short, to show next to each field. */
export function validateManual(draft: ManualDraft): ManualErrors {
  const errors: ManualErrors = { meetings: [] };
  if (!draft.meetings.length) errors.form = "Add at least one meeting.";
  if (draft.meetings.length > MAX_MANUAL_MEETINGS)
    errors.form = `Add at most ${MAX_MANUAL_MEETINGS} meetings.`;
  for (const m of draft.meetings) {
    const e: ManualErrors["meetings"][number] = {};
    if (!m.days.some((d) => Number.isInteger(d) && d >= 0 && d <= 6))
      e.days = "Pick at least one day.";
    const start = timeInputToMinutes(m.start);
    const end = timeInputToMinutes(m.end);
    if (start === null) e.start = "Enter a start time.";
    if (end === null) e.end = "Enter an end time.";
    else if (start !== null && end <= start) e.end = "End time must be after the start time.";
    errors.meetings.push(e);
  }
  const s = draft.startDate.trim();
  const en = draft.endDate.trim();
  if (s && !validIsoDate(s)) errors.startDate = "Enter a valid date.";
  if (en && !validIsoDate(en)) errors.endDate = "Enter a valid date.";
  else if (s && en && !errors.startDate && en < s)
    errors.endDate = "Last day can't be before the first day.";
  return errors;
}

export function isManualValid(errors: ManualErrors): boolean {
  return (
    !errors.form &&
    !errors.startDate &&
    !errors.endDate &&
    errors.meetings.every((m) => !m.days && !m.start && !m.end)
  );
}

/** The weekly meetings of a (valid) manual form, one per day, sorted Monday first. */
export function manualToMeetings(draft: ManualDraft): Meeting[] {
  const seen = new Set<string>();
  const out: Meeting[] = [];
  for (const m of draft.meetings) {
    const start = timeInputToMinutes(m.start);
    const end = timeInputToMinutes(m.end);
    if (start === null || end === null || end <= start) continue;
    for (const day of m.days) {
      if (!Number.isInteger(day) || day < 0 || day > 6) continue;
      const k = `${day}:${start}:${end}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ day, start, end });
    }
  }
  return out.sort((a, b) => a.day - b.day || a.start - b.start || a.end - b.end);
}

function clockParts(minutes: number) {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return { text: `${h12}:${String(m).padStart(2, "0")}`, mer: h < 12 ? "am" : "pm" };
}

/** "2:00–3:15 pm", or "11:00 am–1:30 pm" when the meridiem changes. */
export function formatTimeRange(start: number, end: number): string {
  const a = clockParts(start);
  const b = clockParts(end);
  return a.mer === b.mer ? `${a.text}–${b.text} ${b.mer}` : `${a.text} ${a.mer}–${b.text} ${b.mer}`;
}

/**
 * The saved `meets` text for manual times: "Tue, Thu 2:00–3:15 pm", groups joined by "; "
 * ("Mon, Wed 9:30–10:45 am; Fri 2:00–3:00 pm"). At most 200 characters.
 */
export function manualMeetsText(meetings: Meeting[]): string {
  const groups = new Map<string, { start: number; end: number; days: number[] }>();
  for (const m of [...meetings].sort((a, b) => a.start - b.start || a.day - b.day)) {
    const k = `${m.start}-${m.end}`;
    const g = groups.get(k) ?? { start: m.start, end: m.end, days: [] };
    if (!g.days.includes(m.day)) g.days.push(m.day);
    groups.set(k, g);
  }
  const text = [...groups.values()]
    .sort((a, b) => Math.min(...a.days) - Math.min(...b.days) || a.start - b.start)
    .map(
      (g) =>
        `${[...g.days]
          .sort((x, y) => x - y)
          .map((d) => DAY_SHORT[d])
          .join(", ")} ${formatTimeRange(g.start, g.end)}`,
    )
    .join("; ");
  return text.length > MAX_MEETS_LENGTH ? `${text.slice(0, MAX_MEETS_LENGTH - 1)}…` : text;
}

/** The section to save for a valid manual form (same shape as an NYU section). */
export function buildManualSection(draft: ManualDraft, term: string): NyuSection {
  const meetings = manualToMeetings(draft);
  return {
    no: MANUAL_SECTION_NO,
    type: MANUAL_SCHEDULE_TYPE,
    meets: manualMeetsText(meetings),
    meetings,
    startDate: draft.startDate.trim() || null,
    endDate: draft.endDate.trim() || null,
    instructor: "",
    term,
  };
}

/** Pre-fills the manual form from saved times: meetings with the same times share one row. */
export function manualDraftFromMeetings(
  meetings: Meeting[],
  startDate: string | null | undefined,
  endDate: string | null | undefined,
): ManualDraft {
  const rows = new Map<string, ManualMeetingDraft>();
  for (const m of [...meetings].sort((a, b) => a.day - b.day || a.start - b.start)) {
    const k = `${m.start}-${m.end}`;
    const row = rows.get(k) ?? {
      days: [],
      start: minutesToTimeInput(m.start),
      end: minutesToTimeInput(m.end),
    };
    if (!row.days.includes(m.day)) row.days.push(m.day);
    rows.set(k, row);
  }
  const list = [...rows.values()].slice(0, MAX_MANUAL_MEETINGS);
  return {
    meetings: list.length ? list : [emptyMeetingDraft()],
    startDate: startDate ?? "",
    endDate: endDate ?? "",
  };
}

/** "Your times · Tue, Thu 2:00–3:15 pm" — the label of a saved manual schedule. */
export function manualLabel(meets: string): string {
  return meets ? `Your times · ${meets}` : "Your times";
}
