import { cn } from "@/lib/utils";

/**
 * A lecture transcript. Improved transcripts mark topics with "## Heading" lines and separate
 * paragraphs with blank lines; live transcripts are shown as they are.
 */
export function TranscriptText({ text, className }: { text: string; className?: string }) {
  const lines = text.split(/\r?\n/);
  if (!lines.some((l) => /^#{1,3}\s+/.test(l.trim()))) {
    return <div className={cn("whitespace-pre-wrap", className)}>{text}</div>;
  }
  return (
    <div className={cn("space-y-3", className)}>
      {lines
        .map((l) => l.trim())
        .filter(Boolean)
        .map((line, i) =>
          /^#{1,3}\s+/.test(line) ? (
            <h4 key={i} className="pt-2 font-display text-base font-semibold first:pt-0">
              {line.replace(/^#{1,3}\s+/, "")}
            </h4>
          ) : (
            <p key={i}>{line}</p>
          ),
        )}
    </div>
  );
}
