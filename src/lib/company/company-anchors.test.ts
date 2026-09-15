import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeOrdinaryFacts } from "@/lib/company/facts-fixture";

/**
 * The one shared answer to "what does this company look worth", as the
 * server builds it. Two things are worth holding here and both are ways
 * a figure reaches a ladder meaning something other than it says.
 *
 * PENCE ARE NOT POUNDS. Yahoo quotes an LSE listing in GBp, a hundred
 * times the pounds every other part of this app means by that listing's
 * money, so an unfolded reading would draw a ladder a hundred times
 * above the price it is measured against.
 *
 * AND A NAME THE FEED CANNOT ANSWER ABOUT IS ABSENT, NEVER A ZERO. The
 * caller reads a missing entry as "fall back to the range this browser
 * can see", and a zero would be a ladder centred on nothing.
 */
const fetchCompanyFacts = vi.hoisted(() => vi.fn());
vi.mock("@/lib/market/fundamentals", () => ({ fetchCompanyFacts }));
vi.mock("@/lib/supabase/server", () => ({ getSupabaseServer: () => null }));

const { loadCompanyAnchors } = await import("@/lib/company/company-anchors");

describe("loadCompanyAnchors", () => {
  beforeEach(() => {
    fetchCompanyFacts.mockReset();
  });

  it("folds a pence listing into pounds, price and window together", async () => {
    const inDollars = makeOrdinaryFacts({
      analystTargetMean: 120,
      analystCount: 20,
    });
    /*
      The very same company, quoted in pence: every figure that is a
      price is a hundred times bigger and every ratio is untouched,
      which is exactly what Yahoo hands back for an LSE listing. The
      answer must come out identical.
    */
    const PRICED = [
      "price",
      "fiftyTwoWeekHigh",
      "fiftyTwoWeekLow",
      "epsTrailing",
      "epsForward",
      "epsThisYear",
      "epsNextYear",
      "analystTargetMean",
      "analystTargetHigh",
      "analystTargetLow",
    ] as const;
    const pence: Record<string, unknown> = {};
    for (const field of PRICED) {
      const v = inDollars[field];
      if (typeof v === "number") pence[field] = v * 100;
    }
    const inPence = makeOrdinaryFacts({
      ...inDollars,
      ...pence,
      currency: "GBp",
    });

    fetchCompanyFacts.mockResolvedValue(inDollars);
    const dollars = (await loadCompanyAnchors(["TEST"])).TEST;
    fetchCompanyFacts.mockResolvedValue(inPence);
    const pounds = (await loadCompanyAnchors(["TEST.L"]))["TEST.L"];

    expect(pounds.currency).toBe("GBP");
    /*
      To the penny rather than exactly, and the residual is real: a
      method that rounds to two decimals rounds in whatever money it was
      handed, so a figure rounded in pence and then folded lands a
      hundredth of a penny from the same figure rounded in pounds. What
      this is watching for is a factor of a hundred.
    */
    expect(pounds.price).toBeCloseTo(dollars.price, 1);
    expect(pounds.high).toBeCloseTo(dollars.high!, 6);
    expect(pounds.low).toBeCloseTo(dollars.low!, 6);
  });

  it("leaves a dollar listing's own figures alone", async () => {
    fetchCompanyFacts.mockResolvedValue(
      makeOrdinaryFacts({ analystTargetMean: 120, analystCount: 20 })
    );
    const out = await loadCompanyAnchors(["TEST"]);
    expect(out.TEST.currency).toBe("USD");
    expect(out.TEST.high).toBe(120);
    expect(out.TEST.low).toBe(80);
  });

  it("leaves out a name the feed could not answer about", async () => {
    fetchCompanyFacts.mockResolvedValue(null);
    const out = await loadCompanyAnchors(["NOPE"]);
    expect(out.NOPE).toBeUndefined();
  });

  it("asks about each name once, however many times it is listed", async () => {
    fetchCompanyFacts.mockResolvedValue(
      makeOrdinaryFacts({ analystTargetMean: 120, analystCount: 20 })
    );
    await loadCompanyAnchors(["TEST", "test", " TEST "]);
    expect(fetchCompanyFacts).toHaveBeenCalledTimes(1);
  });

  it("never walks the feed more than the ceiling at once", async () => {
    let open = 0;
    let worst = 0;
    fetchCompanyFacts.mockImplementation(async () => {
      open += 1;
      worst = Math.max(worst, open);
      await new Promise((r) => setTimeout(r, 1));
      open -= 1;
      return makeOrdinaryFacts({ analystTargetMean: 120, analystCount: 20 });
    });
    const many = Array.from({ length: 30 }, (_, i) => `T${i}`);
    await loadCompanyAnchors(many);
    expect(worst).toBeLessThanOrEqual(6);
  });
});
