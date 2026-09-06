import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import { siteUrl } from "@/lib/site-url";
import { freeModelIdOr, freeModelIds } from "@/lib/ai/free-models";

/**
 * OpenRouter's `:free` catalogue rots: slugs get retired or moved behind
 * payment, and a listed model can still 404 when its provider drops the
 * endpoint. Everything below was verified live against the API, so if
 * Margus starts failing across the board, re-check these first rather
 * than assuming a rate limit:
 *
 *   curl -s https://openrouter.ai/api/v1/models | jq -r \
 *     '.data[] | select(.id|endswith(":free"))
 *      | select(.supported_parameters|index("tools")) | .id'
 *
 * Tools support is non-negotiable here. Margus edits the sheet through
 * tool calls, and several fast free models answer in prose while quietly
 * never emitting one, which looks like success and changes nothing.
 */
/*
 * nemotron-3-super-120b, measured 2026-08-24 at 0.8s to 2.0s for a short
 * reply. It was demoted once for taking 36s, and that note is stale: it is
 * the fastest free model here now, and one of the few still answering.
 *
 * The two gpt-oss entries that used to sit here and in the fallbacks are
 * gone because OpenRouter moved them off the free tier. They answer every
 * request with "This model is unavailable for free", so leaving them in
 * costs a wasted round trip before the chain moves on.
 */
const DEFAULT_TEXT_MODEL = "nvidia/nemotron-3-super-120b-a12b:free";

/**
 * Vision + tools, for screenshot import. Gemma 4 answers an image with a
 * forced tool call in ~1.5s. The previous default
 * (nemotron-3-nano-omni-...-reasoning) now 404s: still listed in the
 * models API, but its provider endpoint is gone.
 */
const DEFAULT_VISION_MODEL = "google/gemma-4-31b-it:free";

/**
 * Free-tier backups when the primary OpenRouter model is rate-limited.
 * Deliberately excludes nemotron-3-ultra-550b: it answers with a valid
 * tool call but took 101s to do it, which is worse for the user than
 * failing fast and letting the provider chain move to the next provider.
 *
 * Both of these are slower than the primary (lightning measured ~8s) and
 * are here to keep answering when it is rate limited, not to match it.
 */
const DEFAULT_TEXT_FALLBACKS = [
  "nvidia/nemotron-3.5-lightning:free",
  "google/gemma-4-31b-it:free",
];

const DEFAULT_VISION_FALLBACKS = ["google/gemma-4-26b-a4b-it:free"];

/*
 * The other providers name a model per free tier rather than in the slug,
 * so their defaults are named here and checked against the audited list in
 * `free-models.ts` like any env override. Cerebras's gpt-oss-120b is their
 * current production model and is safe for structured output; and NVIDIA
 * serves the nemotron the OpenRouter default already names, so a reader
 * who walks two legs meets one model.
 */
const GROQ_DEFAULT_MODEL = "openai/gpt-oss-20b";
const NVIDIA_DEFAULT_MODEL = "nvidia/nemotron-3-super-120b-a12b";
const CEREBRAS_DEFAULT_MODEL = "gpt-oss-120b";

/*
 * Vision is a different model on the same key, and which one was measured
 * rather than picked off a catalogue. Reading a rendered holding line
 * ("NVDA 12 $180.50") back through a forced tool call, 2026-09-06: Groq
 * qwen3.8-27b answered `{"ticker":"NVDA","shares":12,"price":180.5}` in
 * 0.86s and NVIDIA's omni the same in 6.59s.
 *
 * The two that failed are the reason this is measured. Groq qwen3.6-27b
 * reads the image and then 400s on `tool_choice: required` -- "Failed to
 * call a function" -- which is the trap MARGUS_PERSONA's own note warns
 * about: a model that answers in prose and never emits a call looks like
 * success and changes nothing. And NVIDIA's llama-3.2-11b-vision answered
 * fast (0.79s) with `NDA 12 #138 58.`, wrong on the ticker and on both
 * numbers, which on a screenshot import is somebody's share count and
 * their price written down wrong, quietly. Speed is worth nothing here
 * without the other two.
 */
const GROQ_VISION_MODEL = "qwen/qwen3.8-27b";
const NVIDIA_VISION_MODEL = "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning";

