import { describe, expect, test } from "bun:test";
import {
  buildManualSection,
  emptyManualDraft,
  formatTimeRange,
  isManualSection,
  isManualValid,
  manualDraftFromMeetings,
  manualLabel,
  manualMeetsText,
  manualToMeetings,
  minutesToTimeInput,
  timeInputToMinutes,
  validateManual,
  type ManualDraft,
} from "./manual-schedule";
import { findNextLecture } from "./next-lecture";

const t = (h: number, m = 0) => h * 60 + m;
const draft = (over: Partial<ManualDraft> = {}): ManualDraft => ({
  meetings: [{ days: [1, 3], start: "14:00", end: "15:15" }],
  startDate: "",
  endDate: "",
  ...over,
});

describe("time inputs", () => {
  test("HH:MM ↔ minutes", () => {
    expect(timeInputToMinutes("14:05")).toBe(845);
    expect(timeInputToMinutes("09:30:00")).toBe(570);
    expect(timeInputToMinutes("")).toBeNull();
    expect(timeInputToMinutes("25:00")).toBeNull();
    expect(minutesToTimeInput(845)).toBe("14:05");
    expect(minutesToTimeInput(0)).toBe("00:00");
  });
});

describe("manualToMeetings", () => {
  test("Tue/Thu 2:00–3:15 pm → two meetings (0 = Monday, minutes)", () => {
    expect(manualToMeetings(draft())).toEqual([
      { day: 1, start: t(14), end: t(15, 15) },
      { day: 3, start: t(14), end: t(15, 15) },
    ]);
  });
  test("several meetings are merged, sorted Monday first and de-duplicated", () => {
    const d = draft({
      meetings: [
        { days: [4], start: "09:00", end: "10:00" },
        { days: [0, 2], start: "11:00", end: "12:15" },
        { days: [4], start: "09:00", end: "10:00" },
      ],
    });
    expect(manualToMeetings(d)).toEqual([
      { day: 0, start: t(11), end: t(12, 15) },
      { day: 2, start: t(11), end: t(12, 15) },
      { day: 4, start: t(9), end: t(10) },
    ]);
  });
  test("Sunday is day 6; invalid rows are skipped", () => {
    const d = draft({
      meetings: [
        { days: [6], start: "18:00", end: "20:00" },
        { days: [1], start: "15:00", end: "14:00" },
        { days: [2], start: "", end: "10:00" },
      ],
    });
    expect(manualToMeetings(d)).toEqual([{ day: 6, start: t(18), end: t(20) }]);
  });
});

describe("meets text", () => {
  test("time ranges", () => {
    expect(formatTimeRange(t(14), t(15, 15))).toBe("2:00–3:15 pm");
    expect(formatTimeRange(t(11), t(13, 30))).toBe("11:00 am–1:30 pm");
    expect(formatTimeRange(t(0), t(1))).toBe("12:00–1:00 am");
    expect(formatTimeRange(t(12), t(13))).toBe("12:00–1:00 pm");
  });
  test("Tue, Thu 2:00–3:15 pm", () => {
    expect(manualMeetsText(manualToMeetings(draft()))).toBe("Tue, Thu 2:00–3:15 pm");
  });
  test("groups by time, joined with '; '", () => {
    const d = draft({
      meetings: [
        { days: [4], start: "14:00", end: "15:00" },
        { days: [2, 0], start: "09:30", end: "10:45" },
      ],
    });
    expect(manualMeetsText(manualToMeetings(d))).toBe("Mon, Wed 9:30–10:45 am; Fri 2:00–3:00 pm");
  });
  test("never longer than 200 characters", () => {
    const meetings = Array.from({ length: 7 * 40 }, (_, i) => ({
      day: i % 7,
      start: i,
      end: i + 30,
    }));
    expect(manualMeetsText(meetings).length).toBeLessThanOrEqual(200);
  });
  test("label", () => {
    expect(manualLabel("Tue, Thu 2:00–3:15 pm")).toBe("Your times · Tue, Thu 2:00–3:15 pm");
  });
});

