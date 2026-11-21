#!/usr/bin/env node
// Appends a row to a requirement's audit trail (requirement.md, section "Audit trail").
// Usage: node scripts/req/audit.mjs <requirement folder> "<Role>" "<Action>" "<Details>"
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function appendAudit(folder, role, action, details = "") {
  const file = join(folder, "requirement.md");
  const md = readFileSync(file, "utf8");
  const clean = (s) => String(s).replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
  const time = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  const row = `| ${time} | ${clean(role)} | ${clean(action)} | ${clean(details)} |`;
  // Header row followed by a separator row (compact or padded by prettier).
  if (!/\| Time \(UTC\) +\| Role +\| Action +\| Details +\|\s*\n\|[-| ]+\|/.test(md))
    throw new Error(`No audit trail table in ${file}`);
  // Insert after the last row of the audit table (the table ends the file).
  const out = md.replace(/\s*$/, "") + "\n" + row + "\n";
  writeFileSync(file, out);
  return row;
}

/** Audit rows as objects (for the Excel file). */
export function readAudit(folder) {
  const md = readFileSync(join(folder, "requirement.md"), "utf8");
  const start = md.search(/\| Time \(UTC\) +\| Role/);
  if (start < 0) return [];
  return md
    .slice(start)
    .split("\n")
    .slice(2)
    .filter((l) => l.startsWith("| "))
    .map((l) => {
      const cells = l
        .slice(2, -2)
        .split(/(?<!\\)\s\|\s/)
        .map((c) => c.replace(/\\\|/g, "|").trim());
      return { time: cells[0], role: cells[1], action: cells[2], details: cells[3] ?? "" };
    });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [folder, role, action, details] = process.argv.slice(2);
  if (!folder || !role || !action) {
    console.error('Usage: node scripts/req/audit.mjs <folder> "<Role>" "<Action>" "<Details>"');
    process.exit(1);
  }
  console.log(appendAudit(folder, role, action, details));
}
