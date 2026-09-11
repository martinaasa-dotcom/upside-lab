import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { CircleHome } from "@/components/CircleHome";
import { mixGapLine, mixSlices } from "@/lib/mix-slices";
import type { OverviewModel, TickerScore } from "@/lib/overview";
import type { MemberStat } from "@/components/community-types";

/*
  RENDER THE CIRCLE AND READ WHAT COMES OUT.

  This room is unreachable from the sample -- it needs an account -- so
  nothing in the demo walk covers it, and it was changed twice without
  ever being looked at: its mix moved onto the provider's sector, and the
  one sentence under the two charts was rewritten after it was found
  comparing one chart's folded tail against the other's.

  Fixtures rather than a live session, because there are no Supabase
  credentials in a test run and the room only needs props.
*/
const SECTORS = [
  "Technology and software",
  "Banks and finance",
  "Healthcare and medicines",
  "Everyday household goods",
  "Oil, gas and energy",
  "Property",
  "Electricity, water and gas",
  "Factories, machines and transport",
];

function ticker(i: number, value: number): TickerScore {
  return {
    ticker: `T${i}`,
    portfolios: ["Someone"],
    portfolioIds: [`p${i}`],
    shares: 10,
    buyValue: value * 0.8,
    currentValue: value,
    roiDollar: value * 0.2,
    roiPct: 0.25,
    todayDollar: value * 0.01,
    todayPct: 0.01,
    price: value / 10,
    sparkline: Array.from({ length: 32 }, (_, k) => 100 + k),
    dailyCloses: Array.from({ length: 15 }, (_, k) => 100 + k),
  };
}

function overview(values: number[]): OverviewModel {
  const tickers = values.map((v, i) => ticker(i, v));
  const equity = values.reduce((a, b) => a + b, 0);
  return {
    sheets: [],
    tickers,
    winners: tickers.slice(0, 2),
    losers: [],
    todayWinners: tickers.slice(0, 2),
    todayLosers: [],
    topHoldings: tickers.slice(0, 5),
    totals: {
      buyValue: equity * 0.8,
      equityValue: equity,
      cash: 500,
      totalValue: equity + 500,
      roiDollar: equity * 0.2,
      roiPct: 0.25,
      todayDollar: equity * 0.01,
      todayPct: 0.01,
      sheetCount: 2,
      positionCount: tickers.length,
      uniqueTickers: tickers.length,
    },
  };
}

function member(name: string, isYou: boolean, value: number): MemberStat {
  return {
    id: name.toLowerCase(),
    name,
    isYou,
    isPending: false,
    sheetCount: 1,
    sheetKey: `${name}-1`,
    totalValue: value,
    todayDollar: value * 0.01,
    todayPct: 0.01,
    roiPct: 0,
    personality: null,
    milestone: {
      total: value,
      hitCount: 1,
      goalCount: 3,
      next: 50000,
      remaining: 50000 - value,
      progress: 0.4,
      lastGoal: 10000,
    },
  };
}

function textOf(markup: string): string {
  return markup.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g,"&").replace(/&#x27;/g,"'").replace(/&quot;/g,'"')
    .replace(/\s+/g, " ").trim();
}

function room(view: "overview"|"play"|"members" = "play") {
  const roomHold = [5000,4000,3000,2500,2000,1500,300,200].map((v,i)=>(
    { ticker:`T${i}`, currentValue:v, sector:SECTORS[i]! }));
  const mine = [300,200,3000,2500,2000,1500,5000,4000].map((v,i)=>(
    { ticker:`T${i}`, currentValue:v, sector:SECTORS[i]! }));
  const circleMix = mixSlices(roomHold);
  const byColor = new Map(circleMix.map(s=>[s.label,s.color]));
  return createElement(CircleHome, {
    name: "The Aasa circle",
    houseNote: null,
    view,
    setView: () => {},
    overview: overview([5000,4000,3000,2500,2000,1500,300,200]),
    membersWithBooks: [member("You", true, 18500), member("Amanda", false, 22000)],
    achievements: [],
    circleLadderRows: [],
    sharedNames: [],
    avatarByName: new Map(),
    communityThemeBreakdown: circleMix,
    yourThemeBreakdown: mixSlices(mine, { colorFor: (l)=>byColor.get(l) }),
    gapLine: mixGapLine(roomHold, mine),
    communityFunFacts: ["A fun fact."],
    funFactsShuffle: 0,
    setFunFactsShuffle: () => {},
    changes: [],
    communityId: "c1",
    duelCache: null,
    isAdmin: false,
    accessNotice: null,
    inviteBusy: false,
    inviteUrl: null,
    createInvite: () => {},
    copyInviteLink: () => {},
    onOpenMember: () => {},
    onOpenBestiary: () => {},
    onShareChanged: () => {},
    members: null,
  } as Parameters<typeof CircleHome>[0]);
}

