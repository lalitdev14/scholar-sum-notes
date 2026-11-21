#!/usr/bin/env node
// Builds test-evidence.xlsx for a requirement from test-cases.json, test-results.json, the
// screenshots in evidence/ and the audit trail. Usage: node scripts/req/evidence.mjs <folder>
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import ExcelJS from "exceljs";
import { readAudit } from "./audit.mjs";

const folder = process.argv[2];
if (!folder) {
  console.error("Usage: node scripts/req/evidence.mjs <requirement folder>");
  process.exit(1);
}
const read = (f) => JSON.parse(readFileSync(join(folder, f), "utf8"));
const cases = read("test-cases.json");
const results = new Map(read("test-results.json").map((r) => [r.id, r]));
const md = readFileSync(join(folder, "requirement.md"), "utf8");
const id = (md.match(/^# (REQ-[^:]+):/m) ?? [])[1] ?? folder.split("/").pop();
const title = (md.match(/^# REQ-[^:]+: (.+)$/m) ?? [])[1] ?? "";
// Acceptance criteria from section 5 only (the PM table below also mentions AC IDs).
const acSection = md.split(/^## 5\./m)[1]?.split(/^## 6\./m)[0] ?? "";
const acs = [...acSection.matchAll(/^\| (AC-\d+) +\| (.+?) *\|$/gm)].map((m) => ({
  id: m[1],
  text: m[2].trim(),
}));

const wb = new ExcelJS.Workbook();
wb.creator = "LectureLoop requirement process";
wb.created = new Date();
const HEAD = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2E2A5C" } };
const COLORS = { Pass: "FFD9F2D9", Fail: "FFF8D7D7", Blocked: "FFFFF1C2", "Not run": "FFEDEDED" };
const header = (ws) => {
  const r = ws.getRow(1);
  r.font = { bold: true, color: { argb: "FFFFFFFF" } };
  r.fill = HEAD;
  r.alignment = { vertical: "middle", wrapText: true };
  r.height = 22;
  ws.views = [{ state: "frozen", ySplit: 1 }];
};

// --- Summary
const counts = { Pass: 0, Fail: 0, Blocked: 0, "Not run": 0 };
for (const c of cases) counts[results.get(c.id)?.result ?? "Not run"]++;
const sum = wb.addWorksheet("Summary");
sum.columns = [{ width: 28 }, { width: 70 }];
sum.addRows([
  ["Requirement", `${id}: ${title}`],
  ["Generated (UTC)", new Date().toISOString().replace(/\.\d+Z$/, "Z")],
  ["Test cases", cases.length],
  ["Pass", counts.Pass],
  ["Fail", counts.Fail],
  ["Blocked", counts.Blocked],
  ["Not run", counts["Not run"]],
  [],
  ["Acceptance criterion", "Covered by test cases (result)"],
]);
sum.getColumn(1).font = { bold: true };
sum.getRow(9).font = { bold: true, color: { argb: "FFFFFFFF" } };
sum.getRow(9).fill = HEAD;
for (const ac of acs) {
  const tcs = cases.filter((c) => (c.ac ?? []).includes(ac.id));
  sum.addRow([
    `${ac.id}: ${ac.text}`,
    tcs.length
      ? tcs.map((c) => `${c.id} (${results.get(c.id)?.result ?? "Not run"})`).join(", ")
      : "NOT COVERED",
  ]);
}
sum.eachRow((r) => (r.alignment = { wrapText: true, vertical: "top" }));

// --- Test cases & evidence
const ws = wb.addWorksheet("Test cases & evidence");
ws.columns = [
  { header: "Test case", key: "id", width: 10 },
  { header: "Acceptance criteria", key: "ac", width: 14 },
  { header: "Title", key: "title", width: 30 },
  { header: "Type", key: "type", width: 12 },
  { header: "Priority", key: "priority", width: 9 },
  { header: "Preconditions", key: "pre", width: 24 },
  { header: "Steps", key: "steps", width: 40 },
  { header: "Expected result", key: "expected", width: 32 },
  { header: "Actual result", key: "actual", width: 32 },
  { header: "Result", key: "result", width: 9 },
  { header: "Environment", key: "env", width: 20 },
  { header: "Tested at (UTC)", key: "at", width: 20 },
  { header: "Evidence files", key: "files", width: 26 },
  { header: "Evidence (screenshot)", key: "shot", width: 48 },
];
header(ws);
const SHOT_H = 200; // px
cases.forEach((c, i) => {
  const r = results.get(c.id) ?? {};
  const row = ws.addRow({
    id: c.id,
    ac: (c.ac ?? []).join(", "),
    title: c.title,
    type: c.type ?? "",
    priority: c.priority ?? "",
    pre: c.preconditions ?? "",
    steps: (c.steps ?? []).map((s, n) => `${n + 1}. ${s}`).join("\n"),
    expected: c.expected ?? "",
    actual: r.actual ?? "",
    result: r.result ?? "Not run",
    env: r.environment ?? "",
    at: r.testedAt ?? "",
    files: (r.evidence ?? []).join("\n"),
  });
  row.alignment = { wrapText: true, vertical: "top" };
  row.getCell("result").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: COLORS[r.result ?? "Not run"] ?? COLORS["Not run"] },
  };
  row.getCell("result").font = { bold: true };
  const first = (r.evidence ?? []).find(
    (f) => /\.(png|jpe?g)$/i.test(f) && existsSync(join(folder, f)),
  );
  if (first) {
    row.height = SHOT_H * 0.75 + 8;
    const img = wb.addImage({
      filename: join(folder, first),
      extension: extname(first).slice(1).toLowerCase().replace("jpg", "jpeg"),
    });
    ws.addImage(img, {
      tl: { col: 13, row: i + 1 },
      ext: { width: 330, height: SHOT_H },
      editAs: "oneCell",
    });
  }
});

// --- Audit trail
const au = wb.addWorksheet("Audit trail");
au.columns = [
  { header: "Time (UTC)", key: "time", width: 22 },
  { header: "Role", key: "role", width: 22 },
  { header: "Action", key: "action", width: 28 },
  { header: "Details", key: "details", width: 80 },
];
header(au);
for (const a of readAudit(folder)) au.addRow(a).alignment = { wrapText: true, vertical: "top" };

const out = join(folder, "test-evidence.xlsx");
await wb.xlsx.writeFile(out);
console.log(
  `${out}: ${cases.length} test cases (${counts.Pass} pass, ${counts.Fail} fail, ${counts.Blocked} blocked, ${counts["Not run"]} not run)`,
);
