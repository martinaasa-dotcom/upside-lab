import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import {
  FREE_MODELS,
  freeModelIdOr,
  freeModelIds,
  isFreeModelId,
} from "@/lib/ai/free-models";
import {
  buildAdvisorProviderChain,
  resolveAdvisorFallbackIds,
  resolveAdvisorModelId,
} from "@/lib/ai/model";

const ENV_KEYS = [
  "MODEL",
  "MODEL_VISION",
  "MODEL_FORECAST",
  "MODEL_FALLBACKS",
  "MODEL_VISION_FALLBACKS",
  "OPENROUTER_MODEL",
  "OPENROUTER_VISION_MODEL",
  "OPENROUTER_API_KEY",
  "GEMINI_API_KEY",
  "GEMINI_MODEL",
  "CEREBRAS_API_KEY",
  "CEREBRAS_MODEL",
  "CEREBRAS_CHAT_MODEL",
];

let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  vi.restoreAllMocks();
});

describe("isFreeModelId", () => {
  it("takes an OpenRouter id only when it carries the :free suffix", () => {
    expect(isFreeModelId("openrouter", "google/gemma-4-31b-it:free")).toBe(true);
    expect(isFreeModelId("openrouter", "google/gemma-4-31b-it")).toBe(false);
    expect(isFreeModelId("openrouter", "anthropic/claude-sonnet-4")).toBe(false);
    expect(isFreeModelId("openrouter", "openai/gpt-5")).toBe(false);
  });

  it("refuses the suffixes that bill whatever the base model costs", () => {
    // :online adds the paid web-search plugin, and the auto router picks a
    // paid model on its own.
    expect(isFreeModelId("openrouter", "google/gemma-4-31b-it:online")).toBe(
      false
    );
    expect(isFreeModelId("openrouter", "openrouter/auto")).toBe(false);
  });

  it("takes a named provider's model only from the audited list", () => {
    expect(isFreeModelId("gemini", "gemini-flash-latest")).toBe(true);
    // Pro's free allowance varies per key tier, so it is not on the list.
    expect(isFreeModelId("gemini", "gemini-2.5-pro")).toBe(false);
    expect(isFreeModelId("cerebras", "gpt-oss-120b")).toBe(true);
    expect(isFreeModelId("cerebras", "llama-4-maverick-paid")).toBe(false);
  });

  it("refuses an empty or blank id rather than sending one", () => {
    expect(isFreeModelId("gemini", "")).toBe(false);
    expect(isFreeModelId("openrouter", "   ")).toBe(false);
  });
});

describe("freeModelIdOr", () => {
  it("keeps a free override", () => {
    expect(
      freeModelIdOr("openrouter", "meta/x:free", "google/gemma-4-31b-it:free")
    ).toBe("meta/x:free");
  });

  it("refuses a paid override out loud and answers with the default", () => {
    const spy = vi.spyOn(console, "error");
    expect(
      freeModelIdOr("openrouter", "openai/gpt-5", "google/gemma-4-31b-it:free")
    ).toBe("google/gemma-4-31b-it:free");
    expect(String(spy.mock.calls[0]?.[0])).toContain("openai/gpt-5");
  });

  it("throws on a paid in-code default rather than laundering it", () => {
    expect(() => freeModelIdOr("gemini", undefined, "some-paid-model")).toThrow(
      /not free-tier/
    );
  });
});

describe("freeModelIds", () => {
  it("drops paid entries and keeps the free ones in order", () => {
    expect(
      freeModelIds("openrouter", ["a:free", "openai/gpt-5", "b:free"])
    ).toEqual(["a:free", "b:free"]);
  });
});

