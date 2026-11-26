import { describe, expect, test } from "bun:test";
import { THEME_INIT_SCRIPT, THEME_STORAGE_KEY } from "./theme";

/** Runs the no-flash <head> script against a fake document and returns what it applied. */
function runInitScript(saved: string | null, deviceDark: boolean, storageThrows = false) {
  const classes = new Set<string>();
  const root = {
    classList: { add: (c: string) => classes.add(c), remove: (c: string) => classes.delete(c) },
    style: { colorScheme: "" },
  };
  const localStorage = {
    getItem: (key: string) => {
      if (storageThrows) throw new Error("blocked");
      return key === THEME_STORAGE_KEY ? saved : null;
    },
  };
  const matchMedia = (q: string) => ({
    matches: q === "(prefers-color-scheme: dark)" && deviceDark,
  });
  new Function("localStorage", "matchMedia", "document", THEME_INIT_SCRIPT)(
    localStorage,
    matchMedia,
    { documentElement: root },
  );
  return { dark: classes.has("dark"), colorScheme: root.style.colorScheme };
}

describe("theme init script", () => {
  test("follows the device setting with no saved choice", () => {
    expect(runInitScript(null, true)).toEqual({ dark: true, colorScheme: "dark" });
    expect(runInitScript(null, false)).toEqual({ dark: false, colorScheme: "light" });
  });

  test("a saved choice wins over the device setting", () => {
    expect(runInitScript("light", true)).toEqual({ dark: false, colorScheme: "light" });
    expect(runInitScript("dark", false)).toEqual({ dark: true, colorScheme: "dark" });
  });

  test("ignores junk values and blocked storage", () => {
    expect(runInitScript("purple", true)).toEqual({ dark: true, colorScheme: "dark" });
    expect(runInitScript(null, true, true)).toEqual({ dark: true, colorScheme: "dark" });
  });
});