function roomWith(opts: { gapLine: string | null; mine: { ticker: string; currentValue: number; sector: string }[] }) {
  const roomHold = [5000,4000,3000,2500,2000,1500,300,200].map((v,i)=>(
    { ticker:`T${i}`, currentValue:v, sector:SECTORS[i]! }));
  const circleMix = mixSlices(roomHold);
  const byColor = new Map(circleMix.map(s=>[s.label,s.color]));
  const el = room("play") as ReturnType<typeof room>;
  return createElement(CircleHome, {
    ...(el.props as Record<string, unknown>),
    yourThemeBreakdown: mixSlices(opts.mine, { colorFor: (l: string)=>byColor.get(l) }),
    gapLine: opts.gapLine,
  } as Parameters<typeof CircleHome>[0]);
}

describe("the circle renders", () => {
  for (const view of ["overview","play","members"] as const) {
    it(`draws the ${view} tab without crashing`, () => {
      const html = renderToStaticMarkup(room(view));
      const text = textOf(html);
      console.log(`\n--- ${view} (${text.length} chars) ---\n${text.slice(0, 900)}`);
      expect(text.length).toBeGreaterThan(50);
      expect(text).not.toMatch(/undefined|NaN|\[object Object\]/);
    });
  }
  it("counts a holding the reader's own chart folded away", () => {
    /*
      The fold's quietest cost, and the one the rendered room shows best.
      In this fixture the reader really does hold technology, 300 of
      18,500, which is 1.6%. It is one of their two smallest sectors, so
      their chart folds it -- and the old line looked the room's sectors
      up on the reader's *drawn* slices, where it is no longer a key. The
      lookup missed, fell back to zero, and the room printed "27 points
      less" for somebody who is 1.6% in it. Unfolded it is 25.
    */
    const text = textOf(renderToStaticMarkup(room("play")));
    expect(text).toMatch(
      /You hold 25 points less of Technology and software than the circle does\./
    );
    expect(text).not.toMatch(/You hold 27 points less/);
  });

  it("draws no empty block when the two are the same portfolio", () => {
    /*
      The common case by far: most readers hold roughly what their circle
      holds, so `mixGapLine` returns null and the panel must simply not
      carry the line rather than carry an empty one.
    */
    const same = [5000,4000,3000,2500,2000,1500,300,200].map((v,i)=>(
      { ticker:`T${i}`, currentValue:v, sector:SECTORS[i]! }));
    const html = renderToStaticMarkup(roomWith({ gapLine: null, mine: same }));
    const text = textOf(html);
    expect(text).not.toMatch(/points (more|less) of/);
    expect(text).not.toMatch(/undefined|NaN/);
    // The charts themselves still draw.
    expect(text).toMatch(/What the circle owns/);
  });

  it("survives a reader who holds nothing in the circle", () => {
    const html = renderToStaticMarkup(roomWith({ gapLine: null, mine: [] }));
    const text = textOf(html);
    expect(text).not.toMatch(/undefined|NaN|\[object Object\]/);
    expect(text).toMatch(/What the circle owns/);
  });

  it("never welds a figure onto the next word", () => {
    /*
      The JSX whitespace trap: `{n}` with the next word on the line below
      renders with no gap at all. Only React's own separator closes up,
      which is why the comment is the one thing stripped to nothing.
    */
    const html = renderToStaticMarkup(room("play"));
    const text = html.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ");
    expect(text).not.toMatch(/\d(?:points|holdings|portfolios|smaller)/);
  });
});
