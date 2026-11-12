/**
 * Whisper speech-to-text through any OpenAI-compatible `/audio/transcriptions` endpoint.
 *
 * Configure ONE of (checked in this order):
 *   GROQ_API_KEY=gsk_...        -> Groq, whisper-large-v3 (fast, ~$0.11 per audio hour)
 *   WHISPER_API_KEY=...         -> WHISPER_BASE_URL (default OpenAI), WHISPER_MODEL (default whisper-1)
 * Optional: WHISPER_MODEL to override the model (e.g. whisper-large-v3-turbo, gpt-4o-transcribe).
 *
 * When nothing is configured, lecture audio falls back to the general AI model (Gemini).
 */

type WhisperConfig = { baseURL: string; apiKey: string; model: string; provider: string };

export function resolveWhisperConfig(): WhisperConfig | null {
  const groq = process.env["GROQ_API_KEY"];
  if (groq) {
    return {
      provider: "groq",
      baseURL: "https://api.groq.com/openai/v1",
      apiKey: groq,
      model: process.env["WHISPER_MODEL"] ?? "whisper-large-v3",
    };
  }
  const key = process.env["WHISPER_API_KEY"];
  if (key) {
    return {
      provider: "custom",
      baseURL: (process.env["WHISPER_BASE_URL"] ?? "https://api.openai.com/v1").replace(/\/$/, ""),
      apiKey: key,
      model: process.env["WHISPER_MODEL"] ?? "whisper-1",
    };
  }
  return null;
}

// Phrases Whisper is known to invent on near-silent audio.
const HALLUCINATIONS =
  /^(thanks? (you )?for watching[.!]?|thank you[.!]?|you|bye[.!]?|please subscribe[.!]?|\[(music|silence|blank_audio)\]|\.+)$/i;

export class WhisperError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Transcribes a WAV clip. `language` like "en-US"; `prompt` is preceding text for context. */
export async function whisperTranscribe(
  config: WhisperConfig,
  wav: Uint8Array<ArrayBuffer>,
  language?: string,
  prompt?: string,
): Promise<string> {
  const form = new FormData();
  form.append("file", new Blob([wav], { type: "audio/wav" }), "chunk.wav");
  form.append("model", config.model);
  form.append("response_format", "json");
  form.append("temperature", "0");
  const iso = language?.split("-")[0]?.toLowerCase();
  if (iso && /^[a-z]{2}$/.test(iso)) form.append("language", iso);
  // Whisper uses the prompt as preceding context (helps names, terms and continuity).
  if (prompt?.trim()) form.append("prompt", prompt.trim().slice(-400));

  const res = await fetch(`${config.baseURL}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.apiKey}` },
    body: form,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new WhisperError(
      `Whisper request failed (${res.status}): ${detail.slice(0, 300)}`,
      res.status,
    );
  }
  const json = (await res.json()) as { text?: string };
  const text = (json.text ?? "").trim();
  return HALLUCINATIONS.test(text) ? "" : text;
}
