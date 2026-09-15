import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * A FIGURE KEEPS SAYING WHO WROTE IT, AND THAT ONLY HOLDS WHILE BOTH
 * WRITERS KEEP MARKING THEIRS.
 *
 * The prices live in one map and the words beside them in another, which
 * is what lets the value store keep the shape four surfaces, the account
 * and the published house default already read. The cost of that choice
 * is that the two can drift: a writer that saves a price and forgets the
 * mark leaves that figure reading as "saved earlier" forever, and a
 * third writer added later would put a model's number back into the pile
 * this app calls the reader's own.
 *
 * So the reach is checked rather than remembered. This reads text, so a
 * writer that hands off to a helper is beyond it; what it catches is the
 * shape somebody reaches for first, which is the shape that was there.
 */
describe("both writers say who wrote the figure", () => {
  const dashboard = readFileSync("src/components/Dashboard.tsx", "utf8");

  it("marks a hand-typed year as the reader's own", () => {
    const fn = dashboard.slice(
      dashboard.indexOf("function commitEoyPrice"),
      dashboard.indexOf("function applyMargusEoyPaths")
    );
    expect(fn).toMatch(/setEoyOverride\(/);
    expect(fn, "a typed price is recorded as the reader's own").toMatch(
      /setEoySource\([\s\S]*?"yours"\)/
    );
  });

  it("marks a forecast run as the model's", () => {
    const start = dashboard.indexOf("function applyMargusEoyPaths");
    const fn = dashboard.slice(start, start + 900);
    expect(fn).toMatch(/mergeEoyTargetPaths\(/);
    expect(fn, "a run's path is recorded as the model's").toMatch(
      /mergeEoySourcePaths\([\s\S]*?"model"\)/
    );
  });

  it("never hands a price to the account without the words beside it", () => {
    const store = readFileSync("src/lib/eoy-override-store.ts", "utf8");
    // Both halves in one request: a save that sent the figures alone
    // would blank what the account knows about who wrote them.
    expect(store).toMatch(/eoyOverrides:[\s\S]{0,120}eoySources:/);
  });

  it("publishes who wrote it beside the house default, never the price alone", () => {
    const sync = readFileSync("src/lib/forecast/house-forecast-sync.ts", "utf8");
    const route = readFileSync(
      "src/app/api/forecast/house-defaults/route.ts",
      "utf8"
    );
    expect(sync).toMatch(/eoy_sources/);
    expect(route).toMatch(/eoySources/);
    /*
      And the mirror moves them with the prices they describe: keeping
      the old words beside replaced figures would say a model wrote a
      price the account has since typed over.
    */
    expect(sync).toMatch(/input\.eoyOverrides !== undefined\s*\?\s*\(input\.eoySources/);
  });

});