import { supabase } from "@/integrations/supabase/client";

/** Private storage for lecture recordings: <user id>/<class id>/<transcript id>.<ext>. */
export const AUDIO_BUCKET = "lecture-audio";

export const audioPath = (userId: string, classId: string, transcriptId: string, mime: string) =>
  `${userId}/${classId}/${transcriptId}.${audioExtension(mime)}`;

/** Best recording format this browser supports (small Opus where possible; Safari uses AAC). */
export function pickAudioMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  const options = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return options.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}

export function audioExtension(mime: string) {
  return mime.includes("mp4") || mime.includes("aac")
    ? "m4a"
    : mime.includes("ogg")
      ? "ogg"
      : "webm";
}

/**
 * Transcripts in this class that have a saved recording (id -> file path), or null when audio storage isn't
 * set up yet (the bucket doesn't exist), in which case the "save audio" option stays hidden.
 */
export async function listAudioIds(
  userId: string,
  classId: string,
): Promise<Map<string, string> | null> {
  const { data, error } = await supabase.storage
    .from(AUDIO_BUCKET)
    .list(`${userId}/${classId}`, { limit: 1000 });
  if (error) return null;
  const byId = new Map<string, string>(); // transcript id -> file path
  for (const f of data ?? []) {
    if (f.id) byId.set(f.name.replace(/\.[a-z0-9]+$/i, ""), `${userId}/${classId}/${f.name}`);
  }
  return byId;
}

/** Short-lived link to play the recording, or to download it under a readable file name. */
export async function audioUrl(path: string, downloadAs?: string): Promise<string | null> {
  const { data } = await supabase.storage
    .from(AUDIO_BUCKET)
    .createSignedUrl(path, 3600, downloadAs ? { download: downloadAs } : undefined);
  return data?.signedUrl ?? null;
}
