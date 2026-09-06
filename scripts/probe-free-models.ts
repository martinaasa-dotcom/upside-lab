/**
 * Live check of the free advisor chain. Not a CI job: it needs real keys
 * and it talks to Groq / NVIDIA / OpenRouter / Cerebras.
 *
 *   npx tsx scripts/probe-free-models.ts
 *
 * Prints which keys are present (never the values), whether the configured
 * OpenRouter :free slugs still exist and advertise tools, and which
 * fallbacks the app would walk. Fail-open lives in the product
 * (`fallbackWeeklyTake`, `buildFallbackPulseCheck`, `buildFallbackForecastPlan`).
 */
import {
  resolveAdvisorFallbackIds,
  resolveAdvisorModelId,
} from "../src/lib/ai/model";

function hasKey(name: string): boolean {
  const v = process.env[name];
  return Boolean(v && v !== "your_key_here");
}

type OpenRouterModel = {
  id: string;
  supported_parameters?: string[];
};

async function listOpenRouterFree(): Promise<OpenRouterModel[]> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key || key === "your_key_here") return [];
  const res = await fetch("https://openrouter.ai/api/v1/models", {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) {
    throw new Error(`OpenRouter models ${res.status}`);
  }
  const body = (await res.json()) as { data?: OpenRouterModel[] };
  return (body.data ?? []).filter((m) => m.id.endsWith(":free"));
}

function reportKeys() {
  const names = [
    "GROQ_API_KEY",
    "NVIDIA_API_KEY",
    "OPENROUTER_API_KEY",
    "CEREBRAS_API_KEY",
  ] as const;
  for (const name of names) {
    console.log(`${name}: ${hasKey(name) ? "set" : "missing"}`);
  }
}

async function main() {
  reportKeys();
  const primary = resolveAdvisorModelId();
  const fallbacks = resolveAdvisorFallbackIds();
  const vision = resolveAdvisorModelId({ vision: true });
  console.log(`text primary: ${primary}`);
  console.log(`text fallbacks: ${fallbacks.join(", ") || "(none)"}`);
  console.log(`vision primary: ${vision}`);

  if (!hasKey("OPENROUTER_API_KEY")) {
    console.log("skip OpenRouter catalogue (no key)");
    return;
  }

  const free = await listOpenRouterFree();
  const byId = new Map(free.map((m) => [m.id, m]));
  const wanted = [primary, ...fallbacks, vision];
  let missing = 0;
  let noTools = 0;
  for (const id of wanted) {
    if (!id.endsWith(":free")) continue;
    const row = byId.get(id);
    if (!row) {
      console.log(`MISSING ${id}`);
      missing += 1;
      continue;
    }
    const tools = row.supported_parameters?.includes("tools") ?? false;
    if (!tools) {
      console.log(`NO_TOOLS ${id}`);
      noTools += 1;
      continue;
    }
    console.log(`ok ${id}`);
  }
  if (missing || noTools) {
    console.log(
      `${missing} missing, ${noTools} without tools. Swap DEFAULT_TEXT_MODEL / fallbacks in src/lib/ai/model.ts.`
    );
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
