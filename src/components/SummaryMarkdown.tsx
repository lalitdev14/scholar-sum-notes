import type { ReactNode } from "react";

// Renders the AI summary's lightweight markup: "## heading", "- item", "1. item",
// "**bold**", "*italic*" (and legacy "[color=x]…[/color]").
const COLORS: Record<string, string> = {
  primary: "var(--primary)",
  red: "var(--destructive)",
  green: "var(--chart-2)",
  amber: "var(--chart-4)",
  blue: "var(--chart-1)",
};
const colorCss = (id: string) => COLORS[id] ?? "inherit";

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\[color=([a-z]+)\]([\s\S]*?)\[\/color\]|\*\*(.+?)\*\*|\*(.+?)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${key}-${i++}`;
    if (m[1])
      out.push(
        <span key={k} style={{ color: colorCss(m[1]) }}>
          {inline(m[2] ?? "", k)}
        </span>,
      );
    else if (m[3]) out.push(<strong key={k}>{inline(m[3] ?? "", k)}</strong>);
    else out.push(<em key={k}>{inline(m[4] ?? "", k)}</em>);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function renderNote(text: string): ReactNode {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const k = `l${blocks.length}`;
    const items = list.items.map((it, i) => <li key={i}>{inline(it, `${k}-${i}`)}</li>);
    blocks.push(
      list.ordered ? (
        <ol key={k} className="ml-6 list-decimal">
          {items}
        </ol>
      ) : (
        <ul key={k} className="ml-6 list-disc">
          {items}
        </ul>
      ),
    );
    list = null;
  };
  lines.forEach((line, i) => {
    const b = line.match(/^- (.*)$/);
    const n = line.match(/^\d+\. (.*)$/);
    if (b || n) {
      const ordered = Boolean(n);
      if (!list || list.ordered !== ordered) {
        flush();
        list = { ordered, items: [] };
      }
      list.items.push((b ?? n)?.[1] ?? "");
      return;
    }
    flush();
    const h = line.match(/^#{1,3} (.*)$/);
    if (h)
      blocks.push(
        <h3 key={i} className="mt-3 text-xl font-bold">
          {inline(h[1] ?? "", `h${i}`)}
        </h3>,
      );
    else if (!line.trim()) blocks.push(<div key={i} className="h-3" />);
    else blocks.push(<p key={i}>{inline(line, `p${i}`)}</p>);
  });
  flush();
  return blocks;
}