function parseEnvList(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function uniq(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function hasKey(name: string): boolean {
  const v = process.env[name];
  return Boolean(v && v !== "your_key_here");
}

export function resolveAdvisorModelId(options?: {
  vision?: boolean;
  reasoning?: boolean;
  speaking?: boolean;
}): string {
  const vision = Boolean(options?.vision) && !options?.reasoning;
  // Every env override goes through the free-tier check: an id without
  // OpenRouter's `:free` suffix is billed against account credits, and this
  // app has no credits to spend. A paid one is refused out loud and the
  // audited default answers instead.
  if (vision) {
    return freeModelIdOr(
      "openrouter",
      process.env.MODEL_VISION ?? process.env.OPENROUTER_VISION_MODEL,
      DEFAULT_VISION_MODEL
    );
  }
  if (options?.reasoning) {
    return freeModelIdOr(
      "openrouter",
      process.env.MODEL_FORECAST ??
        process.env.MODEL ??
        process.env.OPENROUTER_MODEL,
      DEFAULT_TEXT_MODEL
    );
  }
  return freeModelIdOr(
    "openrouter",
    process.env.MODEL ?? process.env.OPENROUTER_MODEL,
    DEFAULT_TEXT_MODEL
  );
}

/** OpenRouter `models` fallbacks (excludes primary). */
export function resolveAdvisorFallbackIds(options?: {
  vision?: boolean;
  reasoning?: boolean;
  speaking?: boolean;
}): string[] {
  const primary = resolveAdvisorModelId(options);
  const vision = Boolean(options?.vision) && !options?.reasoning;
  const fromEnv = parseEnvList(
    vision
      ? process.env.MODEL_VISION_FALLBACKS ?? process.env.MODEL_FALLBACKS
      : process.env.MODEL_FALLBACKS
  );
  const defaults = vision ? DEFAULT_VISION_FALLBACKS : DEFAULT_TEXT_FALLBACKS;
  // OpenRouter walks this list server-side, so a paid id here is spent
  // without any further call of ours to refuse it. Drop those before they
  // reach the wire.
  return freeModelIds(
    "openrouter",
    uniq([...fromEnv, ...defaults])
  ).filter((id) => id !== primary);
}

/**
 * Inject OpenRouter `models` fallbacks into chat/completions JSON bodies.
 * Rate-limits / downtime on the primary then walk the chain server-side.
 */
function openRouterFetchWithFallbacks(
  fallbacks: string[]
): typeof fetch | undefined {
  if (!fallbacks.length) return undefined;
  return async (input, init) => {
    try {
      if (init?.body && typeof init.body === "string") {
        const parsed = JSON.parse(init.body) as Record<string, unknown>;
        if (!Array.isArray(parsed.models)) {
          parsed.models = fallbacks;
          init = { ...init, body: JSON.stringify(parsed) };
        }
      }
    } catch {
      /* leave body alone */
    }
    return fetch(input, init);
  };
}

/*
 * Groq is back, on its second account, and the difference is the whole
 * rule: free-ness on Groq is a property of the ACCOUNT, not of the model.
 * The first key was a paid-tier one shared with another project, where
 * every model bills per token, gpt-oss-20b included, so no per-model
 * allowlist could have made it safe and the leg was removed. This key is a
 * new account with no card, VERIFIED rather than taken on trust: the API
 * reports `x-ratelimit-limit-requests: 1000` and
 * `x-ratelimit-limit-tokens: 8000`, which are Groq's published free-tier
 * ceilings for gpt-oss-20b. A Developer-tier key reports far higher, so
 * those two headers are how somebody checks this again later.
 */
export type AdvisorProviderId =
  | "openrouter"
  | "groq"
  | "nvidia"
  | "cerebras";

export type AdvisorProviderCandidate = {
  id: AdvisorProviderId;
  model: LanguageModel;
  /**
   * The provider's own name for the model, exactly as it is sent on the
   * wire. Carried because the reader is owed it: the mark beside a modeled
   * number says which model wrote it, and `LanguageModel` does not hand
   * that string back in a form worth showing anybody.
   */
  modelId: string;
};

/**
 * Full ordered chain of every CONFIGURED free-tier provider — Groq, then
 * NVIDIA, then OpenRouter (with its own internal free-model list
 * fallback), then Cerebras, each only included when its API key is set.
 * Every tier here is a free tier; add resilience by getting a free key,
 * not by paying anyone.
 *
 * The order is measured rather than assumed. One short completion, median
 * of three, on 2026-09-06: Groq gpt-oss-20b 0.51s and gpt-oss-120b 0.48s,
 * NVIDIA nemotron-3-super-120b 1.23s and gpt-oss-20b 2.45s, against 5s at
 * best on OpenRouter's free tier. Groq leads because it is an order of
 * magnitude quicker, and NVIDIA sits behind it because Groq's free tier is
 * 8,000 tokens a minute, which `MARGUS_PERSONA` alone (about 3,700 tokens)
 * spends twice over in two chat turns: the second leg here is reached
 * often, so it matters that it is 1.2s rather than 5.
 *
 * Vision walks the same order on different models (see the two vision
 * constants above), and only Cerebras stands out of it, having none. That
 * is a change from when Gemini was configured: it was the only other leg
 * that could read a picture, so when its key was deleted the whole of
 * screenshot import rested on OpenRouter alone, with no fallback at all on
 * the one screen a new reader meets first. Groq and NVIDIA both read the
 * test image correctly through a forced tool call, so vision now has three
 * legs where it briefly had one.
 */
export function buildAdvisorProviderChain(options?: {
  vision?: boolean;
  reasoning?: boolean;
  speaking?: boolean;
}): AdvisorProviderCandidate[] {
  const vision = Boolean(options?.vision) && !options?.reasoning;
  const speaking = Boolean(options?.speaking) && !vision && !options?.reasoning;
  const chain: AdvisorProviderCandidate[] = [];

  if (hasKey("GROQ_API_KEY")) {
    const groq = createOpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: "https://api.groq.com/openai/v1",
    });
    // 20b finishes a valid JSON object. 120b thinks longer and more often
    // dies mid-update, and measured no faster (0.48s against 0.51s), so
    // there is nothing to trade for the risk on a structured job. Neither
    // takes an image at all -- both 400 with "content must be a string" --
    // so a picture goes to the vision model instead.
    const groqModel = vision
      ? freeModelIdOr(
          "groq",
          process.env.GROQ_VISION_MODEL,
          GROQ_VISION_MODEL
        )
      : freeModelIdOr(
          "groq",
          speaking
            ? (process.env.GROQ_CHAT_MODEL ?? process.env.GROQ_MODEL)
            : process.env.GROQ_MODEL,
          GROQ_DEFAULT_MODEL
        );
    chain.push({ id: "groq", model: groq.chat(groqModel), modelId: groqModel });
  }

  if (hasKey("NVIDIA_API_KEY")) {
    const nvidia = createOpenAI({
      apiKey: process.env.NVIDIA_API_KEY,
      baseURL: "https://integrate.api.nvidia.com/v1",
    });
    // The same model the OpenRouter default names, served by the people who
    // made it: `nemotron-3-super-120b-a12b` without the `:free` suffix,
    // because on NVIDIA's own endpoint there is no other kind.
    const nvidiaModel = vision
      ? freeModelIdOr(
          "nvidia",
          process.env.NVIDIA_VISION_MODEL,
          NVIDIA_VISION_MODEL
        )
      : freeModelIdOr(
          "nvidia",
          speaking
            ? (process.env.NVIDIA_CHAT_MODEL ?? process.env.NVIDIA_MODEL)
            : process.env.NVIDIA_MODEL,
          NVIDIA_DEFAULT_MODEL
        );
    chain.push({
      id: "nvidia",
      model: nvidia.chat(nvidiaModel),
      modelId: nvidiaModel,
    });
  }

  if (hasKey("OPENROUTER_API_KEY")) {
    const modelId = resolveAdvisorModelId(options);
    const fallbacks = resolveAdvisorFallbackIds(options);
    const openrouter = createOpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: "https://openrouter.ai/api/v1",
      headers: {
        "HTTP-Referer":
          process.env.OPENROUTER_HTTP_REFERER ?? siteUrl(),
        "X-Title":
          process.env.OPENROUTER_APP_TITLE ?? "Upside Lab Assistant Margus",
      },
      fetch: openRouterFetchWithFallbacks(fallbacks),
    });
    chain.push({
      id: "openrouter",
      model: openrouter.chat(modelId),
      modelId,
    });
  }

  if (hasKey("CEREBRAS_API_KEY") && !vision) {
    const cerebras = createOpenAI({
      apiKey: process.env.CEREBRAS_API_KEY,
      baseURL: "https://api.cerebras.ai/v1",
    });
    // llama-3.3-70b no longer exists on Cerebras's catalog (confirmed
    // 404 against the live API) — gpt-oss-120b is their current
    // production model and is safe for structured output.
    const cerebrasModel = freeModelIdOr(
      "cerebras",
      speaking
        ? (process.env.CEREBRAS_CHAT_MODEL ?? process.env.CEREBRAS_MODEL)
        : process.env.CEREBRAS_MODEL,
      CEREBRAS_DEFAULT_MODEL
    );
    chain.push({
      id: "cerebras",
      model: cerebras.chat(cerebrasModel),
      modelId: cerebrasModel,
    });
  }

  return chain;
}

