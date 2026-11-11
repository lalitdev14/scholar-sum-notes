/**
 * Notes are stored as HTML produced by the rich-text editor (TipTap).
 * Older notes used a small markup ("**bold**", "*italic*", "## heading", "- item",
 * "1. item", "[color=red]…[/color]"). These helpers convert between formats and
 * work on both server and client (no DOM required).
 */

const LEGACY_COLORS: Record<string, string> = {
  primary: "#1f3a5f",
  red: "#dc2626",
  green: "#16a34a",
  amber: "#d97706",
  blue: "#2563eb",
};

/** True when the stored note is editor HTML rather than the legacy markup. */
export function isHtmlNote(content: string): boolean {
  return /^\s*<(p|h[1-6]|ul|ol|blockquote|pre|hr|div)[\s>/]/i.test(content);
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function legacyInline(text: string): string {
  let out = escapeHtml(text);
  out = out.replace(/\[color=([a-z]+)\]([\s\S]*?)\[\/color\]/g, (_m, c: string, inner: string) => {
    const css = LEGACY_COLORS[c];
    return css ? `<span style="color: ${css}">${inner}</span>` : inner;
  });
  // Unbalanced color tags (e.g. a tag split across lines) are dropped.
  out = out.replace(/\[\/?color(=[a-z]+)?\]/g, "");
  out = out.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, "$1<em>$2</em>");
  return out;
}

/** Converts legacy markup (or plain text) to editor HTML. */
export function legacyToHtml(text: string): string {
  if (!text.trim()) return "";
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let list: { tag: "ul" | "ol"; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    html.push(
      `<${list.tag}>${list.items.map((i) => `<li><p>${i}</p></li>`).join("")}</${list.tag}>`,
    );
    list = null;
  };
  for (const line of lines) {
    const bullet = line.match(/^\s*[-•*] (.*)$/);
    const numbered = line.match(/^\s*\d+[.)] (.*)$/);
    if (bullet || numbered) {
      const tag = bullet ? "ul" : "ol";
      if (!list || list.tag !== tag) {
        flush();
        list = { tag, items: [] };
      }
      list.items.push(legacyInline((bullet ?? numbered)?.[1] ?? ""));
      continue;
    }
    flush();
    const heading = line.match(/^(#{1,3}) (.*)$/);
    if (heading) {
      const level = Math.min(heading[1]!.length, 3);
      html.push(`<h${level}>${legacyInline(heading[2] ?? "")}</h${level}>`);
    } else if (line.trim()) {
      html.push(`<p>${legacyInline(line)}</p>`);
    } else {
      html.push("<p></p>");
    }
  }
  flush();
  return html.join("");
}

/** Normalises any stored note (HTML or legacy) to editor HTML. */
export function toEditorHtml(content: string): string {
  return isHtmlNote(content) ? content : legacyToHtml(content);
}

/** Plain text paragraphs → HTML paragraphs (used to append handwriting transcripts). */
export function plainTextToHtml(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => (line.trim() ? `<p>${escapeHtml(line)}</p>` : "<p></p>"))
    .join("");
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&");
}

/**
 * Readable plain text for AI prompts, previews and admin excerpts. Keeps structure:
 * headings become "## …", list items "- …" (or "[x] …" for checked tasks).
 */
export function noteToPlainText(content: string): string {
  if (!content) return "";
  if (!isHtmlNote(content)) {
    return content.replace(/\[color=[a-z]+\]|\[\/color\]/g, "").trim();
  }
  let s = content;
  s = s.replace(/<li[^>]*data-checked="true"[^>]*>/gi, "\n[x] ");
  s = s.replace(/<li[^>]*data-checked="false"[^>]*>/gi, "\n[ ] ");
  s = s.replace(/<li[^>]*>/gi, "\n- ");
  s = s.replace(/<h[1-6][^>]*>/gi, "\n## ");
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<\/(p|h[1-6]|blockquote|pre|ul|ol|div)>/gi, "\n");
  s = s.replace(/<hr[^>]*>/gi, "\n---\n");
  s = s.replace(/<[^>]+>/g, "");
  s = decodeEntities(s);
  // "- \n" artefacts from <li><p>…</p></li>
  s = s.replace(/(^|\n)(- |\[[x ]\] )\n+/g, "$1$2");
  return s
    .split("\n")
    .map((l) => l.replace(/\s+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\n\n(?=(- |\[[x ]\] ))/g, "\n")
    .trim();
}
