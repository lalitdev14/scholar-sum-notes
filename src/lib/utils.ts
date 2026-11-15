import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 75 → "1:15", 3725 → "1:02:05". */
export function formatDuration(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = String(m).padStart(h ? 2 : 1, "0");
  return `${h ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}

// Messages that come straight from the database/storage/network and mean nothing to students.
const TECHNICAL_ERROR =
  /violates|relation |column |duplicate key|syntax error|permission denied|row-level security|JWT|PGRST|constraint|invalid input|null value|foreign key|schema|uuid|StorageApiError|Unauthorized|status code|unexpected token/i;

/**
 * Text for an error toast: our own friendly messages pass through, technical ones are
 * replaced by `fallback` (and logged to the console for debugging).
 */
export function friendlyError(err: unknown, fallback: string): string {
  const msg =
    err instanceof Error
      ? err.message
      : err && typeof err === "object" && "message" in err
        ? String((err as { message: unknown }).message)
        : "";
  if (err) console.error(fallback, err);
  if (/mime type|not supported|invalid_mime/i.test(msg)) return "This file type isn't supported.";
  if (/too large|maximum allowed size|payload/i.test(msg)) return "This file is too large.";
  if (/failed to fetch|networkerror|fetch failed|load failed/i.test(msg))
    return "Network problem. Check your connection and try again.";
  if (!msg || msg.length > 200 || TECHNICAL_ERROR.test(msg)) return fallback;
  return msg;
}
