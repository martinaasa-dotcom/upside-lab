import { describe, expect, it } from "vitest";
import {
  alertDestination,
  alertSinceLine,
  buildLadderAlerts,
  buildDecisionAlerts,
  buildEarningsAlerts,
  buildStrikeAlerts,
  concentration,
  concentrationCostLine,
  spokenDate,
} from "@/lib/alerts";

describe("a target the app worked out is not a target you set", () => {
  const row = {
    ticker: "AAPL",
    spot: 240,
    stockTarget: 220,
    nextStrike: null,
  };

  it("only claims the number as the reader's when the reader typed it", () => {
    const [hand] = buildStrikeAlerts([{ ...row, targetIsHandSet: true }]);
    expect(hand!.title).toContain("the price you were aiming for");
    expect(hand!.detail).toContain("you wrote down");
  });

  it("says the app pencilled it in when nobody set it", () => {
    const [modelled] = buildStrikeAlerts([{ ...row, targetIsHandSet: false }]);
    expect(modelled!.title).toContain("pencilled in");
    expect(modelled!.detail).toContain("Nobody set that number");
    // The whole point: it must not tell a beginner they set something.
    expect(modelled!.detail).not.toContain("you set");
    expect(modelled!.title).not.toContain("you were aiming");
  });

  it("defaults to the modelled wording when the caller says nothing", () => {
    const [unsaid] = buildStrikeAlerts([row]);
    expect(unsaid!.title).toContain("pencilled in");
  });

  it("carries the reader's own arithmetic about the gap", () => {
    const [hand] = buildStrikeAlerts([{ ...row, targetIsHandSet: true }]);
    expect(hand!.learn).toContain("$20.00");
    expect(hand!.learn).toContain("9.1%");
  });
});

describe("a results day is said in plain words", () => {
  it("never says reports, and prints a real weekday", () => {
    const [alert] = buildEarningsAlerts(
      [{ ticker: "AAPL", date: "2026-09-04", days: 3 }],
      true
    );
    expect(alert!.title).toBe("$AAPL shares its quarterly results in 3 days");
    // Date order is the reader's locale's business (`formatDateTime` pins
    // only the hour), so the check is the weekday and the day, never the
    // order they come in.
    expect(alert!.detail).toContain("Friday");
    expect(alert!.detail).toContain("September");
    expect(alert!.detail).toContain("4");
    expect(alert!.detail).not.toContain("2026-09-04");
  });

  it("says today and tomorrow rather than in 0 days", () => {
    const [today] = buildEarningsAlerts([
      { ticker: "X", date: "2026-09-04", days: 0 },
    ]);
    const [tomorrow] = buildEarningsAlerts([
      { ticker: "X", date: "2026-09-05", days: 1 },
    ]);
    expect(today!.title).toContain("results today");
    expect(tomorrow!.title).toContain("results tomorrow");
  });

  it("hands a date it cannot read straight back rather than inventing one", () => {
    expect(spokenDate("soon")).toBe("soon");
  });
});

