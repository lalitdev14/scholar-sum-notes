import { useCallback, useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";

export type UploadProgressState =
  { phase: "idle" } | { phase: "uploading"; percent: number } | { phase: "done" };

/**
 * Progress for an upload that reports no progress of its own (Supabase storage uploads).
 * It eases toward a cap based on the file size (about 1.5 MB/s), moves on to the "saving"
 * stage, and fills to 100% with a check when `done()` is called. `fail()` hides it.
 */
export function useUploadProgress() {
  const [state, setState] = useState<UploadProgressState>({ phase: "idle" });
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const hide = useRef<ReturnType<typeof setTimeout> | null>(null);
  const percent = useRef(0);
  const cap = useRef(0);
  const rate = useRef(0.1);

  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };
  useEffect(
    () => () => {
      stop();
      if (hide.current) clearTimeout(hide.current);
    },
    [],
  );

  const start = useCallback((bytes: number) => {
    stop();
    if (hide.current) clearTimeout(hide.current);
    const expectedSeconds = 1 + bytes / (1.5 * 1024 * 1024);
    // Each 120 ms tick covers this share of the remaining distance to the cap.
    rate.current = 1 - Math.exp(-0.12 / (expectedSeconds / 3));
    percent.current = 4;
    cap.current = 88;
    setState({ phase: "uploading", percent: 4 });
    timer.current = setInterval(() => {
      percent.current += (cap.current - percent.current) * rate.current;
      setState({ phase: "uploading", percent: Math.round(percent.current) });
    }, 120);
  }, []);

  /** The file is stored; saving the record now. */
  const saving = useCallback(() => {
    cap.current = 97;
    rate.current = Math.max(rate.current, 0.25);
  }, []);

  const done = useCallback(() => {
    stop();
    setState({ phase: "done" });
    hide.current = setTimeout(() => setState({ phase: "idle" }), 1400);
  }, []);

  const fail = useCallback(() => {
    stop();
    setState({ phase: "idle" });
  }, []);

  return { state, start, saving, done, fail };
}

/** A small ring that fills with the upload, then pops into a check. */
export function UploadProgressIcon({ state }: { state: UploadProgressState }) {
  if (state.phase === "uploading")
    return (
      <span
        className="motion-progress-ring mr-2"
        style={{ "--p": state.percent } as React.CSSProperties}
        role="progressbar"
        aria-label="Uploading slides"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={state.percent}
        data-testid="upload-progress"
      />
    );
  if (state.phase === "done")
    return (
      <span className="motion-progress-done mr-2" data-testid="upload-done" aria-hidden="true">
        <Check className="!h-3 !w-3" strokeWidth={3} />
      </span>
    );
  return null;
}
