import { useEffect, useState, type ReactNode } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Color, FontSize, TextStyle } from "@tiptap/extension-text-style";
import Highlight from "@tiptap/extension-highlight";
import TextAlign from "@tiptap/extension-text-align";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { CharacterCount, Placeholder } from "@tiptap/extensions";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Baseline,
  Bold,
  Highlighter,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  RemoveFormatting,
  Strikethrough,
  Underline as UnderlineIcon,
  Undo2,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toEditorHtml } from "@/lib/note-format";

/** The document schema used by the editor (also used to export notes to Word/PDF). */
export function noteContentExtensions() {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      link: { openOnClick: false, autolink: true, defaultProtocol: "https" },
    }),
    TextStyle,
    Color,
    FontSize,
    Highlight.configure({ multicolor: true }),
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    TaskList,
    TaskItem.configure({ nested: true }),
  ];
}

type Props = { value: string; onChange: (html: string) => void; placeholder?: string };

const TEXT_COLORS = [
  "#000000",
  "#434343",
  "#666666",
  "#999999",
  "#dc2626",
  "#ea580c",
  "#d97706",
  "#16a34a",
  "#0d9488",
  "#2563eb",
  "#7c3aed",
  "#db2777",
];
const HIGHLIGHTS = ["#fef08a", "#bbf7d0", "#bfdbfe", "#fbcfe8", "#fed7aa", "#e9d5ff"];
const FONT_SIZES = ["12", "14", "16", "18", "20", "24", "30", "36"];

export function NoteEditor({ value, onChange, placeholder }: Props) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      ...noteContentExtensions(),
      Placeholder.configure({ placeholder: placeholder ?? "Start typing…" }),
      CharacterCount,
    ],
    content: toEditorHtml(value),
    editorProps: {
      attributes: {
        class: "note-doc min-h-full px-5 py-4 focus:outline-none",
        spellcheck: "true",
        "aria-label": "Note editor",
      },
    },
    onUpdate: ({ editor }) => onChange(editor.isEmpty ? "" : editor.getHTML()),
  });

  // Content replaced from outside (note loaded, handwriting appended): sync into the editor.
  useEffect(() => {
    if (!editor) return;
    const current = editor.isEmpty ? "" : editor.getHTML();
    if (value !== current) {
      editor.commands.setContent(toEditorHtml(value), { emitUpdate: false });
    }
  }, [editor, value]);

  return (
    // Fixed-height document: the toolbar and word count stay put, only the text scrolls.
    <div className="mt-3 flex h-[clamp(420px,62vh,760px)] flex-col overflow-hidden rounded-lg border border-border bg-background">
      <div className="shrink-0">
        {editor ? (
          <Toolbar editor={editor} />
        ) : (
          <div className="h-11 border-b border-border bg-muted/40" />
        )}
      </div>
      <div
        className="min-h-0 flex-1 cursor-text overflow-y-auto overscroll-contain"
        data-testid="note-scroll"
        onMouseDown={(e) => {
          // Clicking the empty area below the text puts the caret at the end.
          if (e.target === e.currentTarget && editor) {
            e.preventDefault();
            editor.commands.focus("end");
          }
        }}
      >
        <EditorContent editor={editor} />
      </div>
      {editor && (
        <div className="shrink-0">
          <WordCount editor={editor} />
        </div>
      )}
    </div>
  );
}

