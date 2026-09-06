/**
 * The name of the model that answered, in words a reader can check.
 *
 * "A language model wrote this" is the sentence a skeptic stops believing
 * first, because it is unfalsifiable. Naming the model and who ran it is
 * the cheapest thing this app can do to be checkable: the reader can look
 * the name up, find out it is a free open-weight model rather than a hedge
 * fund's research desk, and calibrate accordingly. That is the honest
 * outcome, so nothing here dresses the answer up.
 *
 * Provider ids come from the fallback chain in `model.ts`, and the model id
 * is whatever was really sent on the wire, environment overrides included.
 * Nothing is guessed: a run that did not record which provider answered
 * says so rather than naming the one it probably was.
 */
import type { AdvisorProviderId } from "@/lib/ai/model";

/** What the API records about one model run, and hands to the client. */
export type ModelRun = {
  /** Which of the free-tier providers answered. */
  provider?: AdvisorProviderId | string | null;
  /** The model's own id, as sent. */
  model?: string | null;
};

/*
 * Keyed on strings rather than on `AdvisorProviderId`, because this map has
 * to answer for runs that already happened as well as for the chain as it
 * stands. A provider that leaves the chain keeps its entry: rows in the
 * forecast cache and the Pulse stamps carry the provider that wrote them,
 * and a reader opening the provenance mark on an old one is owed the name
 * of whoever actually ran it. Dropping an entry would answer "run by" with
 * nothing on a run that has a perfectly good answer.
 */
const HOSTS: Record<string, string> = {
  groq: "Groq",
  nvidia: "NVIDIA",
  openrouter: "OpenRouter",
  gemini: "Google",
  cerebras: "Cerebras",
};

/**
 * Who built the model, as opposed to who is running it for us. Reading
 * "gpt-oss-120b, run by Groq" and knowing that is an OpenAI open-weight
 * model is a different fact from knowing Groq served it, and a reader
 * checking up on us wants both.
 */
function makerOf(model: string): string | null {
  const id = model.toLowerCase();
  if (id.includes("gpt-oss") || id.startsWith("openai/")) return "OpenAI";
  if (id.includes("nemotron") || id.startsWith("nvidia/")) return "Nvidia";
  if (id.includes("gemma") || id.includes("gemini")) return "Google";
  if (id.includes("llama") || id.startsWith("meta")) return "Meta";
  if (id.includes("qwen")) return "Alibaba";
  if (id.includes("mistral") || id.includes("mixtral")) return "Mistral";
  if (id.includes("deepseek")) return "DeepSeek";
  return null;
}

/** Drop the vendor prefix and the `:free` suffix: `openai/gpt-oss-20b:free`
 * reads as `gpt-oss-20b`, which is the part anybody would search for. */
export function shortModelName(model: string): string {
  const noTier = model.split(":")[0] ?? model;
  const parts = noTier.split("/");
  return (parts[parts.length - 1] ?? noTier).trim();
}

/**
 * One sentence naming the model, or null when the run did not record one.
 * Null is a real answer here and the caller must handle it: inventing a
 * name is exactly the dishonesty this whole surface exists to undo.
 */
export function describeModelRun(run?: ModelRun | null): string | null {
  const model = run?.model?.trim();
  if (!model) return null;
  const name = shortModelName(model);
  const host = run?.provider ? HOSTS[String(run.provider)] ?? null : null;
  const maker = makerOf(model);

  if (maker && host && maker !== host) {
    return `${name}, built by ${maker} and run by ${host}`;
  }
  if (host) return `${name}, run by ${host}`;
  if (maker) return `${name}, built by ${maker}`;
  return name;
}
