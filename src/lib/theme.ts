import { useSyncExternalStore } from "react";

/**
 * Light / dark theme. The choice is kept per device in localStorage; with no saved choice the
 * device setting (prefers-color-scheme) decides. The theme is the `dark` class (and the
 * `color-scheme`) on <html>, so every page and the shadcn tokens in styles.css follow it.
 */
export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "lectureloop:theme";

/**
 * Runs in <head> before the page paints (no flash of the other theme). Kept tiny and
 * dependency-free; the same logic as readTheme/applyTheme below.
 */
export const THEME_INIT_SCRIPT =
  "(function(){var t;try{t=localStorage.getItem('" +
  THEME_STORAGE_KEY +
  "')}catch(e){}" +
  "if(t!=='light'&&t!=='dark'){try{t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}catch(e){t='light'}}" +
  "var d=document.documentElement;if(t==='dark')d.classList.add('dark');else d.classList.remove('dark');" +
  "d.style.colorScheme=t})()";

/** The saved choice on this device, or null when the student hasn't picked one. */
export function savedTheme(): Theme | null {
  try {
    const t = localStorage.getItem(THEME_STORAGE_KEY);
    return t === "light" || t === "dark" ? t : null;
  } catch {
    return null;
  }
}

export function deviceTheme(): Theme {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
}

/** The theme currently on the page. */
export function currentTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

/** Switch to `theme` now and remember it on this device. */
export function setTheme(theme: Theme) {
  applyTheme(theme);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Private mode / storage blocked: the switch still works for this page.
  }
}

export function toggleTheme() {
  setTheme(currentTheme() === "dark" ? "light" : "dark");
}

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

/** The current theme, updated whenever it changes. "light" while rendering on the server. */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, currentTheme, () => "light");
}

/**
 * Keeps the page in step while the app is open: follows the device setting until the student
 * picks a theme, and picks up a choice made in another tab.
 */
export function watchTheme(): () => void {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onMedia = () => {
    if (!savedTheme()) applyTheme(deviceTheme());
  };
  const onStorage = (e: StorageEvent) => {
    if (e.key === THEME_STORAGE_KEY || e.key === null) applyTheme(savedTheme() ?? deviceTheme());
  };
  media.addEventListener("change", onMedia);
  window.addEventListener("storage", onStorage);
  return () => {
    media.removeEventListener("change", onMedia);
    window.removeEventListener("storage", onStorage);
  };
}