function WordCount({ editor }: { editor: Editor }) {
  const words = useEditorState({
    editor,
    selector: ({ editor: e }) => e.storage.characterCount.words() as number,
  });
  return (
    <div className="border-t border-border bg-muted/30 px-4 py-1.5 text-right text-xs text-muted-foreground">
      {words} word{words === 1 ? "" : "s"}
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
      block: e.isActive("heading", { level: 1 })
        ? "h1"
        : e.isActive("heading", { level: 2 })
          ? "h2"
          : e.isActive("heading", { level: 3 })
            ? "h3"
            : "p",
      fontSize: ((e.getAttributes("textStyle")["fontSize"] as string | undefined) ?? "").replace(
        "px",
        "",
      ),
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      color: (e.getAttributes("textStyle")["color"] as string | undefined) ?? "",
      highlight: e.isActive("highlight"),
      link: e.isActive("link"),
      align: e.isActive({ textAlign: "center" })
        ? "center"
        : e.isActive({ textAlign: "right" })
          ? "right"
          : e.isActive({ textAlign: "justify" })
            ? "justify"
            : "left",
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      task: e.isActive("taskList"),
      quote: e.isActive("blockquote"),
      inList: e.isActive("listItem") || e.isActive("taskItem"),
    }),
  });

  const chain = () => editor.chain().focus();
  const listItemType = s.task ? "taskItem" : "listItem";

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className="flex flex-wrap items-center gap-0.5 border-b border-border bg-muted/40 px-2 py-1.5"
    >
      <Tool label="Undo (Ctrl+Z)" onClick={() => chain().undo().run()} disabled={!s.canUndo}>
        <Undo2 />
      </Tool>
      <Tool label="Redo (Ctrl+Y)" onClick={() => chain().redo().run()} disabled={!s.canRedo}>
        <Redo2 />
      </Tool>
      <Divider />

      <select
        aria-label="Text style"
        className="h-8 rounded-md border border-transparent bg-transparent px-2 text-sm hover:bg-accent focus:border-ring focus:outline-none"
        value={s.block}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "p") chain().setParagraph().run();
          else
            chain()
              .setHeading({ level: Number(v.slice(1)) as 1 | 2 | 3 })
              .run();
        }}
      >
        <option value="p">Normal text</option>
        <option value="h1">Heading 1</option>
        <option value="h2">Heading 2</option>
        <option value="h3">Heading 3</option>
      </select>

      <select
        aria-label="Font size"
        className="h-8 w-[4.25rem] rounded-md border border-transparent bg-transparent px-1 text-sm hover:bg-accent focus:border-ring focus:outline-none"
        value={s.fontSize}
        onChange={(e) => {
          const v = e.target.value;
          if (!v) chain().unsetFontSize().run();
          else chain().setFontSize(`${v}px`).run();
        }}
      >
        <option value="">Size</option>
        {FONT_SIZES.map((size) => (
          <option key={size} value={size}>
            {size}
          </option>
        ))}
      </select>
      <Divider />

      <Tool label="Bold (Ctrl+B)" active={s.bold} onClick={() => chain().toggleBold().run()}>
        <Bold />
      </Tool>
      <Tool label="Italic (Ctrl+I)" active={s.italic} onClick={() => chain().toggleItalic().run()}>
        <Italic />
      </Tool>
      <Tool
        label="Underline (Ctrl+U)"
        active={s.underline}
        onClick={() => chain().toggleUnderline().run()}
      >
        <UnderlineIcon />
      </Tool>
      <Tool label="Strikethrough" active={s.strike} onClick={() => chain().toggleStrike().run()}>
        <Strikethrough />
      </Tool>

      <Swatches
        editor={editor}
        label="Text color"
        icon={<Baseline style={{ color: s.color || undefined }} />}
        colors={TEXT_COLORS}
        onPick={(c) => chain().setColor(c).run()}
        onClear={() => chain().unsetColor().run()}
        clearLabel="Default color"
      />
      <Swatches
        editor={editor}
        label="Highlight color"
        icon={<Highlighter />}
        active={s.highlight}
        colors={HIGHLIGHTS}
        onPick={(c) => chain().setHighlight({ color: c }).run()}
        onClear={() => chain().unsetHighlight().run()}
        clearLabel="No highlight"
      />
      <LinkTool editor={editor} active={s.link} />
      <Divider />

      <Tool
        label="Align left"
        active={s.align === "left"}
        onClick={() => chain().setTextAlign("left").run()}
      >
        <AlignLeft />
      </Tool>
      <Tool
        label="Align center"
        active={s.align === "center"}
        onClick={() => chain().setTextAlign("center").run()}
      >
        <AlignCenter />
      </Tool>
      <Tool
        label="Align right"
        active={s.align === "right"}
        onClick={() => chain().setTextAlign("right").run()}
      >
        <AlignRight />
      </Tool>
      <Tool
        label="Justify"
        active={s.align === "justify"}
        onClick={() => chain().setTextAlign("justify").run()}
      >
        <AlignJustify />
      </Tool>
      <Divider />

      <Tool
        label="Bulleted list"
        active={s.bullet}
        onClick={() => chain().toggleBulletList().run()}
      >
        <List />
      </Tool>
      <Tool
        label="Numbered list"
        active={s.ordered}
        onClick={() => chain().toggleOrderedList().run()}
      >
        <ListOrdered />
      </Tool>
      <Tool label="Checklist" active={s.task} onClick={() => chain().toggleTaskList().run()}>
        <ListChecks />
      </Tool>
      <Tool
        label="Decrease indent"
        disabled={!s.inList}
        onClick={() => chain().liftListItem(listItemType).run()}
      >
        <IndentDecrease />
      </Tool>
      <Tool
        label="Increase indent"
        disabled={!s.inList}
        onClick={() => chain().sinkListItem(listItemType).run()}
      >
        <IndentIncrease />
      </Tool>
      <Divider />

      <Tool label="Quote" active={s.quote} onClick={() => chain().toggleBlockquote().run()}>
        <Quote />
      </Tool>
      <Tool label="Horizontal line" onClick={() => chain().setHorizontalRule().run()}>
        <Minus />
      </Tool>
      <Tool label="Clear formatting" onClick={() => chain().unsetAllMarks().clearNodes().run()}>
        <RemoveFormatting />
      </Tool>
    </div>
  );
}

