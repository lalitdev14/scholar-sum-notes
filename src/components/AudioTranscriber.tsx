import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Pause, Play, Square, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn, formatDuration } from "@/lib/utils";

/**
 * Live lecture transcription with start / pause / resume / finish.
 *
 * Engines:
 *  - "browser": the Web Speech API (Chrome, Edge, Safari). Text appears as you speak.
 *  - "ai": records the microphone, and every ~15 s sends a small WAV chunk to the server
 *    for transcription. Works in every browser (e.g. Firefox), with a short delay.
 *
 * The running transcript is kept as a draft in localStorage so a reload or crash
 * doesn't lose a lecture. "Finish & save" hands the text to `onSave`.
 */

type Engine = "browser" | "ai";
type Status = "idle" | "recording" | "paused" | "saving";

export type TranscribeChunk = (args: {
  wavDataUrl: string;
  language: string;
  previousText: string;
}) => Promise<string>;

type Props = {
  classId: string;
  defaultTitle: string;
  transcribeChunk: TranscribeChunk;
  onSave: (recording: {
    title: string;
    transcript: string;
    durationSeconds: number;
  }) => Promise<boolean>;
  /** Called with true while the microphone is live. */
  onRecordingChange?: (recording: boolean) => void;
};

const LANGUAGES = [
  ["en-US", "English (US)"],
  ["en-GB", "English (UK)"],
  ["en-IN", "English (India)"],
  ["es-ES", "Spanish"],
  ["fr-FR", "French"],
  ["de-DE", "German"],
  ["it-IT", "Italian"],
  ["pt-BR", "Portuguese"],
  ["zh-CN", "Chinese (Mandarin)"],
  ["ja-JP", "Japanese"],
  ["ko-KR", "Korean"],
  ["hi-IN", "Hindi"],
  ["ar-SA", "Arabic"],
] as const;

const CHUNK_SECONDS = 15;
const TARGET_RATE = 16000;

// Minimal typing for the (still prefixed in some browsers) Web Speech API.
type SpeechResultList = ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: SpeechResultList }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

function speechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (w["SpeechRecognition"] ?? w["webkitSpeechRecognition"] ?? null) as
    (new () => SpeechRecognitionLike) | null;
}

function joinText(a: string, b: string) {
  const t = b.trim();
  if (!t) return a;
  if (!a) return t;
  return /\s$/.test(a) ? a + t : `${a} ${t}`;
}

/** Downsamples Float32 PCM to 16 kHz and wraps it as a 16-bit mono WAV data URL. */
function encodeWav(chunks: Float32Array[], inputRate: number): string {
  const length = chunks.reduce((n, c) => n + c.length, 0);
  const merged = new Float32Array(length);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.length;
  }
  const ratio = inputRate / TARGET_RATE;
  const outLength = Math.floor(merged.length / ratio);
  const buffer = new ArrayBuffer(44 + outLength * 2);
  const view = new DataView(buffer);
  const writeStr = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + outLength * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, TARGET_RATE, true);
  view.setUint32(28, TARGET_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, outLength * 2, true);
  for (let i = 0; i < outLength; i++) {
    // Average the samples that fall into this output sample (simple low-pass).
    const start = Math.floor(i * ratio);
    const end = Math.min(merged.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j++) sum += merged[j]!;
    const v = Math.max(-1, Math.min(1, sum / Math.max(1, end - start)));
    view.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true);
  }
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return `data:audio/wav;base64,${btoa(binary)}`;
}

/** True when a chunk is essentially silence (skip the AI call). */
function isSilent(chunks: Float32Array[]) {
  let sum = 0;
  let n = 0;
  for (const c of chunks) {
    for (let i = 0; i < c.length; i += 16) {
      sum += c[i]! * c[i]!;
      n++;
    }
  }
  return n === 0 || Math.sqrt(sum / n) < 0.004;
}

