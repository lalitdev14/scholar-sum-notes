import { describe, expect, test } from "bun:test";
import { NyuSearchInput } from "./nyu-courses.schema";

describe("NyuSearchInput (searchNyuCourses input validation)", () => {
  test("accepts a normal query and trims it", () => {
    expect(NyuSearchInput.parse({ q: "  algorithms ", term: "9999" })).toEqual({
      q: "algorithms",
      term: "9999",
    });
  });

  test("accepts exactly 2 and exactly 80 characters", () => {
    expect(NyuSearchInput.safeParse({ q: "ai", term: "1274" }).success).toBe(true);
    expect(NyuSearchInput.safeParse({ q: "a".repeat(80), term: "1274" }).success).toBe(true);
  });

  test("rejects fewer than 2 characters after trimming", () => {
    expect(NyuSearchInput.safeParse({ q: "a", term: "1274" }).success).toBe(false);
    expect(NyuSearchInput.safeParse({ q: "   a   ", term: "1274" }).success).toBe(false);
    expect(NyuSearchInput.safeParse({ q: "   ", term: "1274" }).success).toBe(false);
  });

  test("rejects more than 80 characters after trimming", () => {
    expect(NyuSearchInput.safeParse({ q: "a".repeat(81), term: "1274" }).success).toBe(false);
    expect(NyuSearchInput.safeParse({ q: ` ${"a".repeat(80)} `, term: "1274" }).success).toBe(true);
  });

  test("rejects an invalid term id", () => {
    for (const term of ["", "abc", "12a4", "123456789", "1274; drop", "-1"]) {
      expect(NyuSearchInput.safeParse({ q: "algorithms", term }).success).toBe(false);
    }
  });

  test("rejects missing or non-string fields", () => {
    expect(NyuSearchInput.safeParse({ q: "algorithms" }).success).toBe(false);
    expect(NyuSearchInput.safeParse({ term: "1274" }).success).toBe(false);
    expect(NyuSearchInput.safeParse({ q: 42, term: 1274 }).success).toBe(false);
    expect(NyuSearchInput.safeParse(null).success).toBe(false);
  });
});
