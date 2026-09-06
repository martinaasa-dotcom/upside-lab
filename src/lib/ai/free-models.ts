/**
 * Every model this app calls must be on its provider's free tier, and that
 * is a rule rather than a habit. The chain in `model.ts` was written that
 * way and nothing enforced it: every model id is an env override away from
 * being something else, and a paid slug does not fail, it bills. `MODEL`,
 * `MODEL_FORECAST`, `MODEL_FALLBACKS`, `GEMINI_MODEL` and `CEREBRAS_MODEL`
 * are all read straight from the environment, so a typo,
 * a copied line from a provider's docs, or somebody reaching for a smarter
 * model to fix one bad answer is all it takes.
 *
 * So an id is checked before it is sent, and a paid one is refused rather
 * than trimmed or corrected: the caller falls back to the audited default
 * and the refusal is logged with the name of the variable that carried it,
 * because a silent substitution is how somebody spends an afternoon
 * wondering why their override did nothing.
 *
 * Two shapes of check, because the two kinds of provider publish this
 * differently.
 *
 * OpenRouter states it in the slug: a model id ending `:free` is free by
 * OpenRouter's own definition, and one without the suffix is billed against
 * account credits even when the same model has a free variant. So that leg
 * takes any `:free` id and needs no list here, which also means a new free
 * model can be configured without a code change. Two suffixes are refused
 * on top of that: `:online` bills for the web-search plugin whatever the
 * base model costs, and the `openrouter/auto` router picks a paid model on
 * its own.
 *
 * Everyone else publishes it per model on a pricing page, so this file
 * holds the audited list. Adding one is a code change on purpose: it puts
 * the claim that a model is free in front of a reviewer, next to the date
 * it was checked, rather than in an environment variable nobody reads.
 */

/*
 * Groq is deliberately absent, and this is the file where that decision has
 * to be understood rather than worked around. Free-ness on Groq is a
 * property of the ACCOUNT and not of the model: a key on the paid tier
 * bills per token for every model on it, gpt-oss-20b included, so there is
 * no list of Groq model ids that would be safe to put here. `model.ts`
 * therefore has no Groq leg at all. Adding one back is not a matter of
 * adding ids to this file.
 */
export type ModelProviderId = "openrouter" | "gemini" | "cerebras";

/** Verified against each provider's own pricing/limits page, 2026-09-06. */
export const FREE_MODELS: Record<
  Exclude<ModelProviderId, "openrouter">,
  readonly string[]
> = {
  // ai.google.dev/pricing — the models with a free tier. Deliberately no
  // Pro entry: Pro's free allowance comes and goes per key tier, and a
  // model that is free for one key and billed for the next is not a model
  // this app can promise anything about.
  gemini: [
    "gemini-flash-latest",
    "gemini-flash-lite-latest",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.0-flash",
  ],
  // inference-docs.cerebras.ai — free-tier daily token grant.
  cerebras: ["gpt-oss-120b", "llama3.1-8b", "llama-3.3-70b", "qwen-3-32b"],
};

const OPENROUTER_FREE_SUFFIX = ":free";

/** Bills regardless of the base model, so no `:free` id wearing one passes. */
const OPENROUTER_PAID_SUFFIXES = [":online", ":extended", ":nitro"];

export function isFreeModelId(
  provider: ModelProviderId,
  modelId: string
): boolean {
  const id = modelId.trim();
  if (!id) return false;
  if (provider === "openrouter") {
    if (id === "openrouter/auto") return false;
    if (OPENROUTER_PAID_SUFFIXES.some((s) => id.endsWith(s))) return false;
    return id.endsWith(OPENROUTER_FREE_SUFFIX);
  }
  return FREE_MODELS[provider].includes(id);
}

function refusal(provider: ModelProviderId, modelId: string): string {
  if (provider === "openrouter") {
    return `[ai] refusing OpenRouter model "${modelId}": not a free-tier id. Only slugs ending ":free" are allowed.`;
  }
  const allowed = FREE_MODELS[provider].join(", ");
  return `[ai] refusing ${provider} model "${modelId}": not on the audited free tier. Allowed: ${allowed}. Add it to FREE_MODELS in src/lib/ai/free-models.ts once you have checked the provider's pricing page.`;
}

/**
 * The id to actually send. A configured id that is free is used; anything
 * else is refused out loud and the audited default takes its place.
 *
 * `fallback` is the in-code default and must itself be free: a paid default
 * would make this function launder one, so it throws rather than passing it
 * on. That failure is a bug in this repo, never a misconfiguration.
 */
export function freeModelIdOr(
  provider: ModelProviderId,
  configured: string | undefined,
  fallback: string
): string {
  if (!isFreeModelId(provider, fallback)) {
    throw new Error(
      `[ai] default ${provider} model "${fallback}" is not free-tier. Fix the default, do not widen the check.`
    );
  }
  if (!configured || configured === fallback) return fallback;
  if (isFreeModelId(provider, configured)) return configured;
  console.error(refusal(provider, configured));
  return fallback;
}

/** Same rule over a list: paid entries are dropped, free ones kept in order. */
export function freeModelIds(
  provider: ModelProviderId,
  ids: readonly string[]
): string[] {
  return ids.filter((id) => {
    if (isFreeModelId(provider, id)) return true;
    console.error(refusal(provider, id));
    return false;
  });
}