describe("one holding growing large is worked out once", () => {
  const input = {
    topTicker: { ticker: "NVDA", value: 4000 },
    equityValue: 10000,
    cash: 10000,
  };

  it("carries both shares, and they use different denominators on purpose", () => {
    const conc = concentration(input);
    expect(conc!.shareOfStocks).toBeCloseTo(0.4, 6);
    expect(conc!.shareOfPortfolio).toBeCloseTo(0.2, 6);
    expect(conc!.large).toBe(true);
  });

  it("costs the reader's own day out of the share of everything", () => {
    expect(concentrationCostLine(concentration(input)!)).toBe(
      "If $NVDA moved 10% in a day, that on its own would move everything you own by about 2.0%."
    );
  });

  it("does not read as a contradiction when some of it was borrowed", () => {
    /*
      With cash below zero the share of the reader's own money is LARGER
      than the share of the stocks, so "$NVDA is 52% of your stocks. That is
      68% of everything you own" reads as two numbers arguing. The
      arithmetic is right; the words have to say which money they mean.
    */
    const [alert] = buildDecisionAlerts({
      topTicker: { ticker: "NVDA", value: 19500 },
      equityValue: 37500,
      cash: -8700,
    }).filter((a) => a.kind === "concentration");
    expect(alert!.detail).toContain("was borrowed");
    expect(alert!.detail).toContain("$19,500");
    expect(alert!.detail).toContain("$28,800");
    expect(alert!.detail).not.toContain("everything you own");
    expect(alert!.learn).toContain("your own money");
    expect(alert!.learn).not.toContain("everything you own");
  });

  it("never prints a share of the reader's own money that can pass 100%", () => {
    // A loan can leave one holding worth more than every dollar in the
    // account that is the reader's, and a percentage there reads as broken
    // even when it is right. Dollars against dollars cannot.
    const [alert] = buildDecisionAlerts({
      topTicker: { ticker: "NVDA", value: 19500 },
      equityValue: 28500,
      cash: -9000,
    }).filter((a) => a.kind === "concentration");
    expect(alert!.detail).not.toMatch(/1\d\d% of/);
    expect(alert!.detail).toContain("$19,500");
  });

  it("says everything you own when nothing was borrowed", () => {
    const [alert] = buildDecisionAlerts({
      topTicker: { ticker: "NVDA", value: 19500 },
      equityValue: 37500,
      cash: 8700,
    }).filter((a) => a.kind === "concentration");
    expect(alert!.detail).toContain("everything you own once cash is counted");
    expect(alert!.learn).toContain("everything you own");
  });

  it("says nothing when no holding is large enough", () => {
    const alerts = buildDecisionAlerts({
      topTicker: { ticker: "NVDA", value: 1000 },
      equityValue: 10000,
      cash: 0,
    });
    expect(alerts.some((a) => a.kind === "concentration")).toBe(false);
  });
});

describe("borrowed money reaches a card with its tier on it", () => {
  it("stays calm and neutral at a normal size", () => {
    const [alert] = buildDecisionAlerts({ cash: -1000, equityValue: 20000 });
    expect(alert!.kind).toBe("margin");
    expect(alert!.tone).toBe("neutral");
    expect(alert!.id).toBe("decision-margin-steady");
    expect(alert!.cushion).toContain("before a broker could sell them");
  });

  it("says margin call out loud only at the top tier", () => {
    const [calm] = buildDecisionAlerts({ cash: -1000, equityValue: 20000 });
    const [loud] = buildDecisionAlerts({ cash: -9000, equityValue: 12000 });
    expect(calm!.detail).not.toContain("margin call");
    expect(loud!.tone).toBe("loss");
    expect(loud!.detail).toContain("margin call");
  });

  it("says nothing at all when nothing is borrowed", () => {
    expect(buildDecisionAlerts({ cash: 5000, equityValue: 20000 })).toEqual([]);
  });

  it("branches on kind, so a rewrite of the copy cannot move a tap", () => {
    const [alert] = buildDecisionAlerts({ cash: -9000, equityValue: 12000 });
    expect(alert!.kind).toBe("margin");
  });
});

describe("since when", () => {
  const monday = new Date(2026, 8, 7, 10, 0, 0).getTime();

  it("says nothing on the day the condition first appeared", () => {
    expect(alertSinceLine(monday, monday + 3 * 3600_000)).toBeNull();
  });

  it("names the weekday inside a week", () => {
    expect(alertSinceLine(monday, monday + 2 * 86_400_000)).toBe("Since Monday");
  });

  it("takes the date once a week has gone by", () => {
    const line = alertSinceLine(monday, monday + 20 * 86_400_000)!;
    expect(line.startsWith("Since ")).toBe(true);
    expect(line).toContain("September");
    expect(line).toContain("7");
    expect(line).not.toContain("Monday");
  });

  it("says nothing when there is nothing recorded", () => {
    expect(alertSinceLine(null)).toBeNull();
    expect(alertSinceLine(undefined)).toBeNull();
  });
});

