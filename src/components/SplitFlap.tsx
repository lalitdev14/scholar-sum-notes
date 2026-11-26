import { useEffect, useState } from "react";

/*
 * Split-flap digits (like a train-station board): each digit flips only when it changes.
 * Self-contained: its CSS lives here (hoisted once into <head> by React) rather than in
 * styles.css. With "reduce motion" on, digits change without the flip.
 */

const FLIP_MS = 260;

const FLAP_CSS = `
.ll-flaps{display:flex;align-items:center;gap:4px;font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace;font-size:30px;font-weight:500;font-variant-numeric:tabular-nums}
.ll-flap{position:relative;width:34px;height:46px;perspective:300px;flex:none}
.ll-flap>span{position:absolute;left:0;right:0;height:50%;overflow:hidden;display:flex;justify-content:center;background:#22222c;color:#f2f2f5;line-height:46px}
.ll-flap>span>span{display:block}
.ll-flap .ll-t,.ll-flap .ll-ft{top:0;border-radius:6px 6px 0 0}
.ll-flap .ll-b,.ll-flap .ll-fb{bottom:0;border-radius:0 0 6px 6px}
.ll-flap .ll-b>span,.ll-flap .ll-fb>span{transform:translateY(-23px)}
.ll-flap::after{content:"";position:absolute;left:0;right:0;top:50%;height:1px;background:rgba(0,0,0,.45);z-index:3}
.ll-flap .ll-ft{transform-origin:bottom;z-index:2;backface-visibility:hidden}
.ll-flap .ll-fb{transform-origin:top;z-index:2;transform:rotateX(90deg);backface-visibility:hidden}
.ll-flap.ll-go .ll-ft{animation:ll-ftop ${FLIP_MS}ms ease-in forwards}
.ll-flap.ll-go .ll-fb{animation:ll-fbot ${FLIP_MS}ms ${FLIP_MS}ms cubic-bezier(.22,1,.36,1) forwards}
@keyframes ll-ftop{to{transform:rotateX(-90deg)}}
@keyframes ll-fbot{to{transform:rotateX(0)}}
.ll-flaps .ll-sep{color:#8a8a96;padding:0 2px}
@media (max-width:359px){.ll-flaps{font-size:24px;gap:3px}.ll-flap{width:28px;height:40px}.ll-flap>span{line-height:40px}.ll-flap .ll-b>span,.ll-flap .ll-fb>span{transform:translateY(-20px)}}
@media (prefers-reduced-motion:reduce){.ll-flap.ll-go .ll-ft,.ll-flap.ll-go .ll-fb{animation:none}.ll-flap .ll-ft{transform:none}.ll-flap .ll-fb{transform:rotateX(90deg)}}
`;

/** True while the user asks for reduced motion (updates if the setting changes). */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);
  return reduced;
}

type FlapState = { cur: string; prev: string; n: number };

function FlapDigit({ ch, animate }: { ch: string; animate: boolean }) {
  const [st, setSt] = useState<FlapState>({ cur: ch, prev: ch, n: 0 });

  // A new digit: flip from the old one (or just show it without motion).
  if (st.cur !== ch) {
    setSt(animate ? { cur: ch, prev: st.cur, n: st.n + 1 } : { cur: ch, prev: ch, n: st.n });
  }
  const flipping = st.prev !== st.cur;
  useEffect(() => {
    if (!flipping) return;
    const t = setTimeout(() => setSt((s) => ({ ...s, prev: s.cur })), FLIP_MS * 2 + 20);
    return () => clearTimeout(t);
  }, [flipping, st.n]);

  return (
    <span
      className={`ll-flap${flipping ? " ll-go" : ""}`}
      data-testid="flap-digit"
      data-value={st.cur}
      data-flipping={flipping ? "true" : "false"}
    >
      {/* Static halves: new digit on top, old digit at the bottom until the flap lands. */}
      <span className="ll-t">
        <span>{st.cur}</span>
      </span>
      <span className="ll-b">
        <span>{flipping ? st.prev : st.cur}</span>
      </span>
      {/* The moving flap: old top half falls, then new bottom half lands. */}
      <span className="ll-ft" key={`ft${st.n}`}>
        <span>{flipping ? st.prev : st.cur}</span>
      </span>
      <span className="ll-fb" key={`fb${st.n}`}>
        <span>{st.cur}</span>
      </span>
    </span>
  );
}

/** Split-flap display of a string such as "03:12:09". Decorative: give the time in words elsewhere. */
export function SplitFlap({ value, className }: { value: string; className?: string }) {
  const reduced = usePrefersReducedMotion();
  return (
    <>
      <style href="lectureloop-split-flap" precedence="default">
        {FLAP_CSS}
      </style>
      <span
        className={`ll-flaps${className ? ` ${className}` : ""}`}
        aria-hidden="true"
        data-testid="split-flap"
        data-reduced-motion={reduced ? "true" : "false"}
      >
        {[...value].map((c, i) =>
          /\d/.test(c) ? (
            <FlapDigit key={`${value.length}-${i}`} ch={c} animate={!reduced} />
          ) : (
            <span key={`${value.length}-${i}`} className="ll-sep">
              {c}
            </span>
          ),
        )}
      </span>
    </>
  );
}
