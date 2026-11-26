import { useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";
import { prefersReducedMotion } from "@/lib/motion";
import {
  activePartIndex,
  hasHeadings,
  splitParts,
  transcriptBlocks,
} from "@/lib/transcript-follow";

/**
 * A lecture transcript. Improved transcripts mark topics with "## Heading" lines and separate
 * paragraphs with blank lines; live transcripts are shown as they are.
 *
 * With `progress` (0…1, the share of the saved recording played) the part being played is
 * highlighted and kept in view. Without timestamps the position is estimated from the text.
 */
export function TranscriptText({
  text,
  className,
  progress,
}: {
  text: string;
  className?: string;
  progress?: number | null;
}) {
  const following = typeof progress === "number";
  const structured = hasHeadings(text);
  const blocks = useMemo(() => (structured ? transcriptBlocks(text) : null), [structured, text]);
  const parts = useMemo(
    () =>
      blocks
        ? blocks.flatMap((b) => (b.kind === "paragraph" ? b.parts : []))
        : following
          ? splitParts(text)
          : [],
    [blocks, following, text],
  );
  const active = following ? activePartIndex(parts, progress) : -1;

  // Keep the highlighted part in view (only the transcript box scrolls when it can).
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (active < 0) return;
    const root = rootRef.current;
    const el = root?.querySelector<HTMLElement>(`[data-part="${active}"]`);
    if (!root || !el) return;
    const behavior = prefersReducedMotion() ? "auto" : "smooth";
    if (root.scrollHeight > root.clientHeight + 1) {
      const top =
        el.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop;
      if (top < root.scrollTop || top + el.offsetHeight > root.scrollTop + root.clientHeight)
        root.scrollTo({ top: Math.max(0, top - root.clientHeight / 3), behavior });
    } else {
      el.scrollIntoView({ block: "nearest", behavior });
    }
  }, [active]);

  const part = (p: string, i: number) => (
    <span
      key={i}
      data-part={i}
      data-now={i === active || undefined}
      className="motion-tx-seg"
      data-testid={i === active ? "transcript-now" : undefined}
    >
      {p}
    </span>
  );

  if (!blocks) {
    return (
      <div ref={rootRef} className={cn("whitespace-pre-wrap", className)}>
        {following ? parts.map(part) : text}
      </div>
    );
  }
  let n = 0;
  return (
    <div ref={rootRef} className={cn("space-y-3", className)}>
      {blocks.map((b, i) =>
        b.kind === "heading" ? (
          <h4 key={i} className="pt-2 font-display text-base font-semibold first:pt-0">
            {b.text}
          </h4>
        ) : (
          <p key={i}>{following ? b.parts.map((p) => part(p, n++)) : b.parts.join("")}</p>
        ),
      )}
    </div>
  );
}
