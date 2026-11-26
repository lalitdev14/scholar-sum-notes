/**
 * Small helpers for the app's motion (tokens and keyframes live in `src/styles.css`).
 * Everything here is a no-op on the server and respects "reduce motion".
 */

/** True when the visitor asked the OS for less motion. */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** True on devices with a mouse or trackpad (hover polish is off on touch screens). */
export function hasFinePointer(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

/** Plays a one-shot CSS animation class again (e.g. `motion-shake`), even if it just ran. */
export function replayAnimation(el: Element | null | undefined, className: string) {
  if (!el) return;
  el.classList.remove(className);
  // Reading layout restarts the animation when the class is added back.
  void (el as HTMLElement).offsetWidth;
  el.classList.add(className);
  el.addEventListener("animationend", () => el.classList.remove(className), { once: true });
}

/**
 * The shared View Transition name for a class card and the class page header, so opening a
 * class morphs the card into the header (and back).
 */
export function classTransitionName(classId: string): string {
  return `class-${classId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
}

/** Largest tilt of a class card, in degrees, at the card's edge. */
export const MAX_TILT_DEG = 4;

/**
 * Desktop hover polish, installed once for the whole app: a soft light follows the cursor
 * on `.motion-glow` buttons, and `.motion-tilt` cards tilt toward it (at most 4°). The CSS
 * only shows these with a fine pointer, hover and no "reduce motion", so this just keeps
 * the cursor position up to date. Returns a clean-up function.
 */
export function installPointerPolish(): () => void {
  if (typeof document === "undefined") return () => {};
  let tilted: HTMLElement | null = null;
  const reset = () => {
    if (!tilted) return;
    tilted.style.removeProperty("--rx");
    tilted.style.removeProperty("--ry");
    tilted = null;
  };
  const onMove = (e: PointerEvent) => {
    if (e.pointerType !== "mouse" || !(e.target instanceof Element)) return;
    const glow = e.target.closest<HTMLElement>(".motion-glow");
    if (glow) {
      const r = glow.getBoundingClientRect();
      glow.style.setProperty("--mx", `${e.clientX - r.left}px`);
      glow.style.setProperty("--my", `${e.clientY - r.top}px`);
    }
    const card = e.target.closest<HTMLElement>(".motion-tilt");
    if (card !== tilted) reset();
    if (!card || prefersReducedMotion()) return;
    tilted = card;
    const r = card.getBoundingClientRect();
    // -0.5 … 0.5 across the card.
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    const clamp = (v: number) => Math.max(-0.5, Math.min(0.5, v));
    card.style.setProperty("--rx", `${(-clamp(y) * 2 * MAX_TILT_DEG).toFixed(2)}deg`);
    card.style.setProperty("--ry", `${(clamp(x) * 2 * MAX_TILT_DEG).toFixed(2)}deg`);
  };
  document.addEventListener("pointermove", onMove, { passive: true });
  document.documentElement.addEventListener("pointerleave", reset);
  return () => {
    document.removeEventListener("pointermove", onMove);
    document.documentElement.removeEventListener("pointerleave", reset);
    reset();
  };
}

/**
 * Microphone level bars: averages an AnalyserNode's frequency data (0–255 per bin) into
 * `count` bands of 0…1, over the speech range (the lowest ~6 kHz at 48 kHz).
 */
export function levelBands(data: ArrayLike<number>, count = 5, gain = 1.8): number[] {
  const first = 1;
  const last = Math.min(data.length, 33);
  const span = Math.max(1, (last - first) / count);
  const out: number[] = [];
  for (let b = 0; b < count; b++) {
    const from = Math.floor(first + b * span);
    const to = Math.max(from + 1, Math.floor(first + (b + 1) * span));
    let sum = 0;
    let n = 0;
    for (let i = from; i < to && i < data.length; i++) {
      sum += data[i] ?? 0;
      n++;
    }
    out.push(n ? Math.min(1, (sum / n / 255) * gain) : 0);
  }
  return out;
}
