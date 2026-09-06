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
  "GROQ_API_KEY",
  "GROQ_MODEL",
  "GROQ_CHAT_MODEL",
  "NVIDIA_API_KEY",
  "NVIDIA_MODEL",
  "NVIDIA_CHAT_MODEL",
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
    expect(isFreeModelId("groq", "openai/gpt-oss-20b")).toBe(true);
    expect(isFreeModelId("groq", "some-model-groq-never-served")).toBe(false);
    expect(isFreeModelId("nvidia", "nvidia/nemotron-3-super-120b-a12b")).toBe(
      true
    );
    expect(isFreeModelId("nvidia", "nvidia/not-a-real-model")).toBe(false);
    expect(isFreeModelId("cerebras", "gpt-oss-120b")).toBe(true);
    expect(isFreeModelId("cerebras", "llama-4-maverick-paid")).toBe(false);
  });

  it("refuses an empty or blank id rather than sending one", () => {
    expect(isFreeModelId("groq", "")).toBe(false);
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
    expect(() => freeModelIdOr("groq", undefined, "some-paid-model")).toThrow(
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
    process.env.GROQ_API_KEY = "k";
    process.env.NVIDIA_API_KEY = "k";
    process.env.CEREBRAS_API_KEY = "k";
    process.env.MODEL = "openai/gpt-5";
    process.env.GROQ_MODEL = "some-paid-groq-model";
    process.env.NVIDIA_MODEL = "some-paid-nvidia-model";
    process.env.CEREBRAS_MODEL = "some-paid-cerebras-model";

    const chain = buildAdvisorProviderChain();
    expect(chain.map((c) => c.id).sort()).toEqual([
      "cerebras",
      "groq",
      "nvidia",
      "openrouter",
    ]);
    for (const candidate of chain) {
      expect(isFreeModelId(candidate.id, candidate.modelId)).toBe(true);
    }
  });

  it("sends only free models with nothing configured at all", () => {
    process.env.OPENROUTER_API_KEY = "k";
    process.env.GROQ_API_KEY = "k";
    process.env.NVIDIA_API_KEY = "k";
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

describe("a leg is only as free as the account behind its key", () => {
  /*
    Groq is here twice over. Its first key was a paid-tier one shared with
    another project, where every model bills per token, so the leg was
    deleted rather than narrowed: free-ness on Groq is a property of the
    ACCOUNT, and no list of model ids could have expressed that. A new
    cardless account brought it back. What a test CAN hold is the half that
    lives in code, which is that nothing reaches the wire unchecked; the
    other half, whether the account has a card, is written in .env.example
    beside the key, and env-documented.test.ts fails if that goes.
  */
  it("still refuses a paid model on the restored legs", () => {
    process.env.GROQ_API_KEY = "k";
    process.env.NVIDIA_API_KEY = "k";
    process.env.GROQ_MODEL = "some-paid-groq-model";
    process.env.NVIDIA_MODEL = "some-paid-nvidia-model";
    for (const candidate of buildAdvisorProviderChain()) {
      expect(isFreeModelId(candidate.id, candidate.modelId), candidate.id).toBe(
        true
      );
    }
  });

  it("gives a picture more than one leg to land on", () => {
    /*
      Deleting the Gemini key left screenshot import resting on OpenRouter
      alone, on the one screen a new reader meets first. Groq and NVIDIA
      both read the test image correctly through a forced tool call, so
      they carry vision too, on a different model from their text one.
    */
    process.env.GROQ_API_KEY = "k";
    process.env.NVIDIA_API_KEY = "k";
    process.env.OPENROUTER_API_KEY = "k";
    process.env.CEREBRAS_API_KEY = "k";
    const chain = buildAdvisorProviderChain({ vision: true });
    expect(chain.map((c) => c.id)).toEqual(["groq", "nvidia", "openrouter"]);
    // Cerebras has no vision model at all, so it stays out.
    expect(chain.map((c) => c.id)).not.toContain("cerebras");
    // And a picture must not be sent to a text-only model: both 400 with
    // "content must be a string", which is a failure, not a fallback.
    const groq = chain.find((c) => c.id === "groq")!;
    expect(groq.modelId).toBe("qwen/qwen3.8-27b");
    for (const candidate of chain) {
      expect(isFreeModelId(candidate.id, candidate.modelId)).toBe(true);
    }
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
      const decl = src.match(
        new RegExp(`const ${arg} =([\\s\\S]*?);\\n`)
      );
      expect(decl, `no declaration for ${arg}`).toBeTruthy();
      const init = decl![1]!;
      /*
        Assert the rule, not today's syntax. A leg may resolve its id
        through a ternary (text one way, vision the other), so what matters
        is that every branch went through the guard and that nothing falls
        back to a bare literal -- an env read coalesced to a model id is exactly
        the shape that would put an unchecked id on the wire.
      */
      expect(init, `${arg} bypasses the guard`).toMatch(
        /freeModelIdOr\(|resolveAdvisorModelId\(/
      );
      expect(init, `${arg} falls back to a bare literal`).not.toMatch(/\?\?\s*"/);
    }
  });

  it("keeps every in-code default on the free tier", () => {
    /*
      Read the provider off the constant's own name rather than guessing it
      from the shape of the id. Guessing worked until Groq and Cerebras both
      defaulted to a gpt-oss model and the heuristic sent one to the wrong
      allowlist, which is a test failing for a reason that has nothing to do
      with what it is checking.
    */
    /*
      Text defaults and vision defaults both, since a vision model reaches
      the wire exactly as a text one does. Named providers only: the
      OpenRouter ones are spelt DEFAULT_*_MODEL and carry the rule in the
      slug, and are checked separately below.
    */
    const named = new Map<string, string[]>();
    for (const [, name, id] of src.matchAll(
      /^const (\w+)_(?:DEFAULT|VISION)_MODEL = "([^"]+)"/gm
    )) {
      const provider = name!.toLowerCase();
      if (!(provider in FREE_MODELS)) continue;
      named.set(provider, [...(named.get(provider) ?? []), id!]);
    }
    // Every provider with an audited list has an in-code default, so a new
    // leg cannot arrive with its model named only in the environment.
    expect([...named.keys()].sort()).toEqual(Object.keys(FREE_MODELS).sort());
    for (const [provider, ids] of named) {
      for (const id of ids) {
        expect(
          isFreeModelId(provider as Parameters<typeof isFreeModelId>[0], id),
          `${provider} default ${id}`
        ).toBe(true);
      }
    }
    for (const [, id] of src.matchAll(/const DEFAULT_\w*MODEL = "([^"]+)"/g)) {
      expect(isFreeModelId("openrouter", id!), id).toBe(true);
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
