import { audioUrl } from "@/lib/lecture-audio";
import { encodeWav, isSilent, TARGET_RATE } from "@/lib/wav";

/**
 * "Improve with audio": listens to a saved lecture recording again and rebuilds the transcript.
 *
 * 1. The recording is decoded in the browser and cut into ~45 s pieces at natural pauses.
 * 2. Each piece goes to the speech engine (Whisper or Gemini, like live AI transcription).
 * 3. Every ~5 minutes of what was heard, together with the matching part of the live transcript,
 *    is cleaned up and organised under topic headings by the text model.
 *
 * Pieces stay small so each request is well under the hosting limit and finishes quickly.
 */

export type RefineProgress = {
  phase: "loading" | "listening" | "organizing";
  done: number;
  total: number;
};

type Deps = {
  transcribe: (args: {
    wavDataUrl: string;
    language?: string | undefined;
    previousText?: string | undefined;
  }) => Promise<string>;
  organize: (args: {
    heard: string;
    liveHint: string;
    previousHeading?: string | undefined;
    language?: string | undefined;
  }) => Promise<string>;
};

const PIECE_MIN_S = 35;
const PIECE_MAX_S = 55;
const PART_SECONDS = 300; // one organising call per ~5 minutes
const PARALLEL = 3;

export async function refineTranscript(
  opts: {
    audioPath: string;
    liveTranscript: string;
    language?: string | undefined;
    onProgress?: (p: RefineProgress) => void;
    signal?: AbortSignal;
  } & Deps,
): Promise<string> {
  const { onProgress, signal } = opts;
  onProgress?.({ phase: "loading", done: 0, total: 1 });
  const samples = await loadMono16k(opts.audioPath);
  check(signal);

  const pieces = cutAtPauses(samples);
  const totalSeconds = samples.length / TARGET_RATE;
  const live = opts.liveTranscript.trim();
  const liveSlice = (fromS: number, toS: number, marginS = 30) => {
    if (!live || totalSeconds <= 0) return "";
    const a = Math.max(0, (fromS - marginS) / totalSeconds);
    const b = Math.min(1, (toS + marginS) / totalSeconds);
    return live.slice(Math.floor(a * live.length), Math.ceil(b * live.length));
  };

  // Step 2: listen to every piece (a few at a time).
  const heard: string[] = new Array(pieces.length).fill("");
  let done = 0;
  onProgress?.({ phase: "listening", done, total: pieces.length });
  let next = 0;
  async function worker() {
    while (next < pieces.length) {
      const i = next++;
      const p = pieces[i]!;
      check(signal);
      if (!isSilent([p.data])) {
        heard[i] = (
          await withRetry(() =>
            opts.transcribe({
              wavDataUrl: encodeWav([p.data], TARGET_RATE),
              language: opts.language,
              previousText: liveSlice(p.start, p.start, 0).slice(-300) || undefined,
            }),
          )
        ).trim();
      }
      done++;
      onProgress?.({ phase: "listening", done, total: pieces.length });
    }
  }
  await Promise.all(Array.from({ length: Math.min(PARALLEL, pieces.length) }, worker));
  check(signal);
  if (!heard.some(Boolean)) throw new Error("NO_SPEECH");

  // Step 3: organise ~5-minute parts, in order, so headings carry on from part to part.
  const parts: { text: string; start: number; end: number }[] = [];
  pieces.forEach((p, i) => {
    const last = parts[parts.length - 1];
    if (!last || p.start - last.start >= PART_SECONDS) {
      parts.push({ text: heard[i]!, start: p.start, end: p.end });
    } else {
      last.text = last.text && heard[i] ? `${last.text} ${heard[i]}` : last.text || heard[i]!;
      last.end = p.end;
    }
  });
  const out: string[] = [];
  let previousHeading: string | undefined;
  for (let k = 0; k < parts.length; k++) {
    check(signal);
    onProgress?.({ phase: "organizing", done: k, total: parts.length });
    const part = parts[k]!;
    if (!part.text.trim()) continue;
    const text = await withRetry(() =>
      opts.organize({
        heard: part.text,
        liveHint: liveSlice(part.start, part.end),
        previousHeading,
        language: opts.language,
      }),
    );
    out.push(text.trim());
    const headings = text.match(/^##\s+.+$/gm);
    if (headings?.length) previousHeading = headings[headings.length - 1]!.replace(/^##\s+/, "");
  }
  onProgress?.({ phase: "organizing", done: parts.length, total: parts.length });
  return out.filter(Boolean).join("\n\n");
}

function check(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
}

/** One retry after a short wait (the AI is sometimes briefly busy). */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (/limit for|signed out|AbortError/i.test(String(err))) throw err;
    await new Promise((r) => setTimeout(r, 4000));
    return fn();
  }
}

/** Downloads the recording and decodes it to 16 kHz mono samples. */
async function loadMono16k(path: string): Promise<Float32Array> {
  const url = await audioUrl(path);
  if (!url) throw new Error("AUDIO_MISSING");
  const res = await fetch(url);
  if (!res.ok) throw new Error("AUDIO_MISSING");
  const bytes = await res.arrayBuffer();
  // Decoding into a 16 kHz context resamples the audio for us.
  const ctx = new OfflineAudioContext(1, 1, TARGET_RATE);
  const buf = await ctx.decodeAudioData(bytes);
  if (buf.numberOfChannels === 1) return buf.getChannelData(0);
  const mono = new Float32Array(buf.length);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const ch = buf.getChannelData(c);
    for (let i = 0; i < ch.length; i++) mono[i]! += ch[i]! / buf.numberOfChannels;
  }
  return mono;
}

type Piece = { data: Float32Array; start: number; end: number };

/** Cuts the audio into 35-55 s pieces, each ending at the quietest moment in that window. */
export function cutAtPauses(samples: Float32Array, rate = TARGET_RATE): Piece[] {
  const pieces: Piece[] = [];
  const win = Math.floor(rate * 0.25);
  let start = 0;
  while (start < samples.length) {
    const minEnd = start + PIECE_MIN_S * rate;
    const maxEnd = start + PIECE_MAX_S * rate;
    let end = samples.length;
    if (maxEnd < samples.length) {
      let best = minEnd;
      let bestEnergy = Infinity;
      for (let w = minEnd; w + win <= maxEnd; w += win) {
        let e = 0;
        for (let i = w; i < w + win; i += 8) e += samples[i]! * samples[i]!;
        if (e <= bestEnergy) {
          bestEnergy = e;
          best = w + Math.floor(win / 2);
        }
      }
      end = best;
    }
    pieces.push({ data: samples.subarray(start, end), start: start / rate, end: end / rate });
    start = end;
  }
  return pieces;
}
