/**
 * Export a student's notes and/or AI summary to Word (.docx) or PDF, entirely in the
 * browser. Content is first turned into TipTap JSON (the editor's document model) so
 * both formats keep headings, bold/italic/underline/strike, colors, highlights, links,
 * bulleted/numbered/check lists, quotes and horizontal lines.
 * The docx and pdfmake libraries are loaded on demand to keep the page light.
 */
import { generateJSON, type JSONContent, type Extensions } from "@tiptap/core";
import { legacyToHtml, toEditorHtml } from "@/lib/note-format";
import type * as Docx from "docx";

export type ExportFormat = "docx" | "pdf";
export type ExportPart = "notes" | "summary" | "both";

export type ExportInput = {
  extensions: Extensions;
  subject: string;
  code: string;
  professor?: string | null;
  term?: string | null;
  notesHtml: string;
  summary: string;
  keyPoints: string[];
};

type Section = { title: string; doc: JSONContent };

function buildSections(input: ExportInput, part: ExportPart): Section[] {
  const sections: Section[] = [];
  if (part !== "summary") {
    sections.push({
      title: "My notes",
      doc: generateJSON(toEditorHtml(input.notesHtml) || "<p></p>", input.extensions),
    });
  }
  if (part !== "notes") {
    let html = legacyToHtml(input.summary);
    if (input.keyPoints.length) {
      const items = input.keyPoints.map((k) => `<li><p>${escape(k)}</p></li>`).join("");
      html += `<h2>Key takeaways</h2><ul>${items}</ul>`;
    }
    sections.push({ title: "AI summary", doc: generateJSON(html || "<p></p>", input.extensions) });
  }
  return sections;
}

/** Drops undefined values (the docx types reject explicit undefined under exactOptionalPropertyTypes). */
function clean<T extends Record<string, unknown>>(o: T): any {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
}

