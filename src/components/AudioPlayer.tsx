import { useEffect, useState } from "react";
import { audioUrl } from "@/lib/lecture-audio";
import { playbackRatio } from "@/lib/transcript-follow";

/**
 * Plays a saved lecture recording (fetches a short-lived private link when shown).
 * `onProgress` reports the share played (0…1) while playing and after a seek, so the
 * transcript can follow along; `durationSeconds` is used when the file reports no length.
 */
export function AudioPlayer({
  path,
  onProgress,
  durationSeconds,
}: {
  path: string;
  onProgress?: (ratio: number) => void;
  durationSeconds?: number;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    void audioUrl(path).then((u) => {
      if (!alive) return;
      if (u) setSrc(u);
      else setFailed(true);
    });
    return () => {
      alive = false;
    };
  }, [path]);
  if (failed)
    return <p className="text-xs text-muted-foreground">The recording couldn't be loaded.</p>;
  if (!src) return <div className="h-10 animate-pulse rounded-full bg-muted" aria-hidden />;
  const report = (e: React.SyntheticEvent<HTMLAudioElement>) => {
    const a = e.currentTarget;
    // Nothing to follow until playback has started once.
    if (a.played.length === 0 && a.currentTime === 0) return;
    onProgress?.(playbackRatio(a.currentTime, a.duration, durationSeconds));
  };
  return (
    <audio
      controls
      preload="metadata"
      src={src}
      className="w-full"
      aria-label="Lecture recording"
      data-testid="lecture-audio"
      onPlay={onProgress && report}
      onTimeUpdate={onProgress && report}
      onSeeked={onProgress && report}
    />
  );
}