/**
 * The model id a given provider in this chain would send. A chain holds at
 * most one candidate per provider, so the id is enough to find it.
 *
 * Exists because `withAdvisorFallback` hands its callback a provider id and
 * a `LanguageModel`, and the second of those will not tell you its own name
 * in a form worth showing a reader.
 */
export function modelIdFor(
  chain: AdvisorProviderCandidate[],
  providerId: AdvisorProviderId
): string | null {
  return chain.find((c) => c.id === providerId)?.modelId ?? null;
}

/** Low thinking, short budget. Used by Forecast, Pulse, and the Fund cron
 * so an update lands instead of a smarter answer that never arrives. */
export const STRUCTURED_PROVIDER_OPTIONS = {
  openrouter: { reasoning: { effort: "low" as const, max_tokens: 512 } },
  openai: { reasoningEffort: "low" as const },
};

/**
 * Try a non-streaming call (generateText / generateObject) against each
 * configured provider in order, moving to the next on any failure —
 * OpenRouter's account-wide daily quota running out no longer means Margus
 * is down if Groq/NVIDIA/Cerebras are also configured.
 */
export type AdvisorFallbackOptions = {
  /**
   * Epoch ms the whole chain must finish by. Without this, walking 3
   * providers that each retry twice can outlive the route's maxDuration, at
   * which point the platform kills the function and serves its own
   * plain-text timeout page instead of our JSON error. Each attempt gets a
   * slice of whatever budget is left, and no new provider starts once the
   * budget is gone, so the route always lives long enough to answer.
   */
  deadlineAt?: number;
  /** Caller's own cancellation, usually the incoming request's signal. */
  signal?: AbortSignal;
};

