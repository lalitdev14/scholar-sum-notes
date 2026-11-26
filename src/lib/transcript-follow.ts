/**
 * "Transcript follows along": splits a transcript into short parts and estimates which part
 * is being played. Transcripts have no timestamps, so the position is estimated from the
 * share of the text (by characters) that matches the share of the recording played.
 */

export type TranscriptBlock =
  { kind: "heading"; text: string } | { kind: "paragraph"; parts: string[] };

/** Most words in one highlighted part (live transcripts often have no punctuation). */
const MAX_WORDS = 25;

/** Splits text into sentence-sized parts that join back into exactly the same text. */
export function splitParts(text: string): string[] {
  const words = text.match(/\S+\s*/g) ?? [];
  const lead = text.match(/^\s*/)?.[0] ?? "";
  const parts: string[] = [];
  let cur = lead;
  let count = 0;
  for (const w of words) {
    cur += w;
    count++;
    if (/[.!?…]["'”’)\]]?\s*$/.test(w) || count >= MAX_WORDS) {
      parts.push(cur);
      cur = "";
      count = 0;
    }
  }
  if (cur.trim()) parts.push(cur);
  else if (cur && parts.length) parts[parts.length - 1] += cur;
  return parts;
}

const HEADING = /^#{1,3}\s+/;

/** True for improved transcripts, which mark topics with "## Heading" lines. */
export function hasHeadings(text: string): boolean {
  return text.split(/\r?\n/).some((l) => HEADING.test(l.trim()));
}

/** Blocks for an improved transcript (headings + paragraphs split into parts). */
export function transcriptBlocks(text: string): TranscriptBlock[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) =>
      HEADING.test(line)
        ? { kind: "heading" as const, text: line.replace(HEADING, "") }
        : { kind: "paragraph" as const, parts: splitParts(line) },
    );
}

/**
 * Index of the part being played, for `ratio` (0…1) of the recording played. Parts are
 * weighted by their length in characters.
 */
export function activePartIndex(parts: readonly string[], ratio: number): number {
  if (!parts.length) return -1;
  const r = Math.min(1, Math.max(0, Number.isFinite(ratio) ? ratio : 0));
  const total = parts.reduce((n, p) => n + p.trim().length, 0);
  if (!total) return 0;
  const target = r * total;
  let sum = 0;
  for (let i = 0; i < parts.length; i++) {
    sum += parts[i]!.trim().length;
    if (target < sum) return i;
  }
  return parts.length - 1;
}

/** Share of the recording played; falls back to the saved length when the file has none. */
export function playbackRatio(currentTime: number, duration: number, fallbackSeconds?: number) {
  const total = Number.isFinite(duration) && duration > 0 ? duration : (fallbackSeconds ?? 0);
  if (!total) return 0;
  return Math.min(1, Math.max(0, currentTime / total));
}
