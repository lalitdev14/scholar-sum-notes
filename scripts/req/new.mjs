#!/usr/bin/env node
// Starts a requirement: docs/requirements/REQ-<date>-<slug>/ from the template, with the
// first audit row. Usage: node scripts/req/new.mjs "<title>" ["<request in the user's words>"]
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { appendAudit } from "./audit.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const [title, request = ""] = process.argv.slice(2);
if (!title) {
  console.error('Usage: node scripts/req/new.mjs "<title>" ["<request>"]');
  process.exit(1);
}
const date = new Date().toISOString().slice(0, 10);
const slug = title
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "")
  .slice(0, 40);
const id = `REQ-${date}-${slug}`;
const folder = join(root, "docs", "requirements", id);
if (existsSync(folder)) {
  console.error(`${folder} already exists`);
  process.exit(1);
}
mkdirSync(join(folder, "evidence"), { recursive: true });
const tpl = readFileSync(join(root, "docs", "requirements", "_template", "requirement.md"), "utf8");
writeFileSync(
  join(folder, "requirement.md"),
  tpl
    .replaceAll("{{ID}}", id)
    .replaceAll("{{TITLE}}", title)
    .replaceAll("{{SLUG}}", slug)
    .replaceAll("{{DATE}}", date)
    .replaceAll("{{REQUESTER}}", "Product owner")
    .replaceAll("{{REQUEST}}", request || title),
);
writeFileSync(join(folder, "test-cases.json"), "[]\n");
writeFileSync(join(folder, "test-results.json"), "[]\n");
writeFileSync(join(folder, "evidence", ".gitkeep"), "");
appendAudit(folder, "Requirement analyst", "Requirement created", title);
console.log(folder);
