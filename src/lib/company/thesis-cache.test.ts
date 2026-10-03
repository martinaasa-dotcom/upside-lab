import { describe, expect, it } from "vitest";
import {
  BRIEF_MAX_AGE_MS,
  BRIEF_MAX_DRIFT,
  BRIEF_SHOW_MAX_AGE_MS,
  briefIsShowable,
  briefWantsWriting,
  judgeBrief,
  missingBriefClaim,
  type StoredBrief,
} from "@/lib/company/brief-store";
import { briefStatusCopy } from "@/lib/company/brief-status-copy";
import { thesisEventOf, thesisNewsSince } from "@/lib/company/thesis-news";
import { wantsRewrite } from "@/lib/company/client";
import { withSpot, fairValueRead } from "@/lib/company/fair-value";
import { makeOrdinaryFacts } from "@/lib/company/facts-fixture";
import { sameMoney } from "@/lib/market/same-money";
import { orderWarmQueue } from "@/lib/research/warm";
import type { CompanyBrief } from "@/lib/ai/company-brief";
import type { CompanyArticle } from "@/lib/company/sources";

/**
 * A COMPANY PAGE IS WRITTEN ONCE AND KEPT UNTIL SOMETHING HAPPENS TO IT.
 *
 * The complaint this answers: opening a company meant waiting twenty
 * seconds for a model to rewrite an argument that had not changed since
 * yesterday. The page on file is now served at once, rewritten only when
 * the company reports, an event lands in the news, the price moves a fifth
 * or three weeks pass, and even then it is shown with a note while the new
 * one is written behind it. Every rule below is one of those, and the copy
 * that tells the reader which one fired.
 */

const BRIEF = { whatTheyDo: "x" } as unknown as CompanyBrief;
const NOW = new Date("2026-10-02T12:00:00.000Z");
const WRITTEN = "2026-09-28T09:00:00.000Z";

function row(over: Partial<StoredBrief> = {}): StoredBrief {
  return {
    brief: BRIEF,
    generatedAt: WRITTEN,
    factsKey: "v3|MU|500|50",
    anchorPrice: 100,
    ...over,
  };
}

function article(title: string, publishedAt: string): CompanyArticle {
  return {
    title,
    publisher: "Reuters",
    href: "https://example.com/a",
    publishedAt,
  };
}

describe("which headlines can change an argument", () => {
  it("counts events", () => {
    for (const title of [
      "Micron reports record quarterly revenue on AI memory demand",
      "Micron raises full-year guidance after strong quarter",
      "Micron agrees to buy chip packaging firm for $2 billion",
      "Micron CEO Sanjay Mehrotra to step down next year",
      "SEC opens investigation into Micron accounting",
      "US adds new export controls on memory chips to China",
      "FDA approves Lilly's new weight loss pill",
      "Micron cuts 2,000 jobs in restructuring",
      "Micron wins $6 billion government contract",
    ]) {
      expect(thesisEventOf(title), title).not.toBeNull();
    }
  });

  it("ignores the daily weather around a big company", () => {
    for (const title of [
      "Is it too late to buy Micron stock?",
      "3 reasons to buy Micron before earnings",
      "Morgan Stanley raises Micron price target to $200",
      "What to expect from Micron earnings this week",
      "Micron shares rise ahead of earnings",
      "Micron downgraded to neutral at Citi",
      "Micron stock jumps 4% on a strong day for chips",
    ]) {
      expect(thesisEventOf(title), title).toBeNull();
    }
  });

  it("only counts stories published after the page was written", () => {
    const before = article("Micron reports record revenue", "2026-09-27T12:00:00.000Z");
    const after = article("Micron CEO to step down", "2026-09-30T12:00:00.000Z");
    const noise = article("Is Micron a buy?", "2026-10-01T12:00:00.000Z");
    expect(thesisNewsSince([before], WRITTEN)).toBeNull();
    expect(thesisNewsSince([before, after, noise], WRITTEN)?.title).toBe(after.title);
    expect(thesisNewsSince([after], "not a date")).toBeNull();
  });
});

