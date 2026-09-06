import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/*
  Every setting this app reads is written down somewhere a person can find
  it, and the file that writes them down says what the code actually does.

  Both halves failed at once. `.env.example` carried a paragraph saying
  Cerebras had been "evaluated and deliberately skipped", written up after
  the leg had been built, so somebody reading it would have concluded no
  Cerebras tier existed while `resolveAdvisorChain` was already adding one
  for any key it found. The same paragraph named the provider order as
  OpenRouter to Groq to Gemini, and the code walked Groq, OpenRouter,
  Gemini, Cerebras. Four provider settings and three migration knobs were
  not mentioned at all.

  None of that breaks anything, which is exactly why it drifted: a wrong
  comment costs nothing until somebody trusts it.
*/

/**
 * Names the code reads that are not configuration: what runtime this is,
 * who is running it, and whether this is a test. Each is here with the
 * reason, because an allowlist without one becomes a parking space.
 */
const NOT_CONFIGURATION: Record<string, string> = {
  NEXT_RUNTIME: "set by Next, says node or edge",
  NODE_ENV: "set by the toolchain, never by a person",
  VERCEL: "set by Vercel on its own machines",
  VERCEL_ENV: "set by Vercel, says production or preview",
  VITEST: "set by the test runner",
  UPSIDE_TEST_RUNNER: "set by scripts/test-invariants.ts for itself",
};

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const root = process.cwd();
const sources = [...walk(join(root, "src")), ...walk(join(root, "scripts"))];
const used = new Set<string>();
for (const file of sources) {
  const text = readFileSync(file, "utf8");
  for (const m of text.matchAll(/process\.env\.([A-Z_][A-Z0-9_]*)/g)) {
    used.add(m[1]!);
  }
  // hasKey("GROQ_API_KEY") and friends read the environment by name too.
  for (const m of text.matchAll(/hasKey\("([A-Z_][A-Z0-9_]*)"\)/g)) {
    used.add(m[1]!);
  }
}

const example = readFileSync(join(root, ".env.example"), "utf8");
const documented = new Set(
  [...example.matchAll(/^#?\s*([A-Z_][A-Z0-9_]*)=/gm)].map((m) => m[1]!)
);

describe("every setting is written down", () => {
  it("mentions each one in .env.example, or says why it is not a setting", () => {
    const missing = [...used]
      .filter((name) => !documented.has(name))
      .filter((name) => !(name in NOT_CONFIGURATION));
    expect(missing.sort()).toEqual([]);
  });

  it("keeps the not-a-setting list honest", () => {
    // An entry naming something the code no longer reads is a stale excuse.
    for (const name of Object.keys(NOT_CONFIGURATION)) {
      expect(used.has(name), `${name} is allowlisted but nothing reads it`).toBe(
        true
      );
      expect(NOT_CONFIGURATION[name]!.length).toBeGreaterThan(10);
    }
  });
});

describe("what it says about the model chain is what the chain does", () => {
  const model = readFileSync(join(root, "src/lib/ai/model.ts"), "utf8");

  it("names the providers in the order the code adds them", () => {
    /*
      The order is the whole of what a reader wants from that paragraph,
      and it was backwards. Read it out of the source rather than trusting
      a second copy of it.
    */
    const order = [...model.matchAll(/hasKey\("([A-Z_]+)_API_KEY"\)/g)].map(
      (m) => m[1]!.toLowerCase()
    );
    expect(order).toEqual([
      "groq",
      "nvidia",
      "openrouter",
      "gemini",
      "cerebras",
    ]);
    // Two providers spell themselves rather than capitalising: the rest
    // are just their own name with a capital on the front.
    const SPELT: Record<string, string> = {
      openrouter: "OpenRouter",
      nvidia: "NVIDIA",
    };
    const written = order
      .map((n) => SPELT[n] ?? n[0]!.toUpperCase() + n.slice(1))
      .join(" -> ");
    expect(example).toContain(written);
  });

  it("does not still call a provider it implements skipped", () => {
    expect(model).toContain('hasKey("CEREBRAS_API_KEY")');
    expect(example).not.toMatch(/Cerebras was evaluated and deliberately skipped/);
  });

  it("says which legs a picture skips, because three of them do", () => {
    // Groq, NVIDIA and Cerebras are each gated on `!vision`, so a
    // screenshot import walks a shorter chain than a text question does.
    for (const key of ["GROQ", "NVIDIA", "CEREBRAS"]) {
      expect(model).toContain(`hasKey("${key}_API_KEY") && !vision`);
    }
    expect(example).toMatch(/skipped for a request carrying a picture/i);
  });

  it("says out loud what every leg's free-ness depends on", () => {
    /*
      The one thing no test can check is whether the account behind a key
      has a card on it, and it is the thing that decides whether four of
      these five legs are free at all. Groq proved it twice: removed when
      its key was a paid-tier one, back when a cardless account replaced
      it. So the file a person edits when they add a key has to carry the
      condition, where somebody attaching a card is looking.
    */
    expect(example).toMatch(/no payment method attached/i);
  });
});
