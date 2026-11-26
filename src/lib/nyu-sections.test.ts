import { afterEach, describe, expect, test } from "bun:test";
import sample from "./__fixtures__/fose-sample.json";
import {
  NyuUnavailableError,
  searchSections,
  setNyuHttpFetch,
  toSections,
} from "./nyu-courses.server";
import { NyuSectionsInput } from "./nyu-courses.schema";

afterEach(() => setNyuHttpFetch(null));

describe("toSections (real FOSE sample)", () => {
  test("exact code only, sorted, meetings from meetingTimes or the text", () => {
    const sections = toSections(sample.results, "cs-gy  6033", "1258");
    expect(sections.map((s) => s.no)).toEqual(["A", "B"]);
    expect(sections[0]).toEqual({
      no: "A",
      type: "LEC",
      meets: "T 11a-1:30p",
      meetings: [{ day: 1, start: 660, end: 810 }],
      startDate: "2025-09-02",
      endDate: "2025-12-11",
      instructor: "",
      term: "1258",
    });
    expect(sections[1]!.meetings).toEqual([{ day: 0, start: 840, end: 990 }]);
    const fa = toSections(sample.results, "BMIN-GA 1170", "1258");
    expect(fa[0]!.meetings).toEqual([{ day: 1, start: 1015, end: 1135 }]);
  });

  test("TBA, cancelled and duplicate sections", () => {
    const rows = [
      { code: "X-UA 1", no: "001", meets: "TBA", meetingTimes: "[]", schd: "LEC" },
      { code: "X-UA 1", no: "002", meets: "MW 9:30-10:45a", isCancelled: "Y" },
      { code: "X-UA 1", no: "001", meets: "M 1-2p" },
      { code: "X-UA 10", no: "003", meets: "M 1-2p" },
    ];
    const s = toSections(rows, "X-UA 1", "1274");
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({
      no: "001",
      meets: "TBA",
      meetings: [],
      startDate: null,
      term: "1274",
    });
  });
});

describe("searchSections", () => {
  test("posts a keyword search for the code and filters it", async () => {
    let body = "";
    setNyuHttpFetch(async (_url, init) => {
      body = String(init.body);
      return new Response(JSON.stringify(sample), { status: 200 });
    });
    const s = await searchSections("CS-GY 6033", "1258");
    expect(JSON.parse(body)).toEqual({
      other: { srcdb: "1258" },
      criteria: [{ field: "keyword", value: "CS-GY 6033" }],
    });
    expect(s.map((x) => x.no)).toEqual(["A", "B"]);
  });

  test("NYU failures become NyuUnavailableError", async () => {
    setNyuHttpFetch(async () => new Response("down", { status: 503 }));
    await expect(searchSections("CS-GY 6033", "1258")).rejects.toBeInstanceOf(NyuUnavailableError);
    setNyuHttpFetch(async () => {
      throw new Error("network");
    });
    await expect(searchSections("CS-GY 6033", "1258")).rejects.toBeInstanceOf(NyuUnavailableError);
  });
});

describe("NyuSectionsInput", () => {
  test("accepts codes, rejects junk", () => {
    expect(NyuSectionsInput.parse({ code: " CS-GY 6033 ", term: "1274" }).code).toBe("CS-GY 6033");
    for (const code of ["", "x", "<script>", "a".repeat(41), "CS;drop"])
      expect(NyuSectionsInput.safeParse({ code, term: "1274" }).success).toBe(false);
    expect(NyuSectionsInput.safeParse({ code: "CS-GY 6033", term: "abc" }).success).toBe(false);
  });
});
