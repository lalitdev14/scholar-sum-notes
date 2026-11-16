/**
 * Lets the handwriting notebook grab an image of the slide currently open in a slide
 * viewer ("Write on slide"), without wiring the components together. Each viewer
 * registers a capture function while a PDF deck is open; the most recently opened
 * viewer wins (e.g. the slides sidebar in full-screen handwriting).
 */
type Capture = () => Promise<string | null>;

const stack: Capture[] = [];

/** Registers a capture function; returns a function that unregisters it. */
export function registerSlideCapture(fn: Capture): () => void {
  stack.push(fn);
  return () => {
    const i = stack.lastIndexOf(fn);
    if (i >= 0) stack.splice(i, 1);
  };
}

/** PNG data URL of the current slide, or null when no PDF deck is open. */
export function captureCurrentSlide(): Promise<string | null> {
  const fn = stack[stack.length - 1];
  return fn ? fn() : Promise.resolve(null);
}
