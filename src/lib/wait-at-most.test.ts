import { describe, expect, test } from "bun:test";
import { waitAtMost } from "./wait-at-most";

const after = (ms: number, fail = false) =>
  new Promise((resolve, reject) =>
    setTimeout(() => (fail ? reject(new Error("x")) : resolve(1)), ms),
  );

describe("waitAtMost", () => {
  test("resolves as soon as fast work is done", async () => {
    const t = performance.now();
    await waitAtMost(after(10), 300);
    expect(performance.now() - t).toBeLessThan(150);
  });

  test("stops waiting for slow work after the limit", async () => {
    const t = performance.now();
    await waitAtMost(after(1000), 50);
    const took = performance.now() - t;
    expect(took).toBeGreaterThanOrEqual(45);
    expect(took).toBeLessThan(500);
  });

  test("never throws when the work fails", async () => {
    await expect(waitAtMost(after(5, true), 300)).resolves.toBeUndefined();
  });
});