describe("the advisor chain never sends a paid model", () => {
  it("refuses every paid OpenRouter override", () => {
    process.env.MODEL = "openai/gpt-5";
    process.env.MODEL_VISION = "anthropic/claude-sonnet-4";
    process.env.MODEL_FORECAST = "openai/gpt-5-mini";
    expect(resolveAdvisorModelId()).toMatch(/:free$/);
    expect(resolveAdvisorModelId({ vision: true })).toMatch(/:free$/);
    expect(resolveAdvisorModelId({ reasoning: true })).toMatch(/:free$/);
  });

  it("drops a paid id out of the OpenRouter server-side fallback list", () => {
    process.env.MODEL_FALLBACKS = "openai/gpt-5,mistralai/mistral-small:free";
    const ids = resolveAdvisorFallbackIds();
    expect(ids).toContain("mistralai/mistral-small:free");
    expect(ids.every((id) => id.endsWith(":free"))).toBe(true);
  });

  it("refuses a paid model on every provider leg", () => {
    process.env.OPENROUTER_API_KEY = "k";
    process.env.GEMINI_API_KEY = "k";
    process.env.CEREBRAS_API_KEY = "k";
    process.env.MODEL = "openai/gpt-5";
    process.env.GEMINI_MODEL = "gemini-2.5-pro";
    process.env.CEREBRAS_MODEL = "some-paid-cerebras-model";

    const chain = buildAdvisorProviderChain();
    expect(chain.map((c) => c.id).sort()).toEqual([
      "cerebras",
      "gemini",
      "openrouter",
    ]);
    for (const candidate of chain) {
      expect(isFreeModelId(candidate.id, candidate.modelId)).toBe(true);
    }
  });

  it("sends only free models with nothing configured at all", () => {
    process.env.OPENROUTER_API_KEY = "k";
    process.env.GEMINI_API_KEY = "k";
    process.env.CEREBRAS_API_KEY = "k";
    for (const options of [
      undefined,
      { vision: true },
      { reasoning: true },
      { speaking: true },
    ]) {
      for (const candidate of buildAdvisorProviderChain(options)) {
        expect(isFreeModelId(candidate.id, candidate.modelId)).toBe(true);
      }
      for (const id of resolveAdvisorFallbackIds(options)) {
        expect(isFreeModelId("openrouter", id)).toBe(true);
      }
    }
  });
});

describe("a paid-tier provider is not in the chain at all", () => {
  /*
    Free-ness on Groq is a property of the account, not of the model: a key
    on the paid tier bills per token for every model on it. So there is no
    Groq leg, and a Groq key present in the environment must not conjure
    one. A per-model allowlist could never have expressed this, which is
    why the leg is gone rather than narrowed.
  */
  it("builds no leg for a Groq key, whatever else is set", () => {
    process.env.GROQ_API_KEY = "k";
    process.env.GROQ_MODEL = "openai/gpt-oss-20b";
    process.env.GROQ_CHAT_MODEL = "openai/gpt-oss-20b";
    for (const options of [
      undefined,
      { vision: true },
      { reasoning: true },
      { speaking: true },
    ]) {
      const ids = buildAdvisorProviderChain(options).map((c) => String(c.id));
      expect(ids).not.toContain("groq");
    }
    delete process.env.GROQ_API_KEY;
    delete process.env.GROQ_MODEL;
    delete process.env.GROQ_CHAT_MODEL;
  });

  it("has no free-tier list to tempt a Groq leg back", () => {
    expect(Object.keys(FREE_MODELS)).not.toContain("groq");
  });
});

describe("model.ts cannot name a model outside the guard", () => {
  const src = readFileSync(new URL("./model.ts", import.meta.url), "utf8");

  /**
   * The guard only holds while every id in the file goes through it. A new
   * provider leg reading its own env variable and falling back to a literal
   * would pass every test above, because those exercise the legs that exist.
   */
  it("routes every model id through the free-tier check", () => {
    const sends = [...src.matchAll(/\.chat\(([^)]*)\)/g)].map((m) =>
      m[1]!.trim()
    );
    expect(sends.length).toBeGreaterThan(0);
    for (const arg of sends) {
      // A bare identifier, never an inline env read or a literal.
      expect(arg).toMatch(/^[A-Za-z][A-Za-z0-9]*$/);
      expect(src).toMatch(
        new RegExp(
          `const ${arg} = (freeModelIdOr\\(|resolveAdvisorModelId\\()`
        )
      );
    }
  });

  it("keeps every in-code default on the free tier", () => {
    const defaults = [...src.matchAll(/const \w*DEFAULT\w*MODEL = "([^"]+)"/g)];
    expect(defaults.length).toBeGreaterThanOrEqual(4);
    for (const [, id] of defaults) {
      const provider = id!.includes(":free")
        ? "openrouter"
        : id!.startsWith("gemini")
          ? "gemini"
          : "cerebras";
      expect(isFreeModelId(provider, id!), id).toBe(true);
    }
  });

  it("keeps every OpenRouter fallback default on the free tier", () => {
    for (const [, list] of src.matchAll(
      /const DEFAULT_\w*FALLBACKS[^=]*= \[([^\]]*)\]/g
    )) {
      const ids = [...list!.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
      expect(ids.length).toBeGreaterThan(0);
      for (const id of ids) expect(isFreeModelId("openrouter", id), id).toBe(true);
    }
  });
});

describe("FREE_MODELS", () => {
  it("has no empty provider list, since an empty one refuses everything", () => {
    for (const [provider, ids] of Object.entries(FREE_MODELS)) {
      expect(ids.length, provider).toBeGreaterThan(0);
    }
  });
});
