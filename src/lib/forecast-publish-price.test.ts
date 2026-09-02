import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/*
  A path may only be shared if it was reasoned from roughly the real price.

  The forecast route prints `spot=` into the prompt from the caller's own
  row, so a request claiming a company at $5.00 gets a five-year path off
  five dollars. That alone would be the caller's own business. What made it
  everybody's is the shared cache: `runIsShareable` lets a run with no
  conviction notes publish, and the publish block re-prices the anchor from
  the market, so the poisoned path lands beside a truthful anchor. It then
  passes every later age and drift check and is served to every other reader
  holding that company for up to a fortnight, under the provenance eye, as
  a fact. Nobody has to own the company to do it.

  The gate is on publication rather than on the reader's own view, because
  their price, their value and the weights derived from it are one
  consistent set and rewriting one mid-request would make a screen disagree
  with itself over a number nobody attacked.

  This file is a text guard rather than a behaviour test because the publish
  block is a fire-and-forget closure inside a 300-line handler with a model
  call in the middle of it, and a test that had to reach it would be mostly
  scaffolding. What it holds is the rule: the price the caller sent is
  compared against the market's before anything reaches the shared table.
*/

const SRC = readFileSync(
  path.resolve(__dirname, "../app/api/forecast/plan/route.ts"),
  "utf8"
);

describe("the shared forecast cache is not poisoned by a claimed price", () => {
  it("keeps what the caller claimed, apart from what the market says", () => {
    expect(
      SRC.includes("claimedSpots"),
      `The route no longer records the price the caller sent, so it cannot ` +
        `tell it apart from the market's own before publishing.`
    ).toBe(true);
    expect(SRC).toMatch(/const serverSpots = await serverAnchorPrices\(/);
  });

  it("prefers the market's price for the cache lookup", () => {
    /*
      The drift check that decides whether a cached row may be reused has to
      be made against a price the caller cannot set, or the same request can
      both poison a row and satisfy the check that would have caught it.
    */
    expect(SRC).toMatch(/const trusted = serverSpots\[key\];/);
    expect(SRC).toMatch(/if \(typeof trusted === "number" && trusted > 0\) spots\[key\] = trusted;/);
  });

  it("refuses to publish a run whose price disagrees with the market", () => {
    expect(
      SRC.includes("PUBLISHABLE_SPOT_DRIFT"),
      `The publish filter no longer compares the price the run was reasoned ` +
        `from against the market's. Without it, a request may set the spot ` +
        `the model reasons from and have the answer served to every other ` +
        `reader of that company.`
    ).toBe(true);
    expect(SRC).toMatch(
      /Math\.abs\(claimed - anchor\) \/ anchor <= PUBLISHABLE_SPOT_DRIFT/
    );
  });

  it("keeps the bound tight enough to be worth having", () => {
    const m = SRC.match(/const PUBLISHABLE_SPOT_DRIFT = ([0-9.]+);/);
    expect(m, "PUBLISHABLE_SPOT_DRIFT is gone").toBeTruthy();
    const drift = Number(m![1]);
    /*
      Wide enough for a reader's last poll to differ from this request,
      narrow enough that nothing useful can be moved through it. A bound
      loose enough to matter is the same hole with a number on it.
    */
    expect(drift).toBeGreaterThan(0);
    expect(drift).toBeLessThanOrEqual(0.05);
  });
});
