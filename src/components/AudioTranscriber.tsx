import { useCallback, useEffect, useRef, useState } from "react";
import { Square, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { pickAudioMimeType } from "@/lib/lecture-audio";
import { encodeWav, isSilent } from "@/lib/wav";
import { cn, formatDuration } from "@/lib/utils";
import { levelBands } from "@/lib/motion";

/**
 * Live lecture transcription with start / pause / resume / finish.
 *
 * Engines:
 *  - "browser": the Web Speech API (Chrome, Edge, Safari). Text appears as you speak.
 *  - "ai": records the microphone and sends ~10-20 s WAV chunks (cut at natural pauses)
 *    to the server, which uses Whisper when configured (most accurate) or Gemini.
 *    Works in every browser (e.g. Firefox), with a short delay.
 *
 * The running transcript is kept as a draft in localStorage so a reload or crash
 * doesn't lose a lecture. "Finish & save" hands the text to `onSave`.
 *
 * Optionally ("Save the audio recording too") the microphone is also recorded with
 * MediaRecorder into one compact file (Opus/AAC, ~32 kbps ≈ 15 MB an hour) that is handed to
 * `onSave` with the transcript. Pausing pauses the file; audio can't survive a page reload.
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
    /** The recording, when "Save the audio recording too" was on. */
    audio?: Blob;
    /** Lecture language, e.g. "en-US". */
    language?: string;
  }) => Promise<boolean>;
  /** Audio storage is set up; shows the "Save the audio recording too" option. */
  audioAvailable?: boolean;
  /** True when the server has Whisper configured; the AI engine then becomes the default. */
  whisperAvailable?: boolean;
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

// Chunks are cut at a natural pause after MIN seconds (so words aren't split), or at MAX.
const MIN_CHUNK_SECONDS = 10;
const MAX_CHUNK_SECONDS = 20;
const PAUSE_RMS = 0.012;

/** One recording can run at most 40 minutes; it then stops and saves by itself. */
export const MAX_RECORDING_SECONDS = 40 * 60;
const SILENT_BARS = [0, 0, 0, 0, 0];
const WARN_AT_SECONDS = MAX_RECORDING_SECONDS - 5 * 60;

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