describe("a ladder alert reads like this holding's own situation, not a mail merge", () => {
  it("gives two names in the same band different copy, driven by their own numbers", () => {
    const [big] = buildLadderAlerts([
      {
        ticker: "BMNR",
        spot: 24.96,
        bandId: "trim-most",
        bandLabel: "Trim 60%+",
        edge: 23.78,
        edited: false,
        share: 0.124,
        roiPct: 1.9,
      },
    ]);
    const [small] = buildLadderAlerts([
      {
        ticker: "AAPL",
        spot: 260,
        bandId: "trim-most",
        bandLabel: "Trim 60%+",
        edge: 250,
        edited: true,
        share: 0.02,
        roiPct: 0.12,
      },
    ]);
    expect(big!.detail).not.toBe(small!.detail);
    // The share is only worth a sentence once it is large enough to be
    // the reason the card was opened.
    expect(big!.detail).toContain("12.4% of what you own");
    expect(small!.detail).not.toContain("of what you own");
    // The gain is only carried on the trim band, and only when there is
    // one to report.
    expect(big!.detail).toContain("190% above what you paid");
    // An edited level reads as the reader's own rather than the app's
    // arithmetic.
    expect(small!.detail).toContain("level you set");
    expect(big!.detail).toContain("you have not changed");
  });

  it("gives every actionable band its own headline and sentence shape", () => {
    const base = { ticker: "X", spot: 10, edited: false, edge: 9 };
    const [trim] = buildLadderAlerts([
      { ...base, bandId: "trim-most", bandLabel: "Trim 60%+" },
    ]);
    const [full] = buildLadderAlerts([
      { ...base, bandId: "full", bandLabel: "Full position" },
    ]);
    const [more] = buildLadderAlerts([
      { ...base, bandId: "full-aggressive", bandLabel: "Full position, and more" },
    ]);
    const [exit] = buildLadderAlerts([
      { ...base, bandId: "exit", bandLabel: "Out of it" },
    ]);
    const titles = [trim, full, more, exit].map((a) => a!.title);
    expect(new Set(titles).size).toBe(4);
    expect(exit!.detail).toContain("stop describing the company you bought");
    expect(exit!.tone).toBe("warning");
    expect(trim!.tone).toBe("neutral");
  });

  it("says nothing about an em dash or an en dash", () => {
    const [alert] = buildLadderAlerts([
      {
        ticker: "X",
        spot: 10,
        bandId: "exit",
        bandLabel: "Out of it",
        edge: 12,
        edited: false,
        share: 0.3,
      },
    ]);
    expect(alert!.title).not.toMatch(/[–—]/);
    expect(alert!.detail).not.toMatch(/[–—]/);
  });
});

describe("a card's button goes where the fact can be acted on", () => {
  const ladder = buildLadderAlerts([
    {
      ticker: "NASA",
      spot: 23.55,
      bandId: "full",
      bandLabel: "Full position",
      edge: 22,
      edited: false,
    },
  ]);

  it("sends a price ladder alert to Research, where the level is written", () => {
    expect(ladder).toHaveLength(1);
    expect(alertDestination(ladder[0])).toBe("research");
    /*
      The card's own learn line already tells the reader the level lives on
      the company's page, so a button offering Pulse contradicted it.
    */
    expect(ladder[0].learn).toContain("Research page");
  });

  it("still sends every other card about a company to Pulse", () => {
    expect(alertDestination({ kind: "results", ticker: "NVDA" })).toBe("pulse");
    expect(alertDestination({ kind: "strike", ticker: "NVDA" })).toBe("pulse");
  });

  it("sends the borrowed-money card to the figure it is about", () => {
    expect(alertDestination({ kind: "margin" })).toBe("cash");
    expect(alertDestination({ kind: "concentration" })).toBe("overview");
  });
});