describe("what a stored page is judged to be", () => {
  it("serves a page nothing has happened to", () => {
    expect(judgeBrief(row(), { factsKey: "v3|MU|500|50", spot: 104, now: NOW })).toEqual({
      kind: "fresh",
    });
  });

  it("keeps a page on an ordinary price move, which is live in the browser", () => {
    const spot = 100 * (1 + BRIEF_MAX_DRIFT) - 1;
    expect(judgeBrief(row(), { spot, now: NOW }).kind).toBe("fresh");
  });

  it("marks it stale, and still showable, when the company reports", () => {
    const state = judgeBrief(row(), { factsKey: "v3|MU|600|70", now: NOW });
    expect(state).toEqual({ kind: "stale", reason: "figures" });
    expect(briefIsShowable(state)).toBe(true);
    expect(briefWantsWriting(state)).toBe(true);
  });

  it("does not show a page this app invalidated on purpose", () => {
    // An older facts key VERSION means the pages written under it were
    // wrong rather than old, which is not worth putting in front of anybody.
    expect(judgeBrief(row({ factsKey: "v2|MU|500|50" }), { factsKey: "v3|MU|500|50", now: NOW }).kind).toBe(
      "missing"
    );
  });

  it("marks it stale when an event lands in the news after it was written", () => {
    const state = judgeBrief(row(), {
      articles: [article("Micron agrees to buy rival", "2026-10-01T08:00:00.000Z")],
      now: NOW,
    });
    expect(state.kind).toBe("stale");
    expect(state.kind === "stale" && state.reason).toBe("news");
  });

  it("marks it stale when the price runs a fifth away", () => {
    const state = judgeBrief(row(), { spot: 79, now: NOW });
    expect(state.kind === "stale" && state.reason).toBe("price");
  });

  it("refreshes after three weeks even if nothing happened", () => {
    const old = new Date(NOW.getTime() - BRIEF_MAX_AGE_MS - 1000).toISOString();
    expect(judgeBrief(row({ generatedAt: old }), { now: NOW })).toEqual({
      kind: "stale",
      reason: "age",
    });
  });

  it("stops showing a page past the show limit", () => {
    const ancient = new Date(NOW.getTime() - BRIEF_SHOW_MAX_AGE_MS - 1000).toISOString();
    expect(judgeBrief(row({ generatedAt: ancient }), { now: NOW }).kind).toBe("missing");
    expect(judgeBrief(null, { now: NOW }).kind).toBe("missing");
  });

  it("asks for a rewrite only when one is due and the company can be written", () => {
    expect(wantsRewrite({ briefState: { kind: "fresh" }, thin: false })).toBe(false);
    expect(wantsRewrite({ briefState: { kind: "missing" }, thin: false })).toBe(true);
    expect(wantsRewrite({ briefState: { kind: "missing" }, thin: true })).toBe(false);
    // A page cached before the state existed is read as current.
    expect(wantsRewrite({ thin: false })).toBe(false);
  });

  it("reads a missing claim function as permission, not as a lost race", () => {
    expect(missingBriefClaim({ code: "PGRST202" })).toBe(true);
    expect(missingBriefClaim({ code: "42883" })).toBe(true);
    expect(missingBriefClaim({ code: "23505", message: "duplicate" })).toBe(false);
  });
});

describe("what the page says about its own written half", () => {
  const VERDICT = /\b(cheap|expensive|undervalued|overvalued|bargain|buy now|you should|we recommend)\b/i;
  const DASH = /[–—]/;

  const cases = [
    { kind: "fresh" } as const,
    { kind: "stale", reason: "figures" } as const,
    { kind: "stale", reason: "age" } as const,
    { kind: "stale", reason: "price", anchorPrice: 100, moved: -0.24 } as const,
    {
      kind: "stale",
      reason: "news",
      headline: { ...article("Micron agrees to buy rival", "2026-10-01T08:00:00.000Z"), event: "deal" },
    } as const,
  ];

  it("dates every note and names what happened, with no verdict and no dash", () => {
    for (const state of cases) {
      for (const rewriting of [false, true]) {
        const copy = briefStatusCopy({ state, ticker: "MU", briefAt: WRITTEN, rewriting });
        expect(copy, JSON.stringify(state)).not.toBeNull();
        expect(copy!.text).toMatch(/2026/);
        expect(copy!.text).not.toMatch(VERDICT);
        expect(copy!.text).not.toMatch(DASH);
      }
    }
  });

  it("quotes the headline and its publisher when the news is the reason", () => {
    const copy = briefStatusCopy({ state: cases[4], ticker: "MU", briefAt: WRITTEN });
    expect(copy?.text).toContain("Micron agrees to buy rival");
    expect(copy?.text).toContain("Reuters");
  });

  it("says nothing for a missing page nobody is writing", () => {
    expect(briefStatusCopy({ state: { kind: "missing" }, ticker: "MU", briefAt: null })).toBeNull();
    expect(
      briefStatusCopy({ state: { kind: "missing" }, ticker: "MU", briefAt: null, rewriting: true })?.label
    ).toBe("Being written");
  });
});

describe("only the price moves on a cached page", () => {
  it("moves the marker and the gap and never the fair value", () => {
    const facts = makeOrdinaryFacts();
    const read = fairValueRead(facts);
    const moved = withSpot(read, (facts.price ?? 100) * 1.1);
    expect(moved.estimate).toBe(read.estimate);
    expect(moved.spot).not.toBe(read.spot);
    if (read.estimate.price !== null && moved.spot !== null) {
      expect(moved.gap).toBeCloseTo((read.estimate.price - moved.spot) / moved.spot, 10);
    }
    expect(withSpot(read, null)).toBe(read);
  });

  it("places a live price only when it is in the page's own money", () => {
    expect(sameMoney({ price: 101, nativePrice: 101 }, "USD", 100)).toBe(101);
    // A euro listing reads the exchange's own figure, not the dollar one.
    expect(sameMoney({ price: 110, nativePrice: 95 }, "EUR", 94)).toBe(95);
    // Pence against a page folded to pounds is a unit mismatch, dropped.
    expect(sameMoney({ price: 30, nativePrice: 2400 }, "GBP", 24)).toBeNull();
    expect(sameMoney(undefined, "USD", 100)).toBeNull();
  });
});

describe("the warmer looks at the least recently checked companies first", () => {
  it("puts unwritten companies first, then the longest unchecked", () => {
    const order = orderWarmQueue(
      ["AAA", "BBB", "CCC", "DDD"],
      [
        { ticker: "AAA", generated_at: "2026-09-01", checked_at: "2026-10-02T06:00:00Z" },
        { ticker: "BBB", generated_at: "2026-09-20", checked_at: null },
        { ticker: "CCC", generated_at: "2026-09-10", checked_at: "2026-10-01T06:00:00Z" },
      ]
    );
    expect(order).toEqual(["DDD", "BBB", "CCC", "AAA"]);
  });
});