/** Below this there isn't enough time left for a call to plausibly land. */
const MIN_ATTEMPT_MS = 5_000;

/**
 * Providers that just failed a REAL request, parked for a while.
 *
 * The streaming probe sends a 4-token "ping", which a rate-limited
 * provider will happily answer even though it 429s the actual chat a
 * second later. That's how the same exhausted provider kept getting
 * re-picked on every retry: the ping passed, the real request didn't.
 * A live failure is far better evidence than a ping, so trust it and
 * step over that provider for a few minutes.
 *
 * Bounded by the number of providers (4), so nothing accumulates.
 */
const providerCooldownUntil = new Map<AdvisorProviderId, number>();
const PROVIDER_COOLDOWN_MS = 3 * 60 * 1000;

export function markProviderUnhealthy(
  id: AdvisorProviderId,
  ms: number = PROVIDER_COOLDOWN_MS
) {
  providerCooldownUntil.set(id, Date.now() + ms);
}

/** Chain minus anything cooling down, or the original if all are. */
function usableChain(
  chain: AdvisorProviderCandidate[]
): AdvisorProviderCandidate[] {
  const now = Date.now();
  const healthy = chain.filter(
    (c) => (providerCooldownUntil.get(c.id) ?? 0) <= now
  );
  // Everything is cooling down: better to try a tired provider than to
  // refuse outright.
  return healthy.length > 0 ? healthy : chain;
}

