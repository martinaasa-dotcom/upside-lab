import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isPlausibleTicker, resolveImportTicker } from "@/lib/ticker";

/*
  Every other write path checked the shape of a symbol before storing it.
  The import did not, and `resolveImportTicker` and `normalizeYahooTicker`
  only uppercase and strip spaces, so whatever text sat in a broker export's
  symbol column went into `portfell_holdings.ticker`, which has no
  constraint on it.

  From there it is the primary key of the quote cache, a name the provider
  walk asks about on every poll, a line in the Pulse and forecast prompts,
  and a row in the Sunday letter. Asking a provider about free text is the
  most expensive thing that layer can be handed, because nothing resolves it
  and it walks the bare symbol plus every exchange suffix first.
*/
const route = readFileSync(
  join(process.cwd(), "src/app/api/holdings/import/route.ts"),
  "utf8"
);

describe("what an import may store as a symbol", () => {
  it("refuses text that is not symbol-shaped", () => {
    for (const junk of ["A(B", "AAPL; drop", "A".repeat(64), "n/a (see note)"]) {
      const resolved = resolveImportTicker(junk, undefined) || junk;
      expect(isPlausibleTicker(resolved.toUpperCase()), junk).toBe(false);
    }
  });

  it("cannot catch text that happens to look like a symbol, and does not pretend to", () => {
    /*
      `normalizeYahooTicker` strips spaces, so a broker's "NOT SHOWN" comes
      out as NOTSHOWN, which is indistinguishable from a real listing by
      shape alone. Nothing here can tell those apart, and inventing a rule
      that tried would start refusing real symbols.

      That case is already handled where it costs something: an unresolvable
      name is charged against the per-address budget before any provider is
      contacted, so it is one wasted lookup rather than an outage. What the
      shape check is for is the text no budget covers, because it never
      reaches a provider at all: a hundred kilobytes in a primary key, and a
      bracket in a symbol.
    */
    const resolved = resolveImportTicker("NOT SHOWN", undefined) || "NOT SHOWN";
    expect(resolved).toBe("NOTSHOWN");
    expect(isPlausibleTicker(resolved)).toBe(true);
  });

  it("still takes every real shape a broker exports", () => {
    for (const real of [
      "AAPL",
      "VOD.L",
      "BTC-USD",
      "^GSPC",
      "EURUSD=X",
      "ES=F",
      "BRK.B",
    ]) {
      expect(isPlausibleTicker(real), real).toBe(true);
    }
  });

  it("checks the shape in the import route, after resolving it", () => {
    // After, because an ISIN can turn a coin alias into a real listing and
    // the stored symbol is the resolved one.
    const loop = route.slice(route.indexOf("rows.map(async (row) =>"));
    const resolve = loop.indexOf("resolveImportTicker(");
    const check = loop.indexOf("isPlausibleTicker(ticker.toUpperCase())");
    expect(check).toBeGreaterThan(resolve);
    expect(loop.indexOf(".upsert(")).toBeGreaterThan(check);
  });

  it("fails the row rather than the import", () => {
    /*
      What the rest of this route does with a row it cannot use. One odd
      line in a hundred should not cost somebody the other ninety-nine, and
      the response already carries a `failed` list the screen shows.
    */
    const loop = route.slice(route.indexOf("rows.map(async (row) =>"));
    const check = loop.indexOf("isPlausibleTicker(ticker.toUpperCase())");
    const after = loop.slice(check, check + 200);
    expect(after).toContain("failed.push(");
    expect(after).not.toContain("NextResponse");
  });
});
