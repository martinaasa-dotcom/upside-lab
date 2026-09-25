import { describe, expect, it } from "vitest";
import {
  DEFAULT_CALL_RULES,
  cardLine,
  oddsText,
  plannedCallHealth,
  rollSaid,
  sanitizeRules,
  soldCallHealth,
  validateCallDraft,
  type ContractReading,
  type TrackedCall,
} from "@/lib/options/tracked-calls";

const call = (over: Partial<TrackedCall> = {}): TrackedCall => ({
  id: "c1",
  portfolio_id: "p1",
  ticker: "NVDA",
  status: "sold",
  strike: 200,
  expiry: "2026-10-16",
  contracts: 2,
  premium: 4,
  opened_on: null,
  ...over,
});

const reading = (over: Partial<ContractReading> = {}): ContractReading => ({
  id: "c1",
  ticker: "NVDA",
  strike: 200,
  expiry: "2026-10-16",
  spot: 190,
  mid: 3,
  bid: 2.9,
  ask: 3.1,
  vol: 0.4,
  volSource: "market",
  delta: 0.35,
  quoted: true,
  roll: null,
  rollSearched: false,
  ...over,
});

const rules = DEFAULT_CALL_RULES;

describe("a sold call against the reader's rules", () => {
  it("flags the roll zone at the reader's delta, not a fixed one", () => {
    const r = reading({ delta: 0.72, mid: 12, spot: 208 });
    expect(soldCallHealth(call(), r, rules, 10).kind).toBe("roll");
    expect(soldCallHealth(call(), r, { ...rules, rollDelta: 0.8 }, 10).kind).toBe("watch");
  });

  it("flags the close zone once the kept share passes the reader's level", () => {
    const h = soldCallHealth(call(), reading({ delta: 0.12, mid: 1.6 }), rules, 12);
    expect(h.kind).toBe("close");
    expect(h.kept).toBeCloseTo(0.6, 5);
    expect(h.gainTotal).toBeCloseTo(480, 5);
    expect(h.closeCost).toBeCloseTo(320, 5);
    expect(soldCallHealth(call(), reading({ delta: 0.12, mid: 1.6 }), { ...rules, takeProfit: 0.7 }, 12).kind).toBe("ok");
  });

  it("does not urge buying back pennies on the last day", () => {
    const h = soldCallHealth(call(), reading({ delta: 0.03, mid: 0.05 }), rules, 1);
    expect(h.kind).toBe("close");
    expect(h.label).toBe("Nearly done");
    expect(h.urgent).toBe(false);
  });

  it("warns in the last week when the share sits above the strike", () => {
    const h = soldCallHealth(call(), reading({ delta: 0.58, spot: 202, mid: 5 }), rules, 3);
    expect(h.kind).toBe("assignment");
    expect(h.urgent).toBe(true);
  });

  it("puts a roll ahead of anything else", () => {
    // A roll-level delta wins even inside the last week.
    expect(soldCallHealth(call(), reading({ delta: 0.9, mid: 15 }), rules, 2).kind).toBe("roll");
  });

  it("says an expired call is expired whatever the delta", () => {
    expect(soldCallHealth(call(), reading({ delta: 1, spot: 250 }), rules, 0).kind).toBe("expired");
  });

  it("says nothing it cannot know", () => {
    const h = soldCallHealth(call(), null, rules, 10);
    expect(h.kind).toBe("unknown");
    expect(h.kept).toBeNull();
  });

  it("never tells the reader what to do in its own voice", () => {
    const cases = [
      reading({ delta: 0.8, mid: 14 }),
      reading({ delta: 0.1, mid: 1 }),
      reading({ delta: 0.55, mid: 6 }),
      reading({ delta: 0.2, mid: 3 }),
    ];
    for (const r of cases) {
      const h = soldCallHealth(call(), r, rules, 10);
      const text = `${h.read} ${h.move ?? ""}`;
      expect(text).not.toMatch(/\byou should\b|\bwe recommend\b|[—–]/i);
    }
  });
});