function attemptSignal(
  caller: AbortSignal | undefined,
  budgetMs: number | null
): AbortSignal | undefined {
  if (budgetMs == null) return caller;
  const timeout = AbortSignal.timeout(budgetMs);
  return caller ? AbortSignal.any([caller, timeout]) : timeout;
}

export async function withAdvisorFallback<T>(
  chain: AdvisorProviderCandidate[],
  fn: (
    model: LanguageModel,
    providerId: AdvisorProviderId,
    signal?: AbortSignal
  ) => Promise<T>,
  opts?: AdvisorFallbackOptions
): Promise<T> {
  if (chain.length === 0) {
    throw new Error(
      "No LLM key configured. Set GROQ_API_KEY (or OPENROUTER_API_KEY / NVIDIA_API_KEY / CEREBRAS_API_KEY) in .env.local."
    );
  }
  const order = usableChain(chain);
  let lastErr: unknown;
  for (let i = 0; i < order.length; i++) {
    const candidate = order[i]!;

    // The caller gave up (client disconnected, request aborted). Failing
    // over to another provider would just burn quota answering nobody.
    if (opts?.signal?.aborted) {
      throw opts.signal.reason ?? new Error("Request aborted");
    }

    const remaining =
      opts?.deadlineAt != null ? opts.deadlineAt - Date.now() : null;

    if (remaining != null && remaining < MIN_ATTEMPT_MS && i > 0) {
      console.error(
        `[ai] out of time budget after "${order[i - 1]!.id}", skipping ${
          order.length - i
        } remaining provider(s)`
      );
      break;
    }

    // Split what's left across the providers still to try, so one hung
    // provider can't spend the entire budget on its own.
    const slice =
      remaining == null
        ? null
        : Math.max(MIN_ATTEMPT_MS, Math.floor(remaining / (order.length - i)));

    try {
      return await fn(
        candidate.model,
        candidate.id,
        attemptSignal(opts?.signal, slice)
      );
    } catch (err) {
      console.error(`[ai] provider "${candidate.id}" failed`, err);
      // A rate limit or outage won't clear in the seconds before the next
      // request, so park this provider instead of leading with it again.
      const { status } = describeAdvisorError(err);
      if (status === 429 || status === 503 || status === 504) {
        markProviderUnhealthy(candidate.id);
      }
      lastErr = err;
    }
  }
  const tried = order.map((c) => c.id).join(", ");
  console.error(
    `[ai] advisor chain exhausted after ${order.length} provider(s): ${tried}`,
    lastErr
  );
  throw lastErr ?? new Error("AI request timed out before any provider replied");
}

/**
 * Streaming needs a provider chosen BEFORE `streamText` starts (there's no
 * clean way to swap providers mid-stream once bytes are flowing to the
 * client). Remember the last provider that actually streamed tokens.
 * Do not ping with a dummy generateText: that burned a quota slot and
 * delayed the first real token. Chat already peeks the live stream and
 * failovers if the first bytes never arrive.
 */
const streamingProviderCache = new Map<
  string,
  { candidate: AdvisorProviderCandidate; at: number }
>();
const STREAMING_PROVIDER_CACHE_TTL_MS = 5 * 60 * 1000;
const VISION_STREAMING_PROVIDER_CACHE_TTL_MS = 30 * 1000;

export function pickStreamingProvider(
  chain: AdvisorProviderCandidate[],
  cacheKey: string
): AdvisorProviderCandidate {
  if (chain.length === 0) {
    throw new Error(
      "No LLM key configured. Set GROQ_API_KEY (or OPENROUTER_API_KEY / NVIDIA_API_KEY / CEREBRAS_API_KEY) in .env.local."
    );
  }
  const order = usableChain(chain);
  if (order.length === 1) return order[0]!;

  const ttl = cacheKey.includes("vision")
    ? VISION_STREAMING_PROVIDER_CACHE_TTL_MS
    : STREAMING_PROVIDER_CACHE_TTL_MS;
  const cached = streamingProviderCache.get(cacheKey);
  if (
    cached &&
    Date.now() - cached.at < ttl &&
    order.some((c) => c.id === cached.candidate.id)
  ) {
    return cached.candidate;
  }

  return order[0]!;
}