export function AudioTranscriber({
  classId,
  defaultTitle,
  transcribeChunk,
  onSave,
  onRecordingChange,
}: Props) {
  const draftKey = `lectureloop:transcript-draft:${classId}`;
  const browserSupported = useRef(false);
  const [engine, setEngine] = useState<Engine>("browser");
  const [language, setLanguage] = useState("en-US");
  const [status, setStatus] = useState<Status>("idle");
  const [text, setText] = useState("");
  const [interim, setInterim] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [title, setTitle] = useState("");
  const [pendingChunks, setPendingChunks] = useState(0);
  const [level, setLevel] = useState(0);

  const statusRef = useRef<Status>("idle");
  const textRef = useRef("");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const audioRef = useRef<{
    stream: MediaStream;
    ctx: AudioContext;
    node: ScriptProcessorNode;
    source: MediaStreamAudioSourceNode;
  } | null>(null);
  const bufferRef = useRef<Float32Array[]>([]);
  const bufferedSecondsRef = useRef(0);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const scrollRef = useRef<HTMLDivElement>(null);

  const setStatusBoth = (s: Status) => {
    statusRef.current = s;
    setStatus(s);
  };
  useEffect(() => onRecordingChange?.(status === "recording"), [status, onRecordingChange]);
  const appendText = useCallback((piece: string) => {
    textRef.current = joinText(textRef.current, piece);
    setText(textRef.current);
  }, []);

  // Detect support + restore an unsaved draft on mount.
  useEffect(() => {
    browserSupported.current = Boolean(speechRecognitionCtor());
    setEngine(browserSupported.current ? "browser" : "ai");
    const navLang = navigator.language;
    if (LANGUAGES.some(([code]) => code === navLang)) setLanguage(navLang);
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const draft = JSON.parse(raw) as { text?: string; seconds?: number; title?: string };
        if (draft.text?.trim()) {
          textRef.current = draft.text;
          setText(draft.text);
          setSeconds(draft.seconds ?? 0);
          setTitle(draft.title ?? "");
          setStatusBoth("paused");
          toast.info("Recovered your unsaved transcript. Resume or save it.");
        }
      }
    } catch {
      /* storage unavailable */
    }
  }, [draftKey]);

  // Persist the draft while there is something to lose.
  useEffect(() => {
    if (status === "idle" && !text) return;
    try {
      localStorage.setItem(draftKey, JSON.stringify({ text, seconds, title }));
    } catch {
      /* storage unavailable */
    }
  }, [draftKey, text, seconds, title, status]);

  // Timer.
  useEffect(() => {
    if (status !== "recording") return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [status]);

  // Warn before leaving with an unsaved recording.
  useEffect(() => {
    if (status !== "recording" && status !== "paused") return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [status]);

  // Keep the newest words in view.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [text, interim]);

  // Stop everything on unmount.
  useEffect(
    () => () => {
      statusRef.current = "idle";
      recognitionRef.current?.abort();
      stopAudioCapture();
    },
    [],
  );

  // ------------------------------------------------------------ browser engine

  function startRecognition() {
    const Ctor = speechRecognitionCtor();
    if (!Ctor) return false;
    const rec = new Ctor();
    rec.lang = language;
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let live = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]!;
        if (r.isFinal) appendText(r[0].transcript);
        else live += r[0].transcript;
      }
      setInterim(live);
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        toast.error("Microphone access was blocked. Allow it in your browser to record.");
        setStatusBoth(textRef.current ? "paused" : "idle");
      } else if (e.error === "network") {
        toast.error("Speech recognition lost its connection. Retrying…");
      } else if (e.error === "audio-capture") {
        toast.error("No microphone found.");
        setStatusBoth(textRef.current ? "paused" : "idle");
      }
      // "no-speech" and "aborted" are normal; onend restarts if still recording.
    };
    rec.onend = () => {
      setInterim("");
      // Browsers end recognition after silence or ~1 min; keep going while recording.
      if (statusRef.current === "recording" && recognitionRef.current === rec) {
        try {
          rec.start();
        } catch {
          setTimeout(() => statusRef.current === "recording" && startRecognition(), 300);
        }
      }
    };
    recognitionRef.current = rec;
    rec.start();
    return true;
  }

  function stopRecognition() {
    const rec = recognitionRef.current;
    recognitionRef.current = null;
    rec?.stop();
    setInterim("");
  }

  // ------------------------------------------------------------ AI engine

  function flushChunk() {
    const chunks = bufferRef.current;
    const rate = audioRef.current?.ctx.sampleRate ?? 48000;
    bufferRef.current = [];
    bufferedSecondsRef.current = 0;
    if (!chunks.length || isSilent(chunks)) return;
    const wavDataUrl = encodeWav(chunks, rate);
    setPendingChunks((n) => n + 1);
    // Sequential queue keeps the transcript in spoken order.
    queueRef.current = queueRef.current.then(async () => {
      try {
        const piece = await transcribeChunk({
          wavDataUrl,
          language,
          previousText: textRef.current.slice(-300),
        });
        appendText(piece);
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "A part of the audio could not be transcribed.",
        );
      } finally {
        setPendingChunks((n) => n - 1);
      }
    });
  }

  async function startAudioCapture() {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
    });
    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(stream);
    const node = ctx.createScriptProcessor(4096, 1, 1);
    node.onaudioprocess = (e) => {
      if (statusRef.current !== "recording") return;
      const data = new Float32Array(e.inputBuffer.getChannelData(0));
      bufferRef.current.push(data);
      bufferedSecondsRef.current += data.length / ctx.sampleRate;
      let peak = 0;
      for (let i = 0; i < data.length; i += 32) peak = Math.max(peak, Math.abs(data[i]!));
      setLevel(peak);
      if (bufferedSecondsRef.current >= CHUNK_SECONDS) flushChunk();
    };
    source.connect(node);
    node.connect(ctx.destination);
    audioRef.current = { stream, ctx, node, source };
  }

  function stopAudioCapture() {
    const a = audioRef.current;
    audioRef.current = null;
    if (!a) return;
    a.node.onaudioprocess = null;
    a.source.disconnect();
    a.node.disconnect();
    a.stream.getTracks().forEach((t) => t.stop());
    void a.ctx.close();
    setLevel(0);
  }

  // ------------------------------------------------------------ controls

  async function start() {
    try {
      setStatusBoth("recording");
      if (engine === "browser") {
        if (!startRecognition())
          throw new Error("Live transcription isn't supported in this browser.");
      } else {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("This browser can't access the microphone.");
        }
        await startAudioCapture();
      }
    } catch (err) {
      setStatusBoth(textRef.current ? "paused" : "idle");
      const name = err instanceof DOMException ? err.name : "";
      toast.error(
        name === "NotAllowedError"
          ? "Microphone access was blocked. Allow it in your browser to record."
          : name === "NotFoundError"
            ? "No microphone found."
            : err instanceof Error
              ? err.message
              : "Could not start recording.",
      );
    }
  }

  function pause() {
    setStatusBoth("paused");
    if (engine === "browser") stopRecognition();
    else {
      flushChunk();
      stopAudioCapture();
    }
  }

  async function finish() {
    if (statusRef.current === "recording") pause();
    setStatusBoth("saving");
    await queueRef.current; // wait for in-flight AI chunks
    // Give the browser engine a moment to deliver its last final result.
    await new Promise((r) => setTimeout(r, engine === "browser" ? 600 : 0));
    const transcript = textRef.current.trim();
    if (!transcript) {
      toast.error("Nothing was transcribed yet.");
      setStatusBoth("idle");
      return;
    }
    const ok = await onSave({
      title: title.trim() || defaultTitle,
      transcript,
      durationSeconds: seconds,
    });
    if (ok) reset();
    else setStatusBoth("paused");
  }

  function reset() {
    textRef.current = "";
    setText("");
    setInterim("");
    setSeconds(0);
    setTitle("");
    setStatusBoth("idle");
    try {
      localStorage.removeItem(draftKey);
    } catch {
      /* ignore */
    }
  }

  const busy = status === "recording" || status === "saving";
  const hasContent = Boolean(text.trim());

  return (
    <div className="mt-3 flex flex-col gap-3" data-testid="audio-transcriber">
      <div className="flex flex-wrap items-center gap-2">
        {status === "idle" && (
          <Button onClick={() => void start()} className="gap-2">
            <Mic className="h-4 w-4" /> Start transcribing
          </Button>
        )}
        {status === "recording" && (
          <Button variant="secondary" onClick={pause} className="gap-2">
            <Pause className="h-4 w-4" /> Pause
          </Button>
        )}
        {status === "paused" && (
          <Button onClick={() => void start()} className="gap-2">
            <Play className="h-4 w-4" /> Resume
          </Button>
        )}
        {(status === "recording" || status === "paused" || status === "saving") && (
          <Button
            variant="outline"
            onClick={() => void finish()}
            disabled={status === "saving"}
            className="gap-2"
          >
            <Square className="h-4 w-4" />
            {status === "saving" ? "Saving…" : "Finish & save"}
          </Button>
        )}
        {status === "paused" && (
          <Button
            variant="ghost"
            size="sm"
            onClick={reset}
            className="gap-1 text-muted-foreground"
            aria-label="Discard this recording"
          >
            <Trash2 className="h-4 w-4" /> Discard
          </Button>
        )}

        <div className="ml-auto flex items-center gap-2 text-sm tabular-nums">
          <span
            className={cn(
              "inline-block h-2.5 w-2.5 rounded-full",
              status === "recording" ? "animate-pulse bg-red-500" : "bg-muted-foreground/40",
            )}
            aria-hidden
          />
          <span aria-live="polite">
            {status === "recording"
              ? "Recording"
              : status === "paused"
                ? "Paused"
                : status === "saving"
                  ? "Saving"
                  : "Ready"}{" "}
            · {formatDuration(seconds)}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={defaultTitle}
          maxLength={200}
          aria-label="Recording title"
          className="h-9 min-w-[12rem] flex-1"
        />
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          disabled={busy}
          aria-label="Lecture language"
          className="h-9 rounded-md border border-input bg-background px-2"
        >
          {LANGUAGES.map(([code, label]) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </select>
        <select
          value={engine}
          onChange={(e) => setEngine(e.target.value as Engine)}
          disabled={busy || status === "paused"}
          aria-label="Transcription engine"
          className="h-9 rounded-md border border-input bg-background px-2"
        >
          {browserSupported.current && <option value="browser">Live (instant)</option>}
          <option value="ai">AI (more accurate, ~15 s delay)</option>
        </select>
      </div>

      {engine === "ai" && status === "recording" && (
        <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div
            className="h-full bg-primary transition-[width] duration-150"
            style={{ width: `${Math.min(100, level * 250)}%` }}
          />
        </div>
      )}

      <div
        ref={scrollRef}
        className="h-[clamp(180px,32vh,420px)] overflow-y-auto rounded-lg border border-border bg-background p-4 text-base leading-relaxed"
        data-testid="live-transcript"
        aria-live="polite"
      >
        {hasContent || interim ? (
          <p className="whitespace-pre-wrap">
            {text}
            {interim && <span className="text-muted-foreground"> {interim}</span>}
          </p>
        ) : (
          <p className="text-muted-foreground">
            Press "Start transcribing" and the lecture will be written out here as it's spoken. You
            can pause any time; when you finish, the transcript is saved to this class.
          </p>
        )}
        {pendingChunks > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">Transcribing the last few seconds…</p>
        )}
      </div>
    </div>
  );
}