function escape(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** "#dc2626" or "rgb(220, 38, 38)" → "DC2626" (no #), or undefined. */
function toHex(color: unknown): string | undefined {
  if (typeof color !== "string") return undefined;
  const c = color.trim();
  const short = c.match(/^#([0-9a-f]{3})$/i);
  if (short)
    return short[1]!
      .split("")
      .map((x) => x + x)
      .join("")
      .toUpperCase();
  const hex = c.match(/^#([0-9a-f]{6})$/i);
  if (hex) return hex[1]!.toUpperCase();
  const rgb = c.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
  if (rgb)
    return [rgb[1], rgb[2], rgb[3]]
      .map((n) => Number(n).toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();
  return undefined;
}

function pxToPt(size: unknown): number | undefined {
  if (typeof size !== "string") return undefined;
  const n = parseFloat(size);
  return Number.isFinite(n) ? Math.round(n * 0.75 * 2) / 2 : undefined;
}

type Marks = {
  bold?: boolean | undefined;
  italic?: boolean | undefined;
  underline?: boolean | undefined;
  strike?: boolean | undefined;
  code?: boolean | undefined;
  color?: string | undefined;
  highlight?: string | undefined;
  sizePt?: number | undefined;
  href?: string | undefined;
};

function readMarks(node: JSONContent): Marks {
  const m: Marks = {};
  for (const mark of node.marks ?? []) {
    const a = (mark.attrs ?? {}) as Record<string, unknown>;
    if (mark.type === "bold") m.bold = true;
    else if (mark.type === "italic") m.italic = true;
    else if (mark.type === "underline") m.underline = true;
    else if (mark.type === "strike") m.strike = true;
    else if (mark.type === "code") m.code = true;
    else if (mark.type === "link" && typeof a["href"] === "string") m.href = a["href"];
    else if (mark.type === "highlight") m.highlight = toHex(a["color"]) ?? "FEF08A";
    else if (mark.type === "textStyle") {
      m.color = toHex(a["color"]) ?? m.color;
      m.sizePt = pxToPt(a["fontSize"]) ?? m.sizePt;
    }
  }
  return m;
}

function safeName(input: ExportInput, part: ExportPart, ext: string) {
  const what = part === "notes" ? "notes" : part === "summary" ? "summary" : "notes-and-summary";
  const base = `${input.code || "class"}-${input.subject || ""}-${what}`
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return `${base || "lectureloop-notes"}.${ext}`;
}

function metaLine(input: ExportInput) {
  const date = new Date().toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return [input.professor, input.term, `Exported ${date}`].filter(Boolean).join(" · ");
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// ---------------------------------------------------------------- DOCX

async function exportDocx(input: ExportInput, part: ExportPart) {
  const d = await import("docx");
  const { AlignmentType, BorderStyle, HeadingLevel, LevelFormat, ShadingType } = d;
  const sections = buildSections(input, part);
  let listInstance = 0;

  const align = (a: unknown) =>
    a === "center"
      ? AlignmentType.CENTER
      : a === "right"
        ? AlignmentType.RIGHT
        : a === "justify"
          ? AlignmentType.JUSTIFIED
          : undefined;

  const runs = (
    nodes: JSONContent[] | undefined,
    extra: Marks = {},
  ): (Docx.TextRun | Docx.ExternalHyperlink)[] => {
    const out: (Docx.TextRun | Docx.ExternalHyperlink)[] = [];
    for (const n of nodes ?? []) {
      if (n.type === "hardBreak") {
        out.push(new d.TextRun({ break: 1 }));
        continue;
      }
      if (n.type !== "text" || !n.text) continue;
      const m = { ...extra, ...readMarks(n) };
      const opts: Docx.IRunOptions = clean({
        text: n.text,
        bold: m.bold,
        italics: m.italic,
        underline: m.underline || m.href ? {} : undefined,
        strike: m.strike,
        color: m.href ? "1F4E9A" : m.color,
        size: m.sizePt ? m.sizePt * 2 : undefined,
        font: m.code ? "Consolas" : undefined,
        shading: m.highlight
          ? { type: ShadingType.CLEAR, color: "auto", fill: m.highlight }
          : undefined,
      });
      if (m.href)
        out.push(new d.ExternalHyperlink({ link: m.href, children: [new d.TextRun(opts)] }));
      else out.push(new d.TextRun(opts));
    }
    return out;
  };

  const blocks = (
    nodes: JSONContent[] | undefined,
    ctx: {
      list?: { kind: "bullet" | "ordered"; instance: number } | undefined;
      level: number;
      quote?: boolean | undefined;
    },
  ): Docx.Paragraph[] => {
    const out: Docx.Paragraph[] = [];
    for (const n of nodes ?? []) {
      const a = (n.attrs ?? {}) as Record<string, unknown>;
      const quote = ctx.quote
        ? {
            indent: { left: 360 },
            border: { left: { style: BorderStyle.SINGLE, size: 12, color: "CCCCCC", space: 8 } },
          }
        : {};
      switch (n.type) {
        case "paragraph":
          out.push(
            new d.Paragraph(
              clean({
                children: runs(n.content, ctx.quote ? { color: "555555" } : {}),
                alignment: align(a["textAlign"]),
                spacing: { after: 120 },
                ...quote,
              }),
            ),
          );
          break;
        case "heading": {
          const level = Number(a["level"]) || 2;
          out.push(
            new d.Paragraph(
              clean({
                children: runs(n.content),
                heading:
                  level === 1
                    ? HeadingLevel.HEADING_2
                    : level === 2
                      ? HeadingLevel.HEADING_3
                      : HeadingLevel.HEADING_4,
                alignment: align(a["textAlign"]),
                spacing: { before: 200, after: 100 },
              }),
            ),
          );
          break;
        }
        case "bulletList":
        case "orderedList":
        case "taskList": {
          const kind = n.type === "orderedList" ? "ordered" : "bullet";
          const instance = ++listInstance;
          for (const item of n.content ?? []) {
            const ia = (item.attrs ?? {}) as Record<string, unknown>;
            const [first, ...rest] = item.content ?? [];
            const prefix = n.type === "taskList" ? (ia["checked"] ? "☑ " : "☐ ") : "";
            const firstRuns = first?.type === "paragraph" ? runs(first.content) : [];
            out.push(
              new d.Paragraph(
                clean({
                  children: [...(prefix ? [new d.TextRun(prefix)] : []), ...firstRuns],
                  ...(n.type === "taskList"
                    ? { indent: { left: 360 + ctx.level * 360 } }
                    : kind === "ordered"
                      ? {
                          numbering: {
                            reference: "numbered",
                            level: Math.min(ctx.level, 5),
                            instance,
                          },
                        }
                      : { bullet: { level: Math.min(ctx.level, 5) } }),
                  spacing: { after: 60 },
                }),
              ),
            );
            const nested = first?.type === "paragraph" ? rest : item.content;
            out.push(
              ...blocks(nested, {
                level: ctx.level + 1,
                quote: ctx.quote,
                list: { kind, instance },
              }),
            );
          }
          break;
        }
        case "blockquote":
          out.push(...blocks(n.content, { ...ctx, quote: true }));
          break;
        case "codeBlock":
          out.push(
            new d.Paragraph(
              clean({
                children: runs(n.content, { code: true }),
                shading: { type: ShadingType.CLEAR, color: "auto", fill: "F3F4F6" },
              }),
            ),
          );
          break;
        case "horizontalRule":
          out.push(
            new d.Paragraph(
              clean({
                border: {
                  bottom: { style: BorderStyle.SINGLE, size: 6, color: "BBBBBB", space: 1 },
                },
                spacing: { after: 160 },
              }),
            ),
          );
          break;
        default:
          if (n.content) out.push(...blocks(n.content, ctx));
      }
    }
    return out;
  };

  const children: Docx.Paragraph[] = [
    new d.Paragraph(
      clean({ text: `${input.subject} (${input.code})`, heading: HeadingLevel.TITLE }),
    ),
    new d.Paragraph(
      clean({
        children: [new d.TextRun({ text: metaLine(input), color: "666666", size: 20 })],
        spacing: { after: 240 },
      }),
    ),
  ];
  for (const s of sections) {
    if (sections.length > 1)
      children.push(
        new d.Paragraph(
          clean({ text: s.title, heading: HeadingLevel.HEADING_1, spacing: { before: 240 } }),
        ),
      );
    children.push(...blocks(s.doc.content, { level: 0 }));
  }

  const doc = new d.Document({
    creator: "LectureLoop",
    title: `${input.subject} — ${part === "summary" ? "AI summary" : "notes"}`,
    styles: { default: { document: { run: { font: "Calibri", size: 22 } } } },
    numbering: {
      config: [
        {
          reference: "numbered",
          levels: [0, 1, 2, 3, 4, 5].map((level) => ({
            level,
            format: level % 2 === 0 ? LevelFormat.DECIMAL : LevelFormat.LOWER_LETTER,
            text: `%${level + 1}.`,
            alignment: AlignmentType.START,
            style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
          })),
        },
      ],
    },
    sections: [{ children }],
  });
  download(await d.Packer.toBlob(doc), safeName(input, part, "docx"));
}

// ---------------------------------------------------------------- PDF

async function exportPdf(input: ExportInput, part: ExportPart) {
  const pdfMake =
    ((await import("pdfmake/build/pdfmake")) as any).default ??
    (await import("pdfmake/build/pdfmake"));
  const vfs = ((await import("pdfmake/build/vfs_fonts")) as any).default;
  if (typeof pdfMake.addVirtualFileSystem === "function") pdfMake.addVirtualFileSystem(vfs);
  else pdfMake.vfs = vfs;

  const sections = buildSections(input, part);

  const inline = (nodes: JSONContent[] | undefined, extra: Marks = {}): any[] => {
    const out: any[] = [];
    for (const n of nodes ?? []) {
      if (n.type === "hardBreak") {
        out.push({ text: "\n" });
        continue;
      }
      if (n.type !== "text" || !n.text) continue;
      const m = { ...extra, ...readMarks(n) };
      const deco = [
        m.underline || m.href ? "underline" : null,
        m.strike ? "lineThrough" : null,
      ].filter(Boolean);
      out.push({
        text: n.text,
        bold: m.bold,
        italics: m.italic,
        decoration: deco.length === 1 ? deco[0] : deco.length ? deco : undefined,
        color: m.href ? "#1F4E9A" : m.color ? `#${m.color}` : undefined,
        background: m.highlight ? `#${m.highlight}` : undefined,
        fontSize: m.sizePt,
        link: m.href,
      });
    }
    return out.length ? out : [{ text: " " }];
  };

  const blocks = (nodes: JSONContent[] | undefined, quote = false): any[] => {
    const out: any[] = [];
    for (const n of nodes ?? []) {
      const a = (n.attrs ?? {}) as Record<string, unknown>;
      const alignment = ["center", "right", "justify"].includes(String(a["textAlign"]))
        ? String(a["textAlign"])
        : undefined;
      switch (n.type) {
        case "paragraph":
          out.push({
            text: inline(n.content, quote ? { color: "555555" } : {}),
            alignment,
            margin: [0, 0, 0, 6],
          });
          break;
        case "heading": {
          const level = Number(a["level"]) || 2;
          out.push({ text: inline(n.content), style: `h${Math.min(level, 3)}`, alignment });
          break;
        }
        case "bulletList":
        case "orderedList":
        case "taskList": {
          const items = (n.content ?? []).map((item) => {
            const ia = (item.attrs ?? {}) as Record<string, unknown>;
            const inner = blocks(item.content, quote);
            if (n.type === "taskList" && inner[0]?.text) {
              inner[0] = {
                ...inner[0],
                text: [{ text: ia["checked"] ? "[x] " : "[ ] ", bold: true }, ...inner[0].text],
              };
            }
            return { stack: inner.map((b: any) => ({ ...b, margin: [0, 0, 0, 2] })) };
          });
          if (n.type === "orderedList")
            out.push({ ol: items, start: Number(a["start"]) || 1, margin: [0, 0, 0, 6] });
          else if (n.type === "taskList") out.push({ stack: items, margin: [8, 0, 0, 6] });
          else out.push({ ul: items, margin: [0, 0, 0, 6] });
          break;
        }
        case "blockquote":
          out.push({
            table: {
              widths: [3, "*"],
              body: [[{ text: "", fillColor: "#CCCCCC" }, { stack: blocks(n.content, true) }]],
            },
            layout: "noBorders",
            margin: [0, 2, 0, 8],
          });
          break;
        case "codeBlock":
          out.push({
            table: {
              widths: ["*"],
              body: [[{ text: inline(n.content), fillColor: "#F3F4F6", fontSize: 10 }]],
            },
            layout: "noBorders",
            margin: [0, 2, 0, 8],
          });
          break;
        case "horizontalRule":
          out.push({
            canvas: [
              { type: "line", x1: 0, y1: 4, x2: 515, y2: 4, lineWidth: 0.5, lineColor: "#BBBBBB" },
            ],
            margin: [0, 4, 0, 10],
          });
          break;
        default:
          if (n.content) out.push(...blocks(n.content, quote));
      }
    }
    return out;
  };

  const content: any[] = [
    { text: `${input.subject} (${input.code})`, style: "title" },
    { text: metaLine(input), color: "#666666", fontSize: 9, margin: [0, 2, 0, 14] },
  ];
  sections.forEach((s, i) => {
    if (sections.length > 1)
      content.push({ text: s.title, style: "section", pageBreak: i > 0 ? "before" : undefined });
    content.push(...blocks(s.doc.content));
  });

  const docDefinition = {
    info: {
      title: `${input.subject} — ${part === "summary" ? "AI summary" : "notes"}`,
      creator: "LectureLoop",
    },
    pageMargins: [48, 48, 48, 56],
    footer: (page: number, pages: number) => ({
      text: `LectureLoop · ${page} / ${pages}`,
      alignment: "center",
      fontSize: 8,
      color: "#999999",
      margin: [0, 20, 0, 0],
    }),
    content,
    defaultStyle: { font: "Roboto", fontSize: 11, lineHeight: 1.3 },
    styles: {
      title: { fontSize: 20, bold: true },
      section: { fontSize: 15, bold: true, color: "#1F3A5F", margin: [0, 6, 0, 8] },
      h1: { fontSize: 16, bold: true, margin: [0, 10, 0, 4] },
      h2: { fontSize: 13.5, bold: true, margin: [0, 8, 0, 4] },
      h3: { fontSize: 12, bold: true, margin: [0, 6, 0, 3] },
    },
  };
  const pdf = pdfMake.createPdf(docDefinition);
  const blob: Blob = await new Promise((resolve, reject) => {
    let settled = false;
    const done = (b: Blob) => {
      if (!settled) {
        settled = true;
        resolve(b);
      }
    };
    try {
      // pdfmake 0.3 returns a promise from getBlob; older versions use a callback.
      const maybe = pdf.getBlob(done);
      if (maybe && typeof maybe.then === "function") maybe.then(done, reject);
    } catch (err) {
      reject(err);
    }
  });
  download(blob, safeName(input, part, "pdf"));
}

export async function exportNotes(input: ExportInput, format: ExportFormat, part: ExportPart) {
  if (format === "docx") return exportDocx(input, part);
  return exportPdf(input, part);
}