function Tool({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-md text-foreground/80 transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-35 [&_svg]:size-4",
        active && "bg-primary/10 text-primary",
      )}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />;
}

function Swatches({
  editor,
  label,
  icon,
  active,
  colors,
  onPick,
  onClear,
  clearLabel,
}: {
  editor: Editor;
  label: string;
  icon: ReactNode;
  active?: boolean;
  colors: string[];
  onPick: (color: string) => void;
  onClear: () => void;
  clearLabel: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={label}
          aria-label={label}
          onMouseDown={(e) => e.preventDefault()}
          className={cn(
            "inline-flex h-8 w-8 items-center justify-center rounded-md text-foreground/80 hover:bg-accent [&_svg]:size-4",
            active && "bg-primary/10 text-primary",
          )}
        >
          {icon}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-2"
        // Keep keyboard focus in the document the whole time: opening, picking and
        // closing the palette never move the caret, so no keystrokes are lost.
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <div className="grid grid-cols-6 gap-1.5">
          {colors.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`${label} ${c}`}
              title={c}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onPick(c);
                setOpen(false);
              }}
              className="h-6 w-6 rounded-full border border-border transition-transform hover:scale-110"
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            onClear();
            setOpen(false);
          }}
          className="mt-2 w-full rounded-md px-2 py-1 text-left text-xs text-muted-foreground hover:bg-accent"
        >
          {clearLabel}
        </button>
      </PopoverContent>
    </Popover>
  );
}

function LinkTool({ editor, active }: { editor: Editor; active: boolean }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setUrl((editor.getAttributes("link")["href"] as string | undefined) ?? "");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Insert link"
          aria-label="Insert link"
          onMouseDown={(e) => e.preventDefault()}
          className={cn(
            "inline-flex h-8 w-8 items-center justify-center rounded-md text-foreground/80 hover:bg-accent [&_svg]:size-4",
            active && "bg-primary/10 text-primary",
          )}
        >
          <Link2 />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-72 p-3"
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          editor.commands.focus();
        }}
      >
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const href = url.trim();
            const c = editor.chain().focus().extendMarkRange("link");
            if (href) c.setLink({ href }).run();
            else c.unsetLink().run();
            setOpen(false);
          }}
        >
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste a link"
            className="h-8"
            autoFocus
          />
          <Button type="submit" size="sm">
            Apply
          </Button>
        </form>
        {active && (
          <button
            type="button"
            className="mt-2 text-xs text-destructive hover:underline"
            onClick={() => {
              editor.chain().focus().extendMarkRange("link").unsetLink().run();
              setOpen(false);
            }}
          >
            Remove link
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
