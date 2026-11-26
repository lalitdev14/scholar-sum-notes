import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A highlight that slides to the selected tab of a tab bar.
 *
 * Put `listRef` (a callback ref, so lists that mount later work too) on the element whose direct children are the `role="tab"` buttons (it must be
 * positioned, e.g. `relative`), and render `<span ref={indicatorRef} className="motion-tab-indicator …" />`
 * as its first child. "fill" covers the whole tab (a pill); "underline" sits just below it.
 * Until the indicator is placed (and without JavaScript) the tabs keep their own highlight.
 */
export function useTabIndicator<T extends HTMLElement = HTMLDivElement>(
  mode: "fill" | "underline" = "fill",
) {
  const [list, setList] = useState<T | null>(null);
  const listRef = useCallback((el: T | null) => setList(el), []);
  const indicatorRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const ind = indicatorRef.current;
    if (!list || !ind) return;
    let frame = 0;
    const place = () => {
      const tab = list.querySelector<HTMLElement>(':scope > [role="tab"][aria-selected="true"]');
      if (!tab || tab.offsetWidth === 0) {
        // Hidden (e.g. an inactive panel): placed again once it has a size.
        return;
      }
      const top = mode === "underline" ? tab.offsetTop + tab.offsetHeight : tab.offsetTop;
      ind.style.width = `${tab.offsetWidth}px`;
      if (mode === "fill") ind.style.height = `${tab.offsetHeight}px`;
      ind.style.transform = `translate(${tab.offsetLeft}px, ${top}px)`;
      if (list.getAttribute("data-tab-indicator") !== "ready") {
        list.setAttribute("data-tab-indicator", "ready");
        // Jump into place the first time; slide from then on.
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => ind.setAttribute("data-animate", ""));
      }
    };
    list.setAttribute("data-tab-indicator", "pending");
    place();
    const mo = new MutationObserver(place);
    mo.observe(list, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["aria-selected", "data-state", "class"],
    });
    const ro = new ResizeObserver(place);
    ro.observe(list);
    for (const tab of list.querySelectorAll(':scope > [role="tab"]')) ro.observe(tab);
    return () => {
      cancelAnimationFrame(frame);
      mo.disconnect();
      ro.disconnect();
    };
  }, [list, mode]);

  return { listRef, indicatorRef };
}
