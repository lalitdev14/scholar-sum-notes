/** Longest a route waits for its data before the page opens with its loading state. */
export const PREFETCH_WAIT_MS = 300;

/**
 * Waits for `work` for at most `ms`, never throwing: slow or failing data must not freeze
 * the click (the page then shows its normal loading or error state).
 */
export async function waitAtMost(work: Promise<unknown>, ms = PREFETCH_WAIT_MS): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    work.catch(() => undefined),
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, ms);
    }),
  ]);
  clearTimeout(timer);
}