export function rememberStreamingProvider(
  cacheKey: string,
  candidate: AdvisorProviderCandidate
) {
  streamingProviderCache.set(cacheKey, { candidate, at: Date.now() });
}

/** Drop a cached choice after a real request against it fails. */
export function invalidateStreamingProvider(cacheKey: string) {
  streamingProviderCache.delete(cacheKey);
}

/**
 * Classify a thrown LLM/provider error into a user-facing message + HTTP
 * status. OpenRouter's free-models-per-day cap is account-wide (shared
 * across every `:free` model), so falling back to a different free OpenRouter
 * model can't help there — Margus instead falls through to a different
 * PROVIDER (Groq/NVIDIA/Cerebras) when one is configured.
 */
/**
 * Providers report the same failure in wildly different shapes: a message
 * with "429" in it, a bare "Too Many Requests", or a clean message with the
 * code only on `statusCode`. The AI SDK then buries the real one inside a
 * RetryError ("Failed after 4 attempts. Last error: ..."). Dig through all
 * of it so classification doesn't depend on one lucky substring.
 */
function extractStatusCode(err: unknown, depth = 0): number | null {
  if (!err || typeof err !== "object" || depth > 4) return null;
  const e = err as Record<string, unknown>;
  for (const key of ["statusCode", "status", "responseStatus"]) {
    const value = e[key];
    if (typeof value === "number" && value >= 400) return value;
  }
  return extractStatusCode(e.lastError ?? e.cause, depth + 1);
}

function collectMessages(err: unknown, depth = 0): string {
  if (!err || depth > 4) return "";
  if (typeof err === "string") return err;
  if (typeof err !== "object") return String(err);
  const e = err as Record<string, unknown>;
  const own = typeof e.message === "string" ? e.message : "";
  const nested = collectMessages(e.lastError ?? e.cause, depth + 1);
  return nested ? `${own} ${nested}` : own;
}

export function describeAdvisorError(err: unknown): {
  message: string;
  status: number;
} {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  const msg = collectMessages(err) || raw;
  const code = extractStatusCode(err);

  if (/free-models-per-day|models-per-day/i.test(msg)) {
    return {
      message: "Couldn't get a reply just then. Send it again.",
      status: 429,
    };
  }
  if (
    code === 429 ||
    /rate.?limit|429|too many requests|quota|temporar/i.test(msg)
  ) {
    return {
      message: "Couldn't get a reply just then. Send it again.",
      status: 429,
    };
  }
  if (code === 504 || code === 408 || /timeout|504|timed out/i.test(msg)) {
    return {
      message: "Couldn't get a reply just then. Send it again.",
      status: 504,
    };
  }
  if (code === 401 || code === 403 || /invalid api key|unauthorized|forbidden/i.test(msg)) {
    return {
      message:
        "Margus's API key was rejected by the provider. Check the key is still valid in the provider dashboard.",
      status: 502,
    };
  }
  // Deliberately narrow: matching any mention of a provider name here used
  // to swallow ordinary provider errors and mislabel them "missing key".
  if (/no llm key configured|_API_KEY/i.test(msg)) {
    return {
      message:
        "Margus could not start. The AI keys on this server are missing or rejected.",
      status: 503,
    };
  }
  if (code === 503 || code === 502 || /overloaded|unavailable/i.test(msg)) {
    return {
      message: "Couldn't get a reply just then. Send it again.",
      status: 503,
    };
  }
  if (/network|fetch|Failed to fetch|Load failed|aborted/i.test(msg)) {
    return {
      message: "Connection dropped. Refresh the page and try again.",
      status: 502,
    };
  }
  return { message: msg || "Couldn't get a reply just then. Send it again.", status: 500 };
}

/** Rate limit, overload, timeout: try another provider in this same request. */
export function isTransientAdvisorFailure(err: unknown): boolean {
  const { status, message } = describeAdvisorError(err);
  if (/could not start|api key was rejected|keys on this server/i.test(message)) {
    return false;
  }
  return status === 429 || status === 503 || status === 504;
}
