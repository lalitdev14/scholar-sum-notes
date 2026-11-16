/**
 * Lets the handwriting notebook grab an image of the slide currently open in the slide
 * viewer ("Write on slide"), without wiring the two components together. The viewer
 * registers a capture function while a PDF deck is open.
 */
type Capture = () => Promise<string | null>;

let current: Capture | null = null;

export function registerSlideCapture(fn: Capture | null) {
  current = fn;
}

/** PNG data URL of the current slide, or null when no PDF deck is open. */
export function captureCurrentSlide(): Promise<string | null> {
  return current ? current() : Promise.resolve(null);
}
