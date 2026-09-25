/**
 * A cached Pulse check is a snapshot, not live data: Pulse's own per-ticker
 * cache is retained indefinitely for a quiet name (see
 * `loadPulseTickerCache`'s own note in thesis-pulse.ts). The chat prompt's
 * "Margus memory" block used to print it as `Pulse now: Thesis intact,
 * Above recent range: ...` with no date at all, and the block's own header
 * tells the model to "answer from here" as settled fact — the same class of
 * stale range claim fixed in the Sunday letter (weekly-letter.ts), just fed
 * straight into the chat model instead of an inbox.
 */
import { describe, expect, it } from "vitest";

import { buildCcSystemPrompt, type CcChatContext } from "@/lib/ai/cc-advisor";
import type { PulseCheck } from "@/lib/thesis-pulse";

function context(over: Partial<CcChatContext> = {}): CcChatContext {
  return {
    portfolioName: "Retirement",
    cashBalance: 1000,
    holdings: [],
    rows: [],
    totals: {
      cost: 0,
      value: 0,
      roiPct: 0,
      roiDollar: 0,
      yield3wAvg: 0,
      premiumTotal: 0,
    },
    ...over,
  };
}

function pulseCheck(over: Partial<PulseCheck> = {}): PulseCheck {
  return {
    ticker: "CRWV",
    situation: ["Ran hard on a strong quarter."],
    moveReason: "A broker raised what it expects the company to earn.",
    thesisStatus: "intact",
    earningsNote: "Results are about three weeks away.",
    action: "trim",
    addLevel: "",
    verdict: "The reason you own it is intact.",
    checkedAt: "2026-09-01T12:00:00.000Z",
    ...over,
  };
}

describe("the chat prompt dates a cached Pulse read, never presents it as now", () => {
  it("never says 'Pulse now:'", () => {
    const p = buildCcSystemPrompt(
      context({ pulseByTicker: { CRWV: pulseCheck() } })
    );
    expect(p).not.toMatch(/Pulse now:/);
  });

  it("carries the date the check was actually written", () => {
    const p = buildCcSystemPrompt(
      context({ pulseByTicker: { CRWV: pulseCheck() } })
    );
    expect(p).toMatch(/Pulse \(2026-09-01\):/);
  });

  it("still asserts the range claim, but only alongside its own date", () => {
    const p = buildCcSystemPrompt(
      context({ pulseByTicker: { CRWV: pulseCheck() } })
    );
    // The claim itself is unchanged (actionLabel("trim") is still "Above
    // recent range") — what changed is that it can no longer appear with
    // no timestamp attached to it anywhere in the line.
    const line = p.split("\n").find((l) => l.includes("Above recent range"));
    expect(line).toBeTruthy();
    expect(line).toMatch(/\(2026-09-01\)/);
  });

  it("falls back to a bare '?' rather than a fabricated date when none is on the check", () => {
    const p = buildCcSystemPrompt(
      context({
        pulseByTicker: { CRWV: pulseCheck({ checkedAt: undefined }) },
      })
    );
    expect(p).toMatch(/Pulse \(\?\):/);
  });
});
