import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Bold, Eye, Heading2, Italic, List, ListOrdered, Palette, Pencil, Redo2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const COLORS = [
  { id: "primary", label: "Theme", css: "var(--primary)" },
  { id: "red", label: "Red", css: "var(--destructive)" },
  { id: "green", label: "Green", css: "var(--chart-2)" },
  { id: "amber", label: "Amber", css: "var(--chart-4)" },
  { id: "blue", label: "Blue", css: "var(--chart-1)" },
] as const;
const colorCss = (id: string) => COLORS.find((c) => c.id === id)?.css ?? "inherit";

type Props = { value: string; onChange: (v: string) => void; placeholder?: string };

export function NoteEditor({ value, onChange, placeholder }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const history = useRef<string[]>([value]);
  const index = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, force] = useState(0);
  const [preview, setPreview] = useState(false);

  // Sync history when content is replaced from outside (loaded note, handwriting).
  useEffect(() => {
    if (history.current[index.current] !== value && !timer.current) {
      push(value);
    }
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  function push(v: string) {
    if (history.current[index.current] === v) return;
    history.current = history.current.slice(0, index.current + 1).concat(v).slice(-200);
    index.current = history.current.length - 1;
    force((n) => n + 1);
  }

  function change(v: string, immediate = false) {
    onChange(v);
    if (timer.current) clearTimeout(timer.current);
    const bigDelete = value.length - v.length > 1;
    if (immediate || bigDelete) {
      timer.current = null;
      push(value === history.current[index.current] ? v : value);
      if (value !== history.current[index.current]) push(v);
      return;
    }
    timer.current = setTimeout(() => {
      timer.current = null;
      push(v);
    }, 500);
  }

  const undo = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
      push(value);
    }
    if (index.current === 0) return;
    index.current -= 1;
    onChange(history.current[index.current]);
    force((n) => n + 1);
  }, [value, onChange]); // eslint-disable-line react-hooks/exhaustive-deps

  const redo = useCallback(() => {
    if (index.current >= history.current.length - 1) return;
    index.current += 1;
    onChange(history.current[index.current]);
    force((n) => n + 1);
  }, [onChange]);

  function restore(start: number, end: number) {
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(start, end);
    });
  }

  function wrap(before: string, after = before) {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    const sel = value.slice(s, e) || "text";
    change(value.slice(0, s) + before + sel + after + value.slice(e), true);
    restore(s + before.length, s + before.length + sel.length);
  }

  function prefixLines(kind: "bullet" | "number" | "heading") {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    const lineStart = value.lastIndexOf("\n", s - 1) + 1;
    const nextNl = value.indexOf("\n", e);
    const lineEnd = nextNl === -1 ? value.length : nextNl;
    const lines = value.slice(lineStart, lineEnd).split("\n");
    const re = kind === "bullet" ? /^- / : kind === "number" ? /^\d+\. / : /^## /;
    const allHave = lines.every((l) => re.test(l));
    const out = lines
      .map((l, i) => {
        const clean = l.replace(/^(- |\d+\. |## )/, "");
        if (allHave) return clean;
        return (kind === "bullet" ? "- " : kind === "number" ? `${i + 1}. ` : "## ") + clean;
      })
      .join("\n");
    change(value.slice(0, lineStart) + out + value.slice(lineEnd), true);
    restore(lineStart, lineStart + out.length);
  }

  function onKeyDown(ev: React.KeyboardEvent<HTMLTextAreaElement>) {
    const mod = ev.metaKey || ev.ctrlKey;
    const k = ev.key.toLowerCase();
    if (mod && k === "z") {
      ev.preventDefault();
      if (ev.shiftKey) redo();
      else undo();
    } else if (mod && k === "y") {
      ev.preventDefault();
      redo();
    } else if (mod && k === "b") {
      ev.preventDefault();
      wrap("**");
    } else if (mod && k === "i") {
      ev.preventDefault();
      wrap("*");
    } else if (ev.key === "Enter" && !ev.shiftKey) {
      const el = ev.currentTarget;
      const s = el.selectionStart;
      if (s !== el.selectionEnd) return;
      const lineStart = value.lastIndexOf("\n", s - 1) + 1;
      const line = value.slice(lineStart, s);
      const m = line.match(/^(- |(\d+)\. )(.*)$/);
      if (!m) return;
      ev.preventDefault();
      if (!m[3].trim()) {
        change(value.slice(0, lineStart) + value.slice(s), true);
        restore(lineStart, lineStart);
        return;
      }
      const marker = m[2] ? `${Number(m[2]) + 1}. ` : "- ";
      const insert = "\n" + marker;
      change(value.slice(0, s) + insert + value.slice(s), true);
      restore(s + insert.length, s + insert.length);
    }
  }

  const canUndo = index.current > 0 || timer.current !== null;
  const canRedo = index.current < history.current.length - 1;

  const tool = (label: string, icon: ReactNode, onClick: () => void, disabled = false) => (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-8 w-8"
      aria-label={label}
      title={label}
      disabled={disabled || preview}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {icon}
    </Button>
  );

  return (
    <div className="rounded-md border border-input">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border px-1 py-1" role="toolbar" aria-label="Formatting">
        {tool("Undo (Ctrl+Z)", <Undo2 className="h-4 w-4" />, undo, !canUndo)}
        {tool("Redo (Ctrl+Shift+Z)", <Redo2 className="h-4 w-4" />, redo, !canRedo)}
        <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
        {tool("Bold (Ctrl+B)", <Bold className="h-4 w-4" />, () => wrap("**"))}
        {tool("Italic (Ctrl+I)", <Italic className="h-4 w-4" />, () => wrap("*"))}
        {tool("Heading", <Heading2 className="h-4 w-4" />, () => prefixLines("heading"))}
        <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
        {tool("Bullet list", <List className="h-4 w-4" />, () => prefixLines("bullet"))}
        {tool("Numbered list", <ListOrdered className="h-4 w-4" />, () => prefixLines("number"))}
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Font colour" title="Font colour" disabled={preview} onMouseDown={(e) => e.preventDefault()}>
              <Palette className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2" onOpenAutoFocus={(e) => e.preventDefault()}>
            <div className="flex gap-2">
              {COLORS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  aria-label={`${c.label} text`}
                  title={c.label}
                  className="h-7 w-7 rounded-full border border-border"
                  style={{ background: c.css }}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => wrap(`[color=${c.id}]`, "[/color]")}
                />
              ))}
            </div>
          </PopoverContent>
        </Popover>
        <div className="ml-auto">
          <Button type="button" variant="ghost" size="sm" className="h-8" onClick={() => setPreview((p) => !p)}>
            {preview ? <Pencil className="mr-1.5 h-4 w-4" /> : <Eye className="mr-1.5 h-4 w-4" />}
            {preview ? "Edit" : "Preview"}
          </Button>
        </div>
      </div>
      {preview ? (
        <div className="min-h-[420px] px-3 py-2 text-base leading-relaxed">
          {value.trim() ? renderNote(value) : <p className="text-muted-foreground">Nothing written yet.</p>}
        </div>
      ) : (
        <Textarea
          ref={ref}
          value={value}
          onChange={(e) => change(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className="min-h-[420px] resize-none rounded-none border-0 bg-transparent text-base leading-relaxed shadow-none focus-visible:ring-0 md:text-base"
        />
      )}
    </div>
  );
}

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\[color=([a-z]+)\]([\s\S]*?)\[\/color\]|\*\*(.+?)\*\*|\*(.+?)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${key}-${i++}`;
    if (m[1]) out.push(<span key={k} style={{ color: colorCss(m[1]) }}>{inline(m[2], k)}</span>);
    else if (m[3]) out.push(<strong key={k}>{inline(m[3], k)}</strong>);
    else out.push(<em key={k}>{inline(m[4], k)}</em>);
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
    blocks.push(list.ordered ? <ol key={k} className="ml-6 list-decimal">{items}</ol> : <ul key={k} className="ml-6 list-disc">{items}</ul>);
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
      list.items.push((b ?? n)![1]);
      return;
    }
    flush();
    const h = line.match(/^## (.*)$/);
    if (h) blocks.push(<h3 key={i} className="mt-3 text-xl font-bold">{inline(h[1], `h${i}`)}</h3>);
    else if (!line.trim()) blocks.push(<div key={i} className="h-3" />);
    else blocks.push(<p key={i}>{inline(line, `p${i}`)}</p>);
  });
  flush();
  return blocks;
}
