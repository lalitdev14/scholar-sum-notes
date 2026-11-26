import { describe, expect, test } from "bun:test";
import {
  activePartIndex,
  hasHeadings,
  playbackRatio,
  splitParts,
  transcriptBlocks,
} from "./transcript-follow";
import { levelBands } from "./motion";

describe("splitParts", () => {
  test("splits at sentence ends and keeps the exact text", () => {
    const text = "First point. Second point!  Third?\nFourth without end";
    const parts = splitParts(text);
    expect(parts.join("")).toBe(text);
    expect(parts.length).toBe(4);
    expect(parts[0]).toBe("First point. ");
  });
  test("caps long unpunctuated speech at 25 words", () => {
    const text = Array.from({ length: 60 }, (_, i) => `w${i}`).join(" ");
    const parts = splitParts(text);
    expect(parts.join("")).toBe(text);
    expect(parts.length).toBe(3);
  });
  test("empty text has no parts", () => {
    expect(splitParts("   ")).toEqual([]);
  });
});

describe("transcriptBlocks", () => {
  test("headings and paragraphs", () => {
    const text = "## Intro\nHello there. Welcome.\n\n## Next\nMore.";
    expect(hasHeadings(text)).toBe(true);
    const blocks = transcriptBlocks(text);
    expect(blocks.map((b) => b.kind)).toEqual(["heading", "paragraph", "heading", "paragraph"]);
    expect(blocks[1]).toEqual({ kind: "paragraph", parts: ["Hello there. ", "Welcome."] });
    expect(hasHeadings("no headings here")).toBe(false);
  });
});

describe("activePartIndex", () => {
  const parts = ["aaaa ", "bbbb ", "cccc ", "dddd"];
  test("follows the share played", () => {
    expect(activePartIndex(parts, 0)).toBe(0);
    expect(activePartIndex(parts, 0.3)).toBe(1);
    expect(activePartIndex(parts, 0.6)).toBe(2);
    expect(activePartIndex(parts, 1)).toBe(3);
    expect(activePartIndex(parts, 5)).toBe(3);
    expect(activePartIndex(parts, Number.NaN)).toBe(0);
    expect(activePartIndex([], 0.5)).toBe(-1);
  });
});

describe("playbackRatio", () => {
  test("uses the file's duration, or the saved length", () => {
    expect(playbackRatio(30, 120)).toBe(0.25);
    expect(playbackRatio(30, Number.POSITIVE_INFINITY, 60)).toBe(0.5);
    expect(playbackRatio(30, Number.NaN)).toBe(0);
    expect(playbackRatio(90, 60)).toBe(1);
  });
});

describe("levelBands", () => {
  test("silence is zero, loud is capped at 1", () => {
    expect(levelBands(new Uint8Array(128))).toEqual([0, 0, 0, 0, 0]);
    expect(levelBands(new Uint8Array(128).fill(255))).toEqual([1, 1, 1, 1, 1]);
    const mid = levelBands(new Uint8Array(128).fill(64));
    expect(mid.every((v) => v > 0.4 && v < 0.5)).toBe(true);
  });
});
