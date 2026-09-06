import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isReusableTickerPath } from "@/lib/forecast-ticker-cache-store";

/*
  The attack this closes, stated as the request that performed it.

  `portfell_forecast_ticker_cache` is one row per company, shared by every
  portfolio holding it, for a fortnight. The row used to be written with a
  fingerprint of the reader's own written reason, computed per ticker, so a
  company the reader had written nothing about went in with an empty key,
  which `isReusableTickerPath` read as "nobody's words shaped this, fair
  game for anybody".

  But one prompt reasons every holding in the request together. So a request
  holding NVDA with no note on it, plus one junk holding whose written
  reason said what to write about NVDA, produced an NVDA row that had been
  steered, carried an empty key, and was then served to every reader holding
  NVDA, in the grid, in the provenance panel and in Margus's context.

  The written reason is gone from the whole product, which closes this by
  construction: there is no reader text anywhere near this prompt to steer
  anything with. Both halves are still asserted here, because the way this
  comes back is somebody putting a free-text field into the prompt again.
*/
describe("what may reach the table every reader drinks from", () => {
  it("still refuses an older row that was written shaped", () => {
    // The column stays and is still honoured, so rows written before the
    // written reason was removed cannot be served to anybody and need no
    // deletion: they simply age out unreachable.
    const shaped = {
      prices: { 2026: 100 },
      rationale: undefined,
      convictionKey: "5:Some earlier reader's words",
      generatedAt: new Date().toISOString(),
      anchorPrice: 100,
    };
    expect(isReusableTickerPath(shaped, { spot: 100 })).toBe(false);
  });

  it("hands back a row nobody's words ever shaped", () => {
    const clean = {
      prices: { 2026: 100 },
      rationale: undefined,
      convictionKey: "",
      generatedAt: new Date().toISOString(),
      anchorPrice: 100,
    };
    expect(isReusableTickerPath(clean, { spot: 100 })).toBe(true);
  });

  it("writes an empty key, so nothing new can ever be shaped", () => {
    const store = readFileSync(
      join(process.cwd(), "src/lib/forecast-ticker-cache-store.ts"),
      "utf8"
    );
    expect(store).toContain('conviction_key: ""');
  });
});

describe("the anchor is a price, not a figure off the request", () => {
  const route = readFileSync(
    join(process.cwd(), "src/app/api/forecast/plan/route.ts"),
    "utf8"
  );

  it("prices what it is about to publish from the server's own quotes", () => {
    /*
      `anchor_price` is half of what decides whether a row may stand in for
      a fresh run. Taken off the request, a caller could anchor a row far
      from the real price so it survives every drift check, or anchor it
      absurdly so no other reader can ever reuse it.
    */
    expect(route).toContain("serverAnchorPrices");
    const publish = route.slice(route.indexOf("void (async () =>"));
    expect(publish).toContain("anchorPrice: anchors[");
    expect(publish).not.toMatch(/anchorPrice:\s*spots\[/);
  });

  it("keeps the reader out of the wait for it", () => {
    // Fire and forget, as the write always was: the quote call is only
    // about what the next reader gets.
    expect(route).toContain("void (async () =>");
  });
});

describe("the prompt carries no free text the reader typed", () => {
  const plan = readFileSync(
    join(process.cwd(), "src/lib/forecast-plan.ts"),
    "utf8"
  );

  it("does not put the portfolio's name above the instructions", () => {
    /*
      Eighty characters of whatever somebody typed, sitting over the lines
      that produce every price path. It steered their own forecast as well
      as the shared rows, and a name buys nothing here: the same holdings
      called Retirement and called Fun Money should get the same answer.
    */
    expect(plan).not.toContain('portfolio "${input.portfolioName}"');
    const prompt = plan.slice(plan.indexOf("Build an actionable trim/add"));
    expect(prompt).not.toContain("input.portfolioName");
  });

  it("carries no written reason and no score at all", () => {
    // Both are gone from the product. Nothing a reader types reaches this
    // prompt now, which is what makes every run publishable.
    expect(plan).not.toContain("why they own it:");
    expect(plan).not.toContain("HOW SURE THEY ARE");
  });
});
