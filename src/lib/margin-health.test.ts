/**
 * Borrowed money is a size question.
 *
 * The Cash card used to be one rose panel with a warning triangle on it at
 * anything below -$500, saying "Cash is -$20,000." and nothing else. That
 * is the same alarm for a portfolio borrowing 8% of itself as for one
 * borrowing 60%, and it never told the reader the number that separates
 * them. These pin the arithmetic that replaced it and the two thresholds
 * the tone turns on, because the whole point of the change is that the
 * loud version is reserved for the case that has earned it.
 */
import { describe, expect, it } from "vitest";
import { buildDecisionAlerts } from "@/lib/alerts";
import {
  CALL_RISK_SHARE,
  HEAVY_SHARE,
  MAINTENANCE_RATE,
  dropToMarginCall,
  marginCopy,
  marginHealth,
  marginTone,
} from "@/lib/margin-health";

/** Stocks worth `stocks`, of which `borrowed` is the broker's money. */
function health(stocks: number, borrowed: number) {
  return marginHealth({ cash: -borrowed, equityValue: stocks });
}

describe("distance to a margin call", () => {
  it("is closed form against a 50% maintenance floor", () => {
    // Own money is stocks - borrowed. The broker wants that to stay at or
    // above half of whatever the stocks are worth, so with $100k of stocks
    // and $20k borrowed: 100(1-f) - 20 >= 0.5 * 100(1-f) -> f <= 0.6.
    expect(dropToMarginCall(100_000, 20_000)).toBeCloseTo(0.6, 10);
    expect(dropToMarginCall(100_000, 10_000)).toBeCloseTo(0.8, 10);
    expect(dropToMarginCall(100_000, 40_000)).toBeCloseTo(0.2, 10);
  });

  it("checks out by simulating the fall", () => {
    const stocks = 250_000;
    const borrowed = 60_000;
    const f = dropToMarginCall(stocks, borrowed);
    const atFloor = stocks * (1 - f);
    expect(atFloor - borrowed).toBeCloseTo(atFloor * MAINTENANCE_RATE, 6);

    // One percent further down and the reader's own money is short of it.
    const past = stocks * (1 - f - 0.01);
    expect(past - borrowed).toBeLessThan(past * MAINTENANCE_RATE);
  });

  it("is a full fall with no loan and no room at all once the floor is met", () => {
    expect(dropToMarginCall(100_000, 0)).toBe(1);
    expect(dropToMarginCall(100_000, 50_000)).toBe(0);
    expect(dropToMarginCall(100_000, 90_000)).toBe(0);
    expect(dropToMarginCall(0, 5_000)).toBe(0);
  });

  it("never returns a fraction outside 0 to 1, on any input", () => {
    for (const stocks of [0, 1, 1_000, 250_000, 9_000_000]) {
      for (const borrowed of [0, 10, 5_000, 250_000, 40_000_000]) {
        const f = dropToMarginCall(stocks, borrowed);
        expect(Number.isFinite(f)).toBe(true);
        expect(f).toBeGreaterThanOrEqual(0);
        expect(f).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("how loud the card gets", () => {
  it("says nothing at all when there is no real loan", () => {
    expect(marginHealth({ cash: 12_000, equityValue: 100_000 }).tier).toBe("none");
    expect(marginHealth({ cash: 0, equityValue: 100_000 }).tier).toBe("none");
    expect(marginHealth({ cash: -12, equityValue: 100_000 }).tier).toBe("none");
    expect(marginCopy(health(100_000, 0))).toBeNull();
  });

  it("stays calm while the loan is under 30% of the portfolio", () => {
    // $20,000 borrowed against $250,000 of stocks is $230,000 of the
    // reader's own money, so the loan is under 9% of the portfolio.
    const h = health(250_000, 20_000);
    expect(h.borrowedShare).toBeLessThan(HEAVY_SHARE);
    expect(h.tier).toBe("steady");
    expect(marginTone(h.tier)).toBe("neutral");
  });

  it("turns the corner at exactly 30% and again at exactly 50%", () => {
    // share = borrowed / (stocks - borrowed), so a share of s needs
    // borrowed = stocks * s / (1 + s). A hair either side rather than the
    // exact figure, because the loan is money and money is rounded to the
    // cent, which lands a dead-on 30% a millionth under it.
    const stocks = 100_000;
    const at = (share: number) => (stocks * share) / (1 + share);
    const hair = 0.002;

    expect(health(stocks, at(HEAVY_SHARE - hair)).tier).toBe("steady");
    expect(health(stocks, at(HEAVY_SHARE + hair)).tier).toBe("heavy");
    expect(health(stocks, at(CALL_RISK_SHARE - hair)).tier).toBe("heavy");
    expect(health(stocks, at(CALL_RISK_SHARE + hair)).tier).toBe("call-risk");

    expect(marginTone("heavy")).toBe("warning");
    expect(marginTone("call-risk")).toBe("loss");
  });

  it("puts a loan bigger than the portfolio straight in the top tier", () => {
    const h = health(50_000, 60_000);
    expect(h.portfolioValue).toBeLessThan(0);
    // No share to quote when the reader's own money is gone, and the tier
    // must not fall through to a calm one on the missing number.
    expect(h.borrowedShare).toBeNull();
    expect(h.tier).toBe("call-risk");
    expect(h.dropToCall).toBe(0);
  });

  it("agrees with the cushion at the thresholds it names", () => {
    // 30% of the portfolio borrowed still leaves the stocks a fall of more
    // than half; at 50% it is a third, which is an ordinary bad year.
    const stocks = 100_000;
    const heavy = health(stocks, (stocks * HEAVY_SHARE) / (1 + HEAVY_SHARE));
    const risky = health(stocks, (stocks * CALL_RISK_SHARE) / (1 + CALL_RISK_SHARE));
    expect(heavy.dropToCall).toBeCloseTo(0.538, 2);
    expect(risky.dropToCall).toBeCloseTo(0.333, 2);
  });
});

describe("what the reader is told", () => {
  it("gives every tier a number and something to do", () => {
    for (const h of [
      health(250_000, 20_000),
      health(100_000, 25_000),
      health(100_000, 40_000),
      health(50_000, 60_000),
    ]) {
      const copy = marginCopy(h);
      expect(copy).not.toBeNull();
      // A figure in the title, so the card leads with the size rather than
      // with the word "borrowed".
      expect(copy!.title).toMatch(/[\d$]/);
      expect(copy!.detail.length).toBeGreaterThan(60);
    }
  });

  it("tells the calm case how far its stocks could fall, without a warning", () => {
    const copy = marginCopy(health(250_000, 20_000))!;
    expect(copy.cushion).toMatch(/fall \d+%/);
    expect(copy.detail).toMatch(/normal amount to carry/);
    expect(copy.detail).not.toMatch(/margin call/i);
  });

  it("names the margin call, and the way out of it, only at the top", () => {
    const copy = marginCopy(health(100_000, 40_000))!;
    expect(copy.detail).toMatch(/margin call/i);
    expect(copy.detail).toMatch(/without asking you first/);
    expect(copy.detail).toMatch(/[Pp]aying some of the loan back/);
    // And it says what floor it assumed, since 50% is stricter than a real
    // broker's and a reader checking the number deserves to find it.
    expect(copy.detail).toMatch(/50%/);
  });

  it("says the floor is already here rather than quoting a 0% fall", () => {
    const copy = marginCopy(health(50_000, 60_000))!;
    expect(copy.cushion).toMatch(/already at the level/);
    expect(copy.cushion).not.toMatch(/fall 0%/);
    // And the sentence above it must not still be calling that "close to"
    // the point, or the card argues with itself in front of the reader
    // with the least room to spare.
    expect(copy.detail).not.toMatch(/close to the point/);
    expect(copy.detail).toMatch(/at or past the point/);
    // Nor quote the $0 of their own money that Math.max leaves behind.
    expect(copy.detail).not.toMatch(/\$0 of your own money/);
  });

  it("keeps to the app's reading rules", () => {
    const banned =
      /\b(sleeve|marks|tape|digestion|dry powder|beta|risk-on|drawdown|rotation|net liq|leverage|levered)\b/i;
    for (const h of [
      health(250_000, 20_000),
      health(100_000, 25_000),
      health(100_000, 40_000),
      health(50_000, 60_000),
    ]) {
      const copy = marginCopy(h)!;
      const all = `${copy.title} ${copy.detail} ${copy.cushion ?? ""}`;
      expect(all).not.toMatch(/[—–]/);
      expect(all).not.toMatch(banned);
    }
  });
});

describe("the alert the Cash card reads", () => {
  function marginAlert(cash: number, equityValue: number) {
    const alerts = buildDecisionAlerts({ cash, equityValue, topTicker: null });
    return alerts.find((a) => a.id.startsWith("decision-margin")) ?? null;
  }

  it("does not fire on cash sitting in the account", () => {
    expect(marginAlert(20_000, 250_000)).toBeNull();
    expect(marginAlert(0, 250_000)).toBeNull();
  });

  it("carries a neutral tone for an ordinary loan", () => {
    const alert = marginAlert(-20_000, 250_000)!;
    expect(alert.tone).toBe("neutral");
    expect(alert.cushion).toMatch(/fall \d+%/);
  });

  it("carries a rose tone once the loan is half the portfolio", () => {
    const alert = marginAlert(-40_000, 100_000)!;
    expect(alert.tone).toBe("loss");
  });

  it("changes id when the tier changes, so a new tier is said out loud", () => {
    // Dismissals are stored per alert id. One id for every size of loan
    // meant somebody who waved off a calm note at 10% never heard again
    // at 60%, which is the one time it matters.
    const calm = marginAlert(-20_000, 250_000)!;
    const bad = marginAlert(-40_000, 100_000)!;
    expect(calm.id).not.toBe(bad.id);
  });
});