describe("a planned call", () => {
  it("says when the market reaches the reader's price", () => {
    const planned = call({ status: "planned", premium: 2.5 });
    expect(plannedCallHealth(planned, reading({ mid: 2.6 }), 10).kind).toBe("ready");
    expect(plannedCallHealth(planned, reading({ mid: 2 }), 10).kind).toBe("waiting");
    expect(plannedCallHealth({ ...planned, premium: null }, reading(), 10).label).toBe("Priced");
  });
});

describe("the roll sentence", () => {
  it("prints the credit in the reader's own money", () => {
    const text = rollSaid(
      { strike: 220, expiry: "2026-11-20", newMid: 6, closeMid: 5, net: 1, delta: 0.31, kind: "up-and-out" },
      2
    );
    expect(text).toContain("$220.00");
    expect(text).toContain("$200 in all");
    expect(text).toContain("0.31");
  });

  it("says out loud when no roll pays for itself", () => {
    const text = rollSaid(
      { strike: 210, expiry: "2026-11-20", newMid: 4, closeMid: 5, net: -1, delta: 0.5, kind: "up-and-out" },
      1
    );
    expect(text).toMatch(/Nothing later pays for itself/);
  });
});

describe("odds and rules", () => {
  it("reads delta as plain odds", () => {
    expect(oddsText(0.5)).toBe("about even");
    expect(oddsText(0.74)).toBe("about three in four");
    expect(oddsText(0.01)).toBe("close to none");
  });

  it("keeps a rule inside a sane range", () => {
    expect(sanitizeRules({ rollDelta: 5, takeProfit: 0.6 })).toEqual({ rollDelta: 0.7, takeProfit: 0.6 });
    expect(sanitizeRules(null)).toEqual(DEFAULT_CALL_RULES);
  });
});

describe("what may be stored", () => {
  it("takes a call as the broker shows it", () => {
    const v = validateCallDraft({ ticker: "nvda", status: "sold", strike: "200", expiry: "2026-10-16", contracts: 2, premium: 4.1 });
    expect(v.ok && v.draft.ticker).toBe("NVDA");
  });

  it("refuses a sold call with no premium and a date that is not one", () => {
    expect(validateCallDraft({ ticker: "NVDA", status: "sold", strike: 200, expiry: "2026-10-16", contracts: 1 }).ok).toBe(false);
    expect(validateCallDraft({ ticker: "NVDA", status: "planned", strike: 200, expiry: "2026-02-30", contracts: 1 }).ok).toBe(false);
    expect(validateCallDraft({ ticker: "NVDA", status: "planned", strike: 200, expiry: "2026-10-16", contracts: 1.5 }).ok).toBe(false);
    expect(validateCallDraft({ ticker: "NVDA", status: "planned", strike: 200, expiry: "2026-10-16", contracts: 1 }).ok).toBe(true);
  });
});

describe("the card's one sentence", () => {
  const view = (r: ContractReading, days: number, c = call()) => ({
    call: c,
    reading: r,
    health: c.status === "sold" ? soldCallHealth(c, r, rules, days) : plannedCallHealth(c, r, days),
    daysLeft: days,
  });

  it("names the buy-back rule and its cost, and does not repeat the figures", () => {
    const line = cardLine(view(reading({ delta: 0.07, mid: 1.08 }), 14, call({ premium: 32.84, contracts: 5 })), rules);
    expect(line).toBe("Past your 50% buy-back level. Buying it back costs $540.");
  });

  it("names the roll level", () => {
    expect(cardLine(view(reading({ delta: 0.8, mid: 12 }), 20), rules)).toMatch(/^Past your 0\.70 roll level\./);
  });

  it("is one sentence on an ordinary call", () => {
    expect(cardLine(view(reading({ delta: 0.2 }), 20), rules)).toMatch(/^Odds of the shares being taken: /);
  });

  it("says what a planned call pays", () => {
    const c = call({ status: "planned", premium: 5 });
    expect(cardLine(view(reading({ mid: 3 }), 20, c), rules)).toBe("Pays $3.00 a share now. You want $5.00.");
  });

  it("never carries a dash", () => {
    for (const d of [0.05, 0.3, 0.6, 0.9]) {
      expect(cardLine(view(reading({ delta: d }), 5), rules)).not.toMatch(/[–—]/);
    }
  });
});
