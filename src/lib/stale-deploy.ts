/**
 * After a new version is deployed, a tab that was opened earlier still asks for the old
 * version's code files, which no longer exist, so opening another page fails. When that
 * happens, reload once: the reload loads the new version. A short guard stops reload loops
 * if the files really are missing.
 */
const KEY = "lectureloop:stale-reload-at";
const GUARD_MS = 15_000;

const CHUNK_ERROR =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS|Loading chunk \S+ failed|ChunkLoadError/i;

export function isStaleDeployError(error: unknown): boolean {
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error ?? "");
  return CHUNK_ERROR.test(text);
}

/** Reloads the page (once per 15 s). Returns false when it just reloaded and gave up. */
export function reloadForNewVersion(): boolean {
  try {
    const last = Number(sessionStorage.getItem(KEY) ?? 0);
    if (Date.now() - last < GUARD_MS) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    /* storage unavailable: still reload once */
  }
  window.location.reload();
  return true;
}
