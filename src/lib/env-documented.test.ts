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
  not mentioned at all. (The Groq leg is gone since: its key bills per
  token, so the chain is OpenRouter, Gemini, Cerebras.)

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
    expect(order).toEqual(["openrouter", "gemini", "cerebras"]);
    const written = order
      .map((n) => (n === "openrouter" ? "OpenRouter" : n[0]!.toUpperCase() + n.slice(1)))
      .join(" -> ");
    expect(example).toContain(written);
  });

  it("does not still call a provider it implements skipped", () => {
    expect(model).toContain('hasKey("CEREBRAS_API_KEY")');
    expect(example).not.toMatch(/Cerebras was evaluated and deliberately skipped/);
  });

  it("says which leg a picture skips, because one of them does", () => {
    // Cerebras is gated on `!vision`, so a screenshot import walks a
    // shorter chain than a text question does.
    expect(model).toContain('hasKey("CEREBRAS_API_KEY") && !vision');
    expect(example).toMatch(/skipped for a request carrying a picture/i);
  });

  it("has no Groq leg, because that key bills per token", () => {
    /*
      Free-ness on Groq is a property of the account rather than of the
      model, so a chain that reached for it at all would spend money on a
      paid-tier key. The check is on the code, not on the prose: a leg
      added back would otherwise pass every other test in this file.
    */
    expect(model).not.toContain('hasKey("GROQ_API_KEY")');
    expect(model).not.toContain("api.groq.com");
    expect(example).toMatch(/GROQ_API_KEY is ignored/);
  });
});
