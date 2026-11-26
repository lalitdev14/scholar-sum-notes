import { describe, expect, test } from "bun:test";
import {
  NYU_SCHOOLS,
  OTHER_PROGRAM,
  groupBySchool,
  programsFor,
  schoolById,
  schoolForCode,
} from "./nyu-schools";

const id = (code: string) => schoolForCode(code)?.id ?? null;

describe("schoolForCode", () => {
  test("Courant subjects win over CAS and GSAS", () => {
    expect(id("CSCI-GA 1170")).toBe("courant");
    expect(id("CSCI-UA 102")).toBe("courant");
    expect(id("MATH-UA 120")).toBe("courant");
    expect(id("MATH-GA 2010")).toBe("courant");
    expect(id("DS-GA 1001")).toBe("courant");
    expect(id("DS-UA 111")).toBe("courant");
  });

  test("other -UA and -GA subjects go to CAS and GSAS", () => {
    expect(id("ECON-UA 1")).toBe("cas");
    expect(id("HIST-GA 1000")).toBe("gsas");
  });

  test("IFA and ISAW subjects win over GSAS", () => {
    expect(id("FINH-GA 1000")).toBe("ifa");
    expect(id("FIAR-GA 2000")).toBe("ifa");
    expect(id("CONS-GA 1010")).toBe("ifa");
    expect(id("ISAW-GA 1000")).toBe("isaw");
  });

  test("suffix-based schools", () => {
    expect(id("ACCT-UB 1")).toBe("stern");
    expect(id("FINC-GB 2302")).toBe("stern");
    expect(id("CS-GY 6033")).toBe("tandon");
    expect(id("CS-UY 1114")).toBe("tandon");
    expect(id("APSY-UE 2")).toBe("steinhardt");
    expect(id("FMTV-UT 4")).toBe("tisch");
    expect(id("IDSEM-UG 1")).toBe("gallatin");
    expect(id("HTM-GC 1000")).toBe("sps");
    expect(id("XYZ-CE 9000")).toBe("sps");
    expect(id("SOCWK-GS 2001")).toBe("silver");
    expect(id("PADM-GP 2110")).toBe("wagner");
    expect(id("GPH-GU 2106")).toBe("gph");
    expect(id("NURSE-UN 1")).toBe("meyers");
    expect(id("DENT-DN 1")).toBe("dentistry");
    expect(id("MED-MD 1")).toBe("grossman");
    expect(id("MED-LI 1")).toBe("nyu-long-island");
    expect(id("LAW-LW 10001")).toBe("law");
    expect(id("CORE-UF 101")).toBe("liberal-studies");
    expect(id("CS-UH 1001")).toBe("abu-dhabi");
    expect(id("CSCI-SHU 101")).toBe("shanghai");
  });

  test("is case-insensitive and accepts a dot separator", () => {
    expect(id("csci-ga.1170")).toBe("courant");
    expect(id(" acct-ub 1")).toBe("stern");
  });

  test("unknown or malformed codes give null", () => {
    expect(id("ABC-ZZ 1")).toBe(null);
    expect(id("ALGORITHMS")).toBe(null);
    expect(id("")).toBe(null);
  });
});

describe("school table", () => {
  test("has at least 20 schools with unique ids and 1+ programs", () => {
    expect(NYU_SCHOOLS.length).toBeGreaterThanOrEqual(20);
    expect(new Set(NYU_SCHOOLS.map((s) => s.id)).size).toBe(NYU_SCHOOLS.length);
    for (const s of NYU_SCHOOLS) expect(s.programs.length).toBeGreaterThan(0);
  });

  test("programsFor ends with Other / undeclared; unknown school has none", () => {
    const p = programsFor("courant");
    expect(p.at(-1)).toBe(OTHER_PROGRAM);
    expect(p).toContain("Computer Science (MS)");
    expect(programsFor("nope")).toEqual([]);
    expect(schoolById(null)).toBe(null);
  });
});

describe("groupBySchool", () => {
  const rows = [
    { code: "ACCT-UB 1" },
    { code: "CSCI-GA 1170" },
    { code: "ABC-ZZ 1" },
    { code: "CSCI-UA 310" },
    { code: "ACCT-GB 6305" },
  ];

  test("own school first, others keep NYU's order with their school", () => {
    const g = groupBySchool(rows, "courant");
    expect(g.own.map((r) => r.code)).toEqual(["CSCI-GA 1170", "CSCI-UA 310"]);
    expect(g.other.map((o) => [o.item.code, o.school?.shortName ?? null])).toEqual([
      ["ACCT-UB 1", "Stern"],
      ["ABC-ZZ 1", null],
      ["ACCT-GB 6305", "Stern"],
    ]);
  });

  test("no school chosen or no match: everything in other", () => {
    expect(groupBySchool(rows, null).own).toEqual([]);
    expect(groupBySchool(rows, "law").other).toHaveLength(5);
  });
});
