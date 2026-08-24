/**
 * Margus proposes. Something else writes.
 *
 * Every tool in `cc-advisor.ts` returns an object describing a change and
 * touches no database. The write happens afterwards, through
 * `/api/holdings`, which re-checks `requirePortfolioOwner` on its own. That
 * is what makes the whole class of prompt-injection attack against the
 * assistant uninteresting: the worst a crafted message can do is make
 * Margus propose something wrong, which the reader sees and can decline,
 * and no phrasing reaches another person's book because the tool never had
 * a database handle to begin with.
 *
 * None of that is written down anywhere the compiler can see, though, and
 * the natural way to add a tool that needs to look something up is to
 * import the server client. The day one does, the guarantee is gone and
 * nothing fails. So this is the test that fails instead.
 *
 * It reads the source rather than calling the tools, because the property
 * is about what the module is allowed to reach, not about what one call
 * returns.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ADVISOR = join(__dirname, "cc-advisor.ts");
const source = readFileSync(ADVISOR, "utf8");

/** Anything that could reach the database from inside a tool. */
const FORBIDDEN_IMPORTS = [
  "@/lib/supabase/server",
  "@/lib/supabase/server-auth",
  "@supabase/supabase-js",
  "@supabase/ssr",
];

describe("the assistant cannot write", () => {
  it("has no way to reach the database", () => {
    for (const banned of FORBIDDEN_IMPORTS) {
      expect(
        source.includes(`from "${banned}"`),
        `cc-advisor.ts imports ${banned}. A tool that can reach the database ` +
          `can be talked into using it, and the reader never sees the write.`
      ).toBe(false);
    }
  });

  it("never calls a table or an RPC", () => {
    // `.from("portfell_...")`, `.rpc(`, `.insert(`, `.update(`, `.delete(`
    for (const call of [".rpc(", ".insert(", ".upsert(", ".from(PORTFELL"]) {
      expect(
        source.includes(call),
        `cc-advisor.ts contains ${call}, so a tool is writing rather than proposing.`
      ).toBe(false);
    }
  });

  it("keeps every tool's execute a pure proposal", () => {
    // Each `execute:` must return a value, not await a write. `await` inside
    // a tool is fine for reading market data, so this checks the narrower
    // thing: no `await` on anything that looks like persistence.
    const persistence = /await\s+\w*(supabase|admin|db)\w*\./i;
    expect(persistence.test(source)).toBe(false);
  });

  it("still has the tools it is supposed to have", () => {
    // A guard that passes because the file emptied out is not a guard.
    for (const tool of [
      "addHolding",
      "updateHolding",
      "removeHolding",
      "setCash",
      "importPortfolio",
    ]) {
      expect(source).toContain(`${tool}: tool(`);
    }
  });
});

describe("the endpoint that does write checks who is asking", () => {
  const holdings = readFileSync(
    join(__dirname, "../../app/api/holdings/route.ts"),
    "utf8"
  );

  it("re-checks ownership itself rather than trusting the caller", () => {
    // Margus's proposal arrives here as an ordinary edit from the browser,
    // indistinguishable from one the reader typed, which is exactly why
    // this route cannot take anybody's word for it.
    expect(holdings).toContain("requireAuthUser");
    expect(holdings).toContain("requirePortfolioOwner");
  });
});