export function AudioTranscriber({
  classId,
  defaultTitle,
  transcribeChunk,
  onSave,
  onRecordingChange,
  whisperAvailable = false,
  audioAvailable = false,
}: Props) {
  const draftKey = `lectureloop:transcript-draft:${classId}`;
  const browserSupported = useRef(false);
  const [engine, setEngine] = useState<Engine>("browser");
  const enginePicked = useRef(false);
  const [language, setLanguage] = useState("en-US");
  const [status, setStatus] = useState<Status>("idle");
  const [text, setText] = useState("");
  const [interim, setInterim] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [title, setTitle] = useState("");
  const [pendingChunks, setPendingChunks] = useState(0);
  const [level, setLevel] = useState(0);
  // "Save the audio recording too" (remembered on this device).
  const [saveAudio, setSaveAudio] = useState(false);
  /** The audio from before a reload is gone; only the transcript can be saved for this one. */
  const [audioLost, setAudioLost] = useState(false);
  const recorderRef = useRef<{ rec: MediaRecorder; stream: MediaStream; chunks: Blob[] } | null>(
    null,
  );

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
  // Live level bars on the record button (an AnalyserNode on the microphone, ~15 fps).
  const [bars, setBars] = useState<number[]>(SILENT_BARS);
  const meterRef = useRef<{
    ctx: AudioContext;
    timer: ReturnType<typeof setInterval>;
    own: MediaStream | null;
  } | null>(null);

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
          setAudioLost(true);
          toast.info("Recovered your unsaved transcript. Resume or save it.");
        }
      }
    } catch {
      /* storage unavailable */
    }
  }, [draftKey]);

  useEffect(() => {
    try {
      setSaveAudio(localStorage.getItem("lectureloop:save-audio") === "1");
    } catch {
      /* storage unavailable */
    }
  }, []);

  // With Whisper on the server, default to the more accurate AI engine.
  useEffect(() => {
    if (whisperAvailable && !enginePicked.current && statusRef.current === "idle") setEngine("ai");
  }, [whisperAvailable]);

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

  // 40-minute limit: a warning 5 minutes before, then stop and save automatically.
  const limitHandled = useRef(false);
  useEffect(() => {
    if (status !== "recording") return;
    if (seconds === WARN_AT_SECONDS)
      toast.info("5 minutes left in this recording. Recordings stop and save at 40 minutes.");
    if (seconds >= MAX_RECORDING_SECONDS && !limitHandled.current) {
      limitHandled.current = true;
      toast.info(
        "Reached the 40-minute limit, so the recording was saved. Start a new one to keep going.",
        {
          duration: 10000,
        },
      );
      void finish();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seconds, status]);

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

  // The level bars stop whenever recording stops (pause, finish, an error).
  useEffect(() => {
    if (status !== "recording") stopMeter();
  }, [status]);

  // Stop everything on unmount.
  useEffect(
    () => () => {
      statusRef.current = "idle";
      stopMeter();
      recognitionRef.current?.abort();
      stopAudioCapture();
      discardRecorder();
    },
    [],
  );

  // ------------------------------------------------------------ audio file (optional)

  const recordAudio = audioAvailable && saveAudio && !audioLost;

  async function startOrResumeRecorder() {
    const r = recorderRef.current;
    if (r) {
      if (r.rec.state === "paused") r.rec.resume();
      return;
    }
    const mime = pickAudioMimeType();
    if (mime === null)
      throw new Error("This browser can't record audio. Turn off saving the audio to transcribe.");
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
    });
    const rec = new MediaRecorder(stream, {
      ...(mime ? { mimeType: mime } : {}),
      audioBitsPerSecond: 32000,
    });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    rec.start(10000); // hand over data every 10 s, so little is lost if something fails
    recorderRef.current = { rec, stream, chunks };
  }

  function pauseRecorder() {
    const r = recorderRef.current;
    if (r && r.rec.state === "recording") r.rec.pause();
  }

  /** Stops the recording and returns it as one file (or undefined if nothing was recorded). */
  async function finishRecorder(): Promise<Blob | undefined> {
    const r = recorderRef.current;
    recorderRef.current = null;
    if (!r) return undefined;
    if (r.rec.state !== "inactive") {
      await new Promise<void>((resolve) => {
        r.rec.onstop = () => resolve();
        r.rec.stop();
      });
    }
    r.stream.getTracks().forEach((t) => t.stop());
    const blob = new Blob(r.chunks, { type: r.rec.mimeType || r.chunks[0]?.type || "audio/webm" });
    return blob.size ? blob : undefined;
  }

  function discardRecorder() {
    const r = recorderRef.current;
    recorderRef.current = null;
    if (!r) return;
    r.rec.ondataavailable = null;
    if (r.rec.state !== "inactive") r.rec.stop();
    r.stream.getTracks().forEach((t) => t.stop());
  }

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
      // Retry with growing waits so a busy/rate-limited AI doesn't leave gaps in the lecture.
      const waits = [5, 15, 30, 60];
      try {
        for (let attempt = 0; ; attempt++) {
          try {
            const piece = await transcribeChunk({
              wavDataUrl,
              language,
              previousText: textRef.current.slice(-300),
            });
            appendText(piece);
            break;
          } catch (err) {
            if (attempt >= waits.length) {
              toast.error(
                (err instanceof Error ? err.message : "") +
                  " A few seconds of audio could not be transcribed.",
              );
              break;
            }
            if (attempt === 0) toast.info("The AI is busy; retrying that part of the audio…");
            await new Promise((r) => setTimeout(r, waits[attempt]! * 1000));
          }
        }
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
      let sq = 0;
      for (let i = 0; i < data.length; i += 8) {
        const v = Math.abs(data[i]!);
        peak = Math.max(peak, v);
        sq += v * v;
      }
      setLevel(peak);
      const rms = Math.sqrt(sq / Math.ceil(data.length / 8));
      const secs = bufferedSecondsRef.current;
      if (secs >= MAX_CHUNK_SECONDS || (secs >= MIN_CHUNK_SECONDS && rms < PAUSE_RMS)) {
        flushChunk();
      }
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

  // ------------------------------------------------------------ level meter

  async function startMeter() {
    if (meterRef.current || typeof AudioContext === "undefined") return;
    try {
      // Reuse a microphone stream that is already open; otherwise open one just for the bars.
      const shared = audioRef.current?.stream ?? recorderRef.current?.stream ?? null;
      const stream = shared ?? (await navigator.mediaDevices?.getUserMedia({ audio: true }));
      if (!stream) return;
      if (statusRef.current !== "recording" || meterRef.current) {
        if (!shared) stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const ctx = new AudioContext();
      void ctx.resume();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.6;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const timer = setInterval(() => {
        analyser.getByteFrequencyData(data);
        setBars(levelBands(data, SILENT_BARS.length));
      }, 66);
      meterRef.current = { ctx, timer, own: shared ? null : stream };
    } catch {
      /* no meter: the bars just stay still */
    }
  }

  function stopMeter() {
    const m = meterRef.current;
    meterRef.current = null;
    if (!m) return;
    clearInterval(m.timer);
    m.own?.getTracks().forEach((t) => t.stop());
    void m.ctx.close();
    setBars(SILENT_BARS);
  }

  // ------------------------------------------------------------ controls

  async function start() {
    try {
      setStatusBoth("recording");
      if (recordAudio) await startOrResumeRecorder();
      if (engine === "browser") {
        if (!startRecognition())
          throw new Error("Live transcription isn't supported in this browser.");
      } else {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("This browser can't access the microphone.");
        }
        await startAudioCapture();
      }
      void startMeter();
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
    pauseRecorder();
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
      discardRecorder();
      setStatusBoth("idle");
      return;
    }
    const audio = await finishRecorder();
    const ok = await onSave({
      title: title.trim() || defaultTitle,
      transcript,
      durationSeconds: seconds,
      language,
      ...(audio ? { audio } : {}),
    });
    if (ok) reset();
    else setStatusBoth("paused");
  }

  function reset() {
    limitHandled.current = false;
    discardRecorder();
    setAudioLost(false);
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
        {/* Round record button; while recording it stretches into a "Recording · m:ss"
            pill with level bars and a stop square. Stopping pauses (resume or finish & save). */}
        <button
          type="button"
          className="motion-rec-btn"
          onClick={() => (status === "recording" ? pause() : void start())}
          disabled={
            status === "saving" || (status === "paused" && seconds >= MAX_RECORDING_SECONDS)
          }
          aria-label={
            status === "recording"
              ? "Stop recording"
              : status === "paused"
                ? "Start recording (resume)"
                : "Start recording"
          }
          aria-pressed={status === "recording"}
          title={
            status === "paused" && seconds >= MAX_RECORDING_SECONDS
              ? "This recording reached the 40-minute limit. Save it and start a new one."
              : status === "recording"
                ? "Stop recording. You can resume, or finish and save."
                : undefined
          }
          data-testid="record-button"
          data-state={status}
        >
          <span className="motion-rec" data-on={status === "recording"} aria-hidden="true">
            <span className="motion-rec-inner">
              <span className="motion-rec-dot" />
              <span className="motion-rec-label">
                Recording · {formatDuration(seconds)}
                <span className="motion-rec-bars" data-testid="level-bars">
                  {bars.map((lv, i) => (
                    <i key={i} style={{ "--lv": lv.toFixed(2) } as React.CSSProperties} />
                  ))}
                </span>
              </span>
            </span>
          </span>
          {status === "idle" && <span>Start transcribing</span>}
          {status === "paused" && <span>Resume</span>}
        </button>
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
            ·{" "}
            <span
              className={cn(seconds >= WARN_AT_SECONDS && "font-medium text-amber-600")}
              data-testid="recording-timer"
            >
              {formatDuration(seconds)} / {formatDuration(MAX_RECORDING_SECONDS)}
            </span>
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={defaultTitle}
          maxLength={200}
          aria-label="Recording title"
          className="col-span-2 h-9 min-w-0"
        />
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          disabled={busy}
          aria-label="Lecture language"
          className="h-9 min-w-0 rounded-md border border-input bg-background px-2"
        >
          {LANGUAGES.map(([code, label]) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </select>
        <select
          value={engine}
          onChange={(e) => {
            enginePicked.current = true;
            setEngine(e.target.value as Engine);
          }}
          disabled={busy || status === "paused"}
          aria-label="Transcription engine"
          className="h-9 min-w-0 rounded-md border border-input bg-background px-2"
        >
          {browserSupported.current && <option value="browser">Live (instant)</option>}
          <option value="ai">
            {whisperAvailable ? "Whisper AI (most accurate)" : "AI (more accurate, ~15 s delay)"}
          </option>
        </select>
      </div>

      {audioAvailable && (
        <div className="flex flex-wrap items-start gap-x-3 gap-y-1 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={saveAudio}
              disabled={status !== "idle"}
              onChange={(e) => {
                setSaveAudio(e.target.checked);
                try {
                  localStorage.setItem("lectureloop:save-audio", e.target.checked ? "1" : "0");
                } catch {
                  /* storage unavailable */
                }
              }}
              className="h-4 w-4 accent-[var(--color-primary)]"
              aria-describedby="save-audio-help"
            />
            Save the audio recording too
          </label>
          <span id="save-audio-help" className="text-xs text-muted-foreground">
            {audioLost && saveAudio
              ? "The audio from before the page reloaded couldn't be kept; only the transcript will be saved."
              : "Private to you. Ask your professor before recording a lecture."}
          </span>
        </div>
      )}

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
