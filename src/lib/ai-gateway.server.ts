import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

/**
 * Pluggable AI provider.
 *
 * Inside Lovable, LOVABLE_API_KEY is injected automatically and the Lovable AI
 * Gateway is used. When self-hosting (e.g. Vercel) you can instead supply your
 * own provider key:
 *
 *   OPENAI_API_KEY=sk-...                 -> api.openai.com
 *   GOOGLE_GENERATIVE_AI_API_KEY=...      -> Google AI (OpenAI-compatible endpoint)
 *
 * Optional overrides:
 *   AI_BASE_URL   - any other OpenAI-compatible endpoint
 *   AI_API_KEY    - key for AI_BASE_URL
 *   AI_TEXT_MODEL - model id for summaries + handwriting transcription
 */

type ProviderConfig = {
  name: string;
  baseURL: string;
  headers: Record<string, string>;
  defaultModel: string;
};

function resolveProviderConfig(): ProviderConfig {
  const custom = process.env["AI_BASE_URL"];
  const customKey = process.env["AI_API_KEY"];
  if (custom && customKey) {
    return {
      name: "custom",
      baseURL: custom,
      headers: { Authorization: `Bearer ${customKey}` },
      defaultModel: process.env["AI_TEXT_MODEL"] ?? "gpt-4o-mini",
    };
  }

  const lovableKey = process.env["LOVABLE_API_KEY"];
  if (lovableKey) {
    return {
      name: "lovable",
      baseURL: "https://ai.gateway.lovable.dev/v1",
      headers: {
        "Lovable-API-Key": lovableKey,
        "X-Lovable-AIG-SDK": "vercel-ai-sdk",
      },
      defaultModel: process.env["AI_TEXT_MODEL"] ?? "google/gemini-3.5-flash",
    };
  }

  const openaiKey = process.env["OPENAI_API_KEY"];
  if (openaiKey) {
    return {
      name: "openai",
      baseURL: "https://api.openai.com/v1",
      headers: { Authorization: `Bearer ${openaiKey}` },
      defaultModel: process.env["AI_TEXT_MODEL"] ?? "gpt-4o-mini",
    };
  }

  const googleKey = process.env["GOOGLE_GENERATIVE_AI_API_KEY"];
  if (googleKey) {
    return {
      name: "google",
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
      headers: { Authorization: `Bearer ${googleKey}` },
      defaultModel: process.env["AI_TEXT_MODEL"] ?? "gemini-2.5-flash",
    };
  }

  throw new Error(
    "AI is not configured. Set LOVABLE_API_KEY, OPENAI_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, or AI_BASE_URL + AI_API_KEY.",
  );
}

/** Returns a ready-to-use text model for whichever provider is configured. */
export function resolveTextModel() {
  const config = resolveProviderConfig();
  const provider = createOpenAICompatible({
    name: config.name,
    baseURL: config.baseURL,
    headers: config.headers,
  });
  return provider(config.defaultModel);
}

/** Kept for backwards compatibility with the Lovable-hosted setup. */
export function createLovableAiGatewayProvider(apiKey: string) {
  return createOpenAICompatible({
    name: "lovable",
    baseURL: "https://ai.gateway.lovable.dev/v1",
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
  });
}
