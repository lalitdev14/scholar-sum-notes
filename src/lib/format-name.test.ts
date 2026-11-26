import { describe, expect, test } from "bun:test";
import { formatFullName } from "./format-name";

describe("formatFullName", () => {
  test("title-cases an all-lowercase name", () => {
    expect(formatFullName("lalit dev jakher")).toBe("Lalit Dev Jakher");
  });

  test("title-cases an all-uppercase name", () => {
    expect(formatFullName("LALIT DEV JAKHER")).toBe("Lalit Dev Jakher");
  });

  test("keeps mixed-case names apart from the first letter", () => {
    expect(formatFullName("Ronald McDonald")).toBe("Ronald McDonald");
    expect(formatFullName("jordan McDonald")).toBe("Jordan McDonald");
  });

  test("capitalises after a hyphen", () => {
    expect(formatFullName("jean-luc picard")).toBe("Jean-Luc Picard");
  });

  test("capitalises after a straight or curly apostrophe", () => {
    expect(formatFullName("sean o'brien")).toBe("Sean O'Brien");
    expect(formatFullName("SEAN O’BRIEN")).toBe("Sean O’Brien");
    expect(formatFullName("jean-luc d'arcy")).toBe("Jean-Luc D'Arcy");
  });

  test("collapses and trims extra whitespace", () => {
    expect(formatFullName("  lalit   dev\tjakher  ")).toBe("Lalit Dev Jakher");
  });

  test("returns an empty string for empty or blank input", () => {
    expect(formatFullName("")).toBe("");
    expect(formatFullName("   ")).toBe("");
  });
});
