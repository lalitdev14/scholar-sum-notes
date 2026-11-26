import { describe, expect, test } from "bun:test";
import {
  asMeetings,
  describeMeetings,
  parseMeetingText,
  parseMeetingTimesJson,
  parseTimeRange,
  sectionMeetings,
} from "./meeting-times";

const t = (h: number, m = 0) => h * 60 + m;

describe("parseMeetingText", () => {
  test("TR 2-3:15p → Tue and Thu 2:00–3:15 pm", () => {
    expect(parseMeetingText("TR 2-3:15p")).toEqual([
      { day: 1, start: t(14), end: t(15, 15) },
      { day: 3, start: t(14), end: t(15, 15) },
    ]);
  });
  test("M 2-4:30p", () => {
    expect(parseMeetingText("M 2-4:30p")).toEqual([{ day: 0, start: t(14), end: t(16, 30) }]);
  });
  test("T 11a-1:30p (start has its own am)", () => {
    expect(parseMeetingText("T 11a-1:30p")).toEqual([{ day: 1, start: t(11), end: t(13, 30) }]);
  });
  test("MW 9:30-10:45a", () => {
    expect(parseMeetingText("MW 9:30-10:45a")).toEqual([
      { day: 0, start: t(9, 30), end: t(10, 45) },
      { day: 2, start: t(9, 30), end: t(10, 45) },
    ]);
  });
  test("T 4:55-6:55p (sample section)", () => {
    expect(parseMeetingText("T 4:55-6:55p")).toEqual([
      { day: 1, start: t(16, 55), end: t(18, 55) },
    ]);
  });
  test("start without am/pm before noon end: 11-12:15p is 11 am", () => {
    expect(parseMeetingText("F 11-12:15p")).toEqual([{ day: 4, start: t(11), end: t(12, 15) }]);
  });
  test("noon start: 12:30-1:45p", () => {
    expect(parseMeetingText("WF 12:30-1:45p")).toEqual([
      { day: 2, start: t(12, 30), end: t(13, 45) },
      { day: 4, start: t(12, 30), end: t(13, 45) },
    ]);
  });
  test("Saturday and Sunday letters", () => {
    expect(parseMeetingText("SU 10a-12p").map((m) => m.day)).toEqual([5, 6]);
  });
  test("several groups", () => {
    expect(parseMeetingText("MW 9:30-10:45a; F 2-3p")).toEqual([
      { day: 0, start: t(9, 30), end: t(10, 45) },
      { day: 2, start: t(9, 30), end: t(10, 45) },
      { day: 4, start: t(14), end: t(15) },
    ]);
  });
  test("AM/PM words", () => {
    expect(parseMeetingText("TR 6:20 PM - 8:50 PM")).toEqual([
      { day: 1, start: t(18, 20), end: t(20, 50) },
      { day: 3, start: t(18, 20), end: t(20, 50) },
    ]);
  });
  test("TBA, empty and unreadable text give no meetings", () => {
    for (const s of [
      "TBA",
      "",
      "Does Not Meet",
      "Online",
      "XYZ 2-3p",
      "MW",
      "MW 3-2p",
      null,
      undefined,
    ])
      expect(parseMeetingText(s)).toEqual([]);
  });
});

describe("parseTimeRange", () => {
  test("rejects bad ranges", () => {
    expect(parseTimeRange("13p-2p")).toBeNull();
    expect(parseTimeRange("2:75-3p")).toBeNull();
    expect(parseTimeRange("2p")).toBeNull();
  });
});

describe("parseMeetingTimesJson / sectionMeetings", () => {
  test("reads FOSE meetingTimes (meet_day 0 = Monday)", () => {
    expect(
      parseMeetingTimesJson('[{"meet_day":"1","start_time":"1655","end_time":"1855"}]'),
    ).toEqual([{ day: 1, start: t(16, 55), end: t(18, 55) }]);
  });
  test("bad JSON or entries are skipped", () => {
    expect(parseMeetingTimesJson("not json")).toEqual([]);
    expect(parseMeetingTimesJson('[{"meet_day":"9","start_time":"1","end_time":"x"}]')).toEqual([]);
  });
  test("falls back to the meeting text when meetingTimes is empty", () => {
    expect(sectionMeetings("[]", "M 2-4:30p")).toEqual([{ day: 0, start: t(14), end: t(16, 30) }]);
    expect(sectionMeetings("[]", "TBA")).toEqual([]);
  });
});

describe("asMeetings / describeMeetings", () => {
  test("filters invalid stored values", () => {
    expect(asMeetings([{ day: 1, start: 10, end: 20 }, { day: 8 }, null, "x"])).toEqual([
      { day: 1, start: 10, end: 20 },
    ]);
    expect(asMeetings(null)).toEqual([]);
  });
  test("describes meetings for people", () => {
    expect(describeMeetings(parseMeetingText("TR 2-3:15p"))).toBe("Tue, Thu 2:00 pm–3:15 pm");
    expect(describeMeetings([])).toBe("No set meeting times");
  });
});
