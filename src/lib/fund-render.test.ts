import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: () => {}, replace: () => {}, refresh: () => {},
    back: () => {}, forward: () => {}, prefetch: () => {},
  }),
  usePathname: () => "/upside-portfolio",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
  redirect: () => {},
  notFound: () => {},
}));

vi.mock("@/components/AuthProvider", async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  return {
    ...real,
    useAuth: () => ({
      ready: true,
      user: { id: "u1", email: "someone@example.com" },
      profile: { id: "u1", display_name: "Someone", note_sunday: true },
      signOut: async () => {},
      refresh: async () => {},
    }),
  };
});

import {
  FundPosition,
  RecapBody,
  ReportDetail,
  WhatThisIs,
  type HoldingRow,
  type ReportRow,
  type WeeklyRecapRow,
} from "@/components/UpsidePortfolioPage";

/*
  RENDER THE FUND AND READ WHAT COMES OUT.

  This room had no render coverage at all. It cannot be reached signed out,
  and it never leaves its loading state without a live fetch of
  `/api/upside-portfolio`: the cache hydrates in a `useLayoutEffect`, which
  does not run in a static render, and there is no jsdom in this repo. So
  the page itself is unrenderable here and its pieces are rendered instead,
  with fixtures shaped like the four rows the payload carries.

  What that is worth is what it caught: this was the one room in the app
  that gave Margus a personal pronoun, on the same page that twice says
  "Margus is a computer program that writes language, not a person".
*/
function holding(over: Partial<HoldingRow> = {}): HoldingRow {
  return {
    id: "h1",
    ticker: "NVDA",
    shares: 120,
    cost_basis: 168.4,
    entry_date: "2026-03-04",
    thesis: "Sells the chips every AI system is trained on.",
    target_timeframe: "a year or more",
    exit_plan: "A cheaper rival its customers actually switch to.",
    status: "open",
    closed_at: null,
    exit_reasoning: null,
    realized_pnl: null,
    ...over,
  };
}

function report(): ReportRow {
  return {
    id: "r1",
    report_date: "2026-09-11",
    headline: "Held everything, and wrote down why.",
    body: "Nothing in the day's news changed the reason for owning any of these.",
    actions: [
      { type: "hold", ticker: "NVDA", reasoning: "The reason for owning it has not changed." },
    ],
    portfolio_value: 104_320,
    cash: 6_010,
    day_change_dollar: -812,
    day_change_pct: -0.0077,
    total_return_pct: 0.043,
    spy_price: 612.4,
    x_post: null,
  };
}

function recap(): WeeklyRecapRow {
  return {
    id: "w1",
    week_ending: "2026-09-11",
    headline: "A quiet week that went nowhere in particular.",
    body: "Two names moved, the rest sat still, and no decision changed.",
    week_return_pct: 0.011,
    spy_week_return_pct: 0.008,
    portfolio_value_start: 103_180,
    portfolio_value_end: 104_320,
  };
}

function textOf(markup: string): string {
  return markup
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

describe("the Fund room renders and says what it means", () => {
  it("calls the model by name, never 'he'", () => {
    /*
      The room's own explainer says twice that Margus is a program and not a
      person, and everywhere else in the app it is the name or nothing --
      "Margus is still working this one out", "Margus's job", "Margus is a
      language model, not a person". This page alone gave it a pronoun, on
      the labels a reader is most likely to take seriously.
    */
    const text = textOf(
      renderToStaticMarkup(
        createElement(FundPosition as never, { holding: holding(), price: 214.5 } as never)
      )
    );
    expect(text).toContain("Why Margus owns it");
    expect(text).toContain("What would make Margus sell");
    expect(text, "the Fund gave the model a personal pronoun again").not.toMatch(
      /\bhe owns\b|\bmake him\b|\bhe sells\b/i
    );
  });

  it("names every figure for what it actually is", () => {
    const text = textOf(
      renderToStaticMarkup(
        createElement(FundPosition as never, { holding: holding(), price: 214.5 } as never)
      )
    );
    // `cost_basis` is the price of one share, not the money put in.
    expect(text).toContain("Paid each");
    expect(text).toContain("Price now");
    expect(text).toContain("Worth now");
    // "Portfolio" means everything you own, so a single holding must not use it.
    expect(text).not.toMatch(/\bPortfolio\b/);
  });

  it("says n/a rather than guessing when no price came back", () => {
    const text = textOf(
      renderToStaticMarkup(
        createElement(FundPosition as never, { holding: holding(), price: null } as never)
      )
    );
    expect(text).toMatch(/No price came back for \$NVDA/);
    // And never invents a gain of exactly nothing from the buy price.
    expect(text).not.toMatch(/\+\$0\b/);

    /*
     * The sentence must not count the figures beside it. It used to say
     * "the three figures that need one" while four rendered -- the pill's
     * percentage as well as the three in the grid -- so a reader who
     * counted got a different answer from the page. Counting in prose the
     * things laid out next to it is how that drifts, and it had.
     */
    const naCount = (textOf(
      renderToStaticMarkup(
        createElement(FundPosition as never, { holding: holding(), price: null } as never)
      )
    ).match(/n\/a/g) ?? []).length;
    expect(naCount).toBeGreaterThanOrEqual(4);
    expect(
      text,
      `the card renders ${naCount} n/a values and the sentence counts them`
    ).not.toMatch(/\b(two|three|four|five)\s+figures\b/i);
  });

  it("tells a reader the money is pretend and nothing is edited after", () => {
    const text = textOf(
      renderToStaticMarkup(
        createElement(WhatThisIs as never, { decisions: 42, startedOn: "2026-03-01" } as never)
      )
    );
    expect(text).toMatch(/not a person/);
    expect(text).toMatch(/pretend/);
    expect(text).toMatch(/Nothing is edited/);
    expect(text).toMatch(/42 decisions have been written down/);
  });

  it("draws a day's report and a week's recap without swallowing their words", () => {
    const day = textOf(
      renderToStaticMarkup(createElement(ReportDetail as never, { r: report() } as never))
    );
    expect(day).toContain("Nothing in the day's news changed");
    /*
      The recap is model prose, so it goes through `recapBullets` on the way
      to the screen, and that pass launders desk vocabulary out of it. The
      fixture deliberately says "names", which is the word this product bans
      for companies, and what renders is "companies". Asserting the rewrite
      rather than the fixture is the point: it is the guarantee that a word
      the model reached for does not reach a reader.
    */
    const week = textOf(
      // RecapBody takes the prose, not the row: `recapBullets` splits it.
      renderToStaticMarkup(
        createElement(RecapBody as never, { text: recap().body } as never)
      )
    );
    expect(week).toContain("Two companies moved");
    expect(week, "desk vocabulary reached the page").not.toMatch(/\bnames\b/);
    expect(week).toContain("no decision changed");
  });
});
