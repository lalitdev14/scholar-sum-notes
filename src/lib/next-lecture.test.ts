import { describe, expect, test } from "bun:test";
import { parseMeetingText } from "./meeting-times";
import {
  clockDigits,
  durationWords,
  findNextLecture,
  formatLectureTime,
  timeLeft,
  zonedTimeToUtc,
  type ScheduledClass,
} from "./next-lecture";

const cls = (
  name: string,
  meets: string,
  startDate: string | null = "2026-09-02",
  endDate: string | null = "2026-12-14",
): ScheduledClass => ({
  classId: name,
  name,
  meetings: parseMeetingText(meets),
  startDate,
  endDate,
});

describe("zonedTimeToUtc (America/New_York)", () => {
  test("winter (EST, UTC-5)", () => {
    expect(zonedTimeToUtc({ y: 2026, m: 12, d: 1 }, 14 * 60).toISOString()).toBe(
      "2026-12-01T19:00:00.000Z",
    );
  });
  test("summer (EDT, UTC-4)", () => {
    expect(zonedTimeToUtc({ y: 2026, m: 9, d: 15 }, 14 * 60).toISOString()).toBe(
      "2026-09-15T18:00:00.000Z",
    );
  });
  test("day of spring-forward (2027-03-14)", () => {
    expect(zonedTimeToUtc({ y: 2027, m: 3, d: 14 }, 60).toISOString()).toBe(
      "2027-03-14T06:00:00.000Z",
    );
    expect(zonedTimeToUtc({ y: 2027, m: 3, d: 14 }, 10 * 60).toISOString()).toBe(
      "2027-03-14T14:00:00.000Z",
    );
  });
  test("day of fall-back (2026-11-01)", () => {
    expect(zonedTimeToUtc({ y: 2026, m: 11, d: 1 }, 10 * 60).toISOString()).toBe(
      "2026-11-01T15:00:00.000Z",
    );
  });
});

describe("findNextLecture", () => {
  test("soonest upcoming meeting across classes", () => {
    // Thu 2026-11-26 09:00 New York (EST).
    const now = new Date("2026-11-26T14:00:00Z");
    const next = findNextLecture(
      [cls("Algorithms", "TR 2-3:15p"), cls("Databases", "M 2-4:30p")],
      now,
    );
    expect(next?.status).toBe("upcoming");
    expect(next?.item.name).toBe("Algorithms");
    expect(next?.start.toISOString()).toBe("2026-11-26T19:00:00.000Z");
    expect(next?.end.toISOString()).toBe("2026-11-26T20:15:00.000Z");
  });

  test("happening now, then the next one once it ends", () => {
    const items = [cls("Algorithms", "TR 2-3:15p"), cls("Databases", "M 2-4:30p")];
    const during = findNextLecture(items, new Date("2026-11-26T19:30:00Z"));
    expect(during?.status).toBe("now");
    expect(during?.item.name).toBe("Algorithms");
    const after = findNextLecture(items, new Date("2026-11-26T20:15:00Z"));
    expect(after?.status).toBe("upcoming");
    expect(after?.item.name).toBe("Databases");
    expect(after?.start.toISOString()).toBe("2026-11-30T19:00:00.000Z");
  });

  test("across the fall-back change the wall time stays 2:00 pm", () => {
    // Fri 2026-10-30 noon EDT; next Monday (Nov 2) is EST.
    const next = findNextLecture([cls("Databases", "M 2-4:30p")], new Date("2026-10-30T16:00:00Z"));
    expect(next?.start.toISOString()).toBe("2026-11-02T19:00:00.000Z");
    expect(formatLectureTime(next!.start, new Date("2026-10-30T16:00:00Z"))).toBe("Mon 2:00 pm");
  });

  test("across the spring-forward change", () => {
    // Fri 2027-03-12 noon EST; Monday Mar 15 is EDT.
    const next = findNextLecture(
      [cls("Databases", "M 2-4:30p", "2027-01-20", "2027-05-05")],
      new Date("2027-03-12T17:00:00Z"),
    );
    expect(next?.start.toISOString()).toBe("2027-03-15T18:00:00.000Z");
  });

  test("before the term starts: the first meeting on or after the start date", () => {
    const next = findNextLecture(
      [cls("Algorithms", "TR 2-3:15p", "2027-01-20", "2027-05-05")],
      new Date("2026-11-26T14:00:00Z"),
    );
    // 2027-01-20 is a Wednesday, so the first Tue/Thu meeting is Thu Jan 21.
    expect(next?.start.toISOString()).toBe("2027-01-21T19:00:00.000Z");
    expect(formatLectureTime(next!.start, new Date("2026-11-26T14:00:00Z"))).toBe(
      "Thu, Jan 21 · 2:00 pm",
    );
  });

  test("after the end date: nothing upcoming", () => {
    expect(
      findNextLecture([cls("Algorithms", "TR 2-3:15p")], new Date("2026-12-16T14:00:00Z")),
    ).toBeNull();
  });

  test("the last day of term still counts, but not after its last meeting", () => {
    const items = [cls("Algorithms", "TR 2-3:15p", "2026-09-02", "2026-12-10")];
    expect(findNextLecture(items, new Date("2026-12-10T14:00:00Z"))?.start.toISOString()).toBe(
      "2026-12-10T19:00:00.000Z",
    );
    expect(findNextLecture(items, new Date("2026-12-10T21:00:00Z"))).toBeNull();
  });

  test("sections without meetings (TBA) are skipped", () => {
    expect(findNextLecture([cls("Seminar", "TBA")], new Date("2026-11-26T14:00:00Z"))).toBeNull();
  });

  test("no dates means every week", () => {
    const next = findNextLecture(
      [cls("X", "F 9-10a", null, null)],
      new Date("2026-11-26T14:00:00Z"),
    );
    expect(next?.start.toISOString()).toBe("2026-11-27T14:00:00.000Z");
  });
});

describe("formatting", () => {
  test("clock digits and time left", () => {
    expect(clockDigits(3 * 3600 + 12 * 60 + 9)).toBe("03:12:09");
    expect(clockDigits(12 * 60 + 9, true)).toBe("12:09");
    expect(clockDigits(3600, true)).toBe("01:00:00");
    const left = timeLeft(new Date("2026-11-26T19:00:00Z"), new Date("2026-11-26T18:58:59.500Z"));
    expect(left).toEqual({ total: 61, h: 0, m: 1, s: 1 });
    expect(timeLeft(new Date(0), new Date(1000)).total).toBe(0);
  });
  test("words for screen readers", () => {
    expect(durationWords(30)).toBe("less than a minute");
    expect(durationWords(60)).toBe("1 minute");
    expect(durationWords(3 * 3600 + 11 * 60 + 5)).toBe("3 hours 12 minutes");
    expect(durationWords(7200)).toBe("2 hours");
  });
  test("day and time within a week", () => {
    expect(
      formatLectureTime(new Date("2026-11-26T19:00:00Z"), new Date("2026-11-25T12:00:00Z")),
    ).toBe("Thu 2:00 pm");
    expect(
      formatLectureTime(new Date("2026-11-27T14:30:00Z"), new Date("2026-11-25T12:00:00Z")),
    ).toBe("Fri 9:30 am");
  });
});