describe("validateManual", () => {
  test("a filled meeting is valid", () => {
    expect(isManualValid(validateManual(draft()))).toBe(true);
  });
  test("the empty form is not valid", () => {
    const e = validateManual(emptyManualDraft());
    expect(isManualValid(e)).toBe(false);
    expect(e.meetings[0]).toEqual({
      days: "Pick at least one day.",
      start: "Enter a start time.",
      end: "Enter an end time.",
    });
  });
  test("needs at least one day", () => {
    const e = validateManual(draft({ meetings: [{ days: [], start: "14:00", end: "15:00" }] }));
    expect(e.meetings[0]?.days).toBeDefined();
    expect(isManualValid(e)).toBe(false);
  });
  test("end must be after start", () => {
    for (const end of ["14:00", "13:00"]) {
      const e = validateManual(draft({ meetings: [{ days: [0], start: "14:00", end }] }));
      expect(e.meetings[0]?.end).toBe("End time must be after the start time.");
    }
  });
  test("errors are per meeting", () => {
    const e = validateManual(
      draft({
        meetings: [
          { days: [0], start: "09:00", end: "10:00" },
          { days: [], start: "09:00", end: "10:00" },
        ],
      }),
    );
    expect(e.meetings[0]).toEqual({});
    expect(e.meetings[1]?.days).toBeDefined();
  });
  test("no meetings / more than five", () => {
    expect(validateManual(draft({ meetings: [] })).form).toBeDefined();
    const six = Array.from({ length: 6 }, () => ({ days: [0], start: "09:00", end: "10:00" }));
    expect(validateManual(draft({ meetings: six })).form).toBeDefined();
  });
  test("term dates are optional; last day not before first day", () => {
    expect(isManualValid(validateManual(draft({ startDate: "2026-09-02" })))).toBe(true);
    expect(
      isManualValid(validateManual(draft({ startDate: "2026-09-02", endDate: "2026-12-14" }))),
    ).toBe(true);
    expect(
      isManualValid(validateManual(draft({ startDate: "2026-09-02", endDate: "2026-09-02" }))),
    ).toBe(true);
    const e = validateManual(draft({ startDate: "2026-12-14", endDate: "2026-09-02" }));
    expect(e.endDate).toBe("Last day can't be before the first day.");
    expect(validateManual(draft({ startDate: "2026-02-31" })).startDate).toBeDefined();
  });
});

describe("buildManualSection", () => {
  test("saved like an NYU section", () => {
    const s = buildManualSection(draft({ startDate: "2026-09-02", endDate: "" }), "1268");
    expect(s).toEqual({
      no: "Manual",
      type: "MANUAL",
      meets: "Tue, Thu 2:00–3:15 pm",
      meetings: [
        { day: 1, start: t(14), end: t(15, 15) },
        { day: 3, start: t(14), end: t(15, 15) },
      ],
      startDate: "2026-09-02",
      endDate: null,
      instructor: "",
      term: "1268",
    });
    expect(isManualSection(s)).toBe(true);
    expect(isManualSection({ scheduleType: "MANUAL", sectionNo: "Manual" })).toBe(true);
    expect(isManualSection({ type: "LEC", no: "001" })).toBe(false);
    expect(isManualSection(null)).toBe(false);
  });
  test("round-trips through the pre-filled form", () => {
    const d = draft({
      meetings: [
        { days: [0, 2], start: "09:30", end: "10:45" },
        { days: [4], start: "14:00", end: "15:00" },
      ],
      startDate: "2026-09-02",
      endDate: "2026-12-14",
    });
    const s = buildManualSection(d, "1268");
    const back = manualDraftFromMeetings(s.meetings, s.startDate, s.endDate);
    expect(back).toEqual(d);
    expect(manualDraftFromMeetings([], null, null)).toEqual(emptyManualDraft());
  });
  test("the countdown uses manual times like NYU times (New York time)", () => {
    const s = buildManualSection(draft(), "1268");
    // Tue 1 Dec 2026, 13:00 New York (EST, UTC-5) → the lecture at 14:00 New York.
    const now = new Date("2026-12-01T18:00:00Z");
    const next = findNextLecture(
      [{ classId: "c1", name: "Algorithms", meetings: s.meetings, startDate: null, endDate: null }],
      now,
    );
    expect(next?.status).toBe("upcoming");
    expect(next?.start.toISOString()).toBe("2026-12-01T19:00:00.000Z");
  });
});
