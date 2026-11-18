import { useEffect, useState } from "react";
import { audioUrl } from "@/lib/lecture-audio";

/** Plays a saved lecture recording (fetches a short-lived private link when shown). */
export function AudioPlayer({ path }: { path: string }) {
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
  return (
    <audio
      controls
      preload="metadata"
      src={src}
      className="w-full"
      aria-label="Lecture recording"
    />
  );
}
