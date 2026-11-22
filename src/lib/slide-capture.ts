/**
 * Lets the handwriting notebook grab images of the slides open in a slide viewer
 * ("Write on slide" / "Write on all slides"), without wiring the components together.
 * Each viewer registers while a PDF deck is open; the most recently opened viewer wins
 * (e.g. the slides sidebar in full-screen handwriting).
 */
export type SlideSource = {
  /** Number of slides in the open deck. */
  count: () => number;
  /** The slide showing right now (1-based). */
  current: () => number;
  /** Image data URL of slide `n` (1-based). */
  capture: (n: number, opts?: { type?: "image/png" | "image/jpeg" }) => Promise<string | null>;
};

const stack: SlideSource[] = [];

/** Registers a slide source; returns a function that unregisters it. */
export function registerSlideCapture(src: SlideSource): () => void {
  stack.push(src);
  return () => {
    const i = stack.lastIndexOf(src);
    if (i >= 0) stack.splice(i, 1);
  };
}

const top = () => stack[stack.length - 1];

/** PNG data URL of the current slide, or null when no PDF deck is open. */
export function captureCurrentSlide(): Promise<string | null> {
  const src = top();
  return src ? src.capture(src.current()) : Promise.resolve(null);
}

/** Number of slides in the open deck (0 when none is open). */
export function slideCount(): number {
  return top()?.count() ?? 0;
}

/**
 * Images of every slide in the open deck, in order (JPEG to keep pages light).
 * Calls `onProgress(done, total)` after each slide; returns [] when no deck is open.
 */
export async function captureAllSlides(
  onProgress?: (done: number, total: number) => void,
): Promise<string[]> {
  const src = top();
  if (!src) return [];
  const total = src.count();
  const out: string[] = [];
  for (let n = 1; n <= total; n++) {
    const img = await src.capture(n, { type: "image/jpeg" });
    if (img) out.push(img);
    onProgress?.(n, total);
  }
  return out;
}

/**
 * PowerPoint decks open in a viewer whose exact PDF copy is still being made. While one is
 * showing and no PDF deck is, "Write on slide" explains that the slides are being prepared.
 */
const preparing: object[] = [];

/** Marks a PowerPoint deck as being prepared; returns a function that clears the mark. */
export function registerPreparingSlides(): () => void {
  const token = {};
  preparing.push(token);
  return () => {
    const i = preparing.indexOf(token);
    if (i >= 0) preparing.splice(i, 1);
  };
}

/** True while a PowerPoint deck's exact slides are being prepared and no PDF deck is open. */
export function slidesBeingPrepared(): boolean {
  return !top() && preparing.length > 0;
}

/** Message for "Write on slide" when there are no slide images to use. */
export function noSlidesMessage(): string {
  return slidesBeingPrepared()
    ? "Exact slides are still being prepared for this PowerPoint. Try again in a moment."
    : "Open a PDF slide deck on the Slides side first.";
}
