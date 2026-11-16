import { createElement, Fragment, useMemo, type ReactNode } from "react";
import { toEditorHtml } from "@/lib/note-format";

/** Formatting the notes editor produces. Anything else is dropped (its text is kept). */
const ALLOWED = new Set([
  "p",
  "br",
  "hr",
  "h1",
  "h2",
  "h3",
  "h4",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "del",
  "mark",
  "code",
  "pre",
  "blockquote",
  "ul",
  "ol",
  "li",
  "a",
  "sub",
  "sup",
  "span",
  "label",
  "input",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "div",
]);
const VOID = new Set(["br", "hr", "input"]);
const DROP = new Set(["script", "style", "iframe", "object", "embed", "svg", "math", "template"]);

function toReact(node: Node, key: number): ReactNode {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent;
  if (node.nodeType !== Node.ELEMENT_NODE) return null;
  const el = node as Element;
  const tag = el.tagName.toLowerCase();
  if (DROP.has(tag)) return null;
  const children = Array.from(el.childNodes).map(toReact);
  if (!ALLOWED.has(tag)) return createElement(Fragment, { key }, ...children);

  const props: Record<string, unknown> = { key };
  if (tag === "a") {
    const href = el.getAttribute("href") ?? "";
    if (/^(https?:|mailto:)/i.test(href)) props["href"] = href;
    props["target"] = "_blank";
    props["rel"] = "noreferrer noopener";
  }
  if (tag === "input") {
    // Checklist boxes: shown, never editable here.
    if (el.getAttribute("type") !== "checkbox") return null;
    props["type"] = "checkbox";
    props["checked"] = el.hasAttribute("checked");
    props["readOnly"] = true;
    props["disabled"] = true;
  }
  const align = (el as HTMLElement).style?.textAlign;
  if (align && /^(left|right|center|justify)$/.test(align)) props["style"] = { textAlign: align };
  if (el.getAttribute("data-type") === "taskList") props["data-type"] = "taskList";
  const checked = el.getAttribute("data-checked");
  if (checked === "true" || checked === "false") props["data-checked"] = checked;
  return VOID.has(tag) ? createElement(tag, props) : createElement(tag, props, ...children);
}

/** Shows a saved typed note read-only, keeping its formatting. */
export function SafeNoteHtml({ content, className }: { content: string; className?: string }) {
  const nodes = useMemo(() => {
    if (typeof window === "undefined") return null;
    const doc = new DOMParser().parseFromString(toEditorHtml(content), "text/html");
    return Array.from(doc.body.childNodes).map(toReact);
  }, [content]);
  return <div className={className}>{nodes}</div>;
}
