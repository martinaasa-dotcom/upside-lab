/**
 * Book-level ideas and "money is moving" reads. Groups of similar
 * businesses only, never a hardcoded ticker list. Used by Margus, emails,
 * Pulse, Forecast, and Home.
 */

import { themeBreakdown } from "@/lib/allocation";
import { cashtag } from "@/lib/format";
import {
  forecastThemeForTicker,
  type ForecastTheme,
} from "@/lib/forecast-conviction";
import { THEME_LABEL } from "@/lib/portfolio-personality";

/** Kitchen-table names for the day-move sentence. Charts keep THEME_LABEL. */
const THEME_PLAIN: Record<ForecastTheme, string> = {
  ai_infra: "AI computer companies",
  ai_power: "data-center power companies",
  crypto: "crypto",
  space: "space companies",
  semi: "chip makers",
  fintech: "payment and finance companies",
  software: "software companies",
  healthcare: "healthcare companies",
  drones: "defense and drone companies",
  index: "broad market funds",
  other: "the rest of your portfolio",
};

const AI_NEIGHBORS = new Set<ForecastTheme>([
  "semi",
  "ai_infra",
  "ai_power",
  "software",
]);

export type InsightHolding = {
  ticker: string;
  value: number;
  todayPct?: number | null;
  todayDollar?: number;
};

export type NeighborGap = {
  id: string;
  text: string;
  group: string;
  share: number;
  move: number;
  closer: string;
};

export type LoneMoverFact = {
  ticker: string;
  pct: number;
  restPct: number;
  others: { ticker: string; pct: number }[];
  othersQuiet: boolean;
};

export type GroupSplitFact = {
  upTheme: ForecastTheme;
  downTheme: ForecastTheme;
  upLabel: string;
  downLabel: string;
  upPct: number;
  downPct: number;
  upTicker: string | null;
  downTicker: string | null;
  sameAiStory: boolean;
};

export type InsightWhen = "today" | "friday" | "this week";

export type BookInsights = {
  idea: string | null;
  rotation: string | null;
  /** Same-day group move. Null when nothing actually diverged. */
  dayMove: string | null;
  /** One name vs the rest. Null when nothing stuck out. */
  loneMove: string | null;
  lines: string[];
  promptBlock: string;
};

function whenCopy(when: InsightWhen): { verb: string; tail: string; closer: string } {
  if (when === "friday") {
    return {
      verb: "were",
      tail: "on Friday",
      closer: "Friday's close treated them that way.",
    };
  }
  if (when === "this week") {
    return {
      verb: "are",
      tail: "this week",
      closer: "The week treated them that way.",
    };
  }
  return {
    verb: "are",
    tail: "today",
    closer: "Today's prices treated them that way.",
  };
}

const GAP = 0.08;

function sharePct(pct: number): string {
  return `${Math.max(1, Math.round(pct * 100))}%`;
}

type NeighborOpt = {
  need: ForecastTheme;
  line: (share: number) => string;
  /** Home uses this when the group actually moved, so the gap is today's. */
  today: string;
};

/** Missing neighbor for a lopsided mix. Names the weight, the risk, and a check. */
const NEXT_GROUP: Partial<Record<ForecastTheme, NeighborOpt[]>> = {
  ai_infra: [
    {
      need: "ai_power",
      line: (share) =>
        `${sharePct(share)} of this portfolio is AI computer companies. Those names need cheap, reliable power, and you barely own the utilities that sell it. If electricity stays tight, this group can stall even when demand is fine. If that group is most of the money, a power shortage is a portfolio-wide problem.`,
      today:
        "Those names need cheap, reliable power, and you barely own the utilities that sell it. If electricity stays tight, this group can stall even when demand is fine.",
    },
    {
      need: "semi",
      line: (share) =>
        `${sharePct(share)} is the cloud and computer-rental layer. Chip makers are who those companies pay, and you barely own them. When chips are scarce, this mix feels the squeeze and has no one who sells the scarce thing. That is how much of the money sits in that one group.`,
      today:
        "Chip makers are who those companies pay, and you barely own them. When chips are scarce, this mix feels the squeeze.",
    },
  ],
  ai_power: [
    {
      need: "ai_infra",
      line: (share) =>
        `${sharePct(share)} is the electricity side of the data-center build. You barely own the cloud companies that actually buy that power. If the build slows, power names can sit still while you wait. The other half of that story is not in this mix.`,
      today:
        "You barely own the cloud companies that buy that power. If the build slows, power names can sit still while you wait.",
    },
  ],
  crypto: [
    {
      need: "index",
      line: (share) =>
        `${sharePct(share)} is crypto. A bad year there is a bad year for the whole portfolio. A broad fund next to it is how some people keep one crash from being the only story. If crypto is more than half, that size is the risk in the mix.`,
      today:
        "A broad fund next to it is how some people keep one crash from being the only story.",
    },
  ],
  space: [
    {
      need: "index",
      line: (share) =>
        `${sharePct(share)} is space. Launch slips and one failed mission move this group hard. A calmer mix next to it keeps a delay from being the whole year. That is how much sits in that one bet.`,
      today:
        "Launch slips and one failed mission move this group hard. A calmer mix next to it keeps a delay from being the whole year.",
    },
  ],
  semi: [
    {
      need: "ai_infra",
      line: (share) =>
        `${sharePct(share)} is chip makers. The cloud companies that buy those chips are barely here. When buyers pause, chip names fall first. This mix is mostly the factory, not the customer.`,
      today:
        "The cloud companies that buy those chips are barely here. When buyers pause, chip names fall first.",
    },
  ],
  software: [
    {
      need: "semi",
      line: (share) =>
        `${sharePct(share)} is software. The chips and computers those products run on are barely here. When hardware is scarce or expensive, this mix has no one who sells the scarce part. That split is in the mix today.`,
      today:
        "The chips and computers those products run on are barely here. When hardware is scarce, this mix has no one who sells that part.",
    },
  ],
  drones: [
    {
      need: "software",
      line: (share) =>
        `${sharePct(share)} is defense and drones. After the hardware ships, software and sensors are often how that group keeps earning. You barely have that. The mix is still a one-industry bet.`,
      today:
        "After the hardware ships, software and sensors are often how that group keeps earning. You barely have that.",
    },
  ],
  fintech: [
    {
      need: "index",
      line: (share) =>
        `${sharePct(share)} is payment and finance companies. They move when interest rates move. A broader mix next to them keeps one rate cycle from being the whole portfolio. That is the weight sitting in rate-sensitive names.`,
      today:
        "They move when interest rates move. A broader mix next to them keeps one rate cycle from being the whole portfolio.",
    },
  ],
};

function themePct(
  slices: ReturnType<typeof themeBreakdown>,
  theme: ForecastTheme
): number {
  return slices.find((s) => s.theme === theme)?.pct ?? 0;
}

function ideaFor(
  slices: ReturnType<typeof themeBreakdown>
): string | null {
  const top = slices[0];
  if (!top || top.pct < 0.35) return null;
  const options = NEXT_GROUP[top.theme] ?? [];
  for (const opt of options) {
    if (themePct(slices, opt.need) < GAP) return opt.line(top.pct);
  }
  return null;
}

function structuralRotation(
  slices: ReturnType<typeof themeBreakdown>,
  holdings: InsightHolding[]
): string | null {
  const top = slices[0];
  if (!top || top.pct < 0.55) return null;
  // Unclassified names are not a real group. One ticker is not a group
  // either. Both used to print "other businesses (100%)" on an Apple book.
  if (top.theme === "other") return null;
  const inTheme = holdings.filter(
    (h) => h.value > 0 && forecastThemeForTicker(h.ticker) === top.theme
  ).length;
  if (inTheme < 2) return null;
  const label = THEME_LABEL[top.theme];
  return `Most of your portfolio is ${label} (${sharePct(top.pct)}). A bad year in that group is a bad year for you, not a dip in one name. If you did not mean to take that much in one place, that is the thing to fix.`;
}

function loudestInTheme(
  holdings: InsightHolding[],
  theme: ForecastTheme
): string | null {
  let best: InsightHolding | null = null;
  let bestAbs = 0;
  for (const h of holdings) {
    if (forecastThemeForTicker(h.ticker) !== theme) continue;
    const pct = h.todayPct;
    if (pct == null || !Number.isFinite(pct)) continue;
    const abs = Math.abs(pct);
    if (abs >= bestAbs) {
      bestAbs = abs;
      best = h;
    }
  }
  return best?.ticker ?? null;
}

/*
  A move that rounds to no whole percent is said in words, never floored up
  to one.

  These used to read `Math.max(1, ...)`, so a group that moved two tenths of
  a percent was printed as "up about 1%", five times what happened, in a
  sentence that states it as fact. Nothing upstream prevented it: the group
  split only asks that the gap between the best and worst group be three
  percent, so a quiet side of that gap reaches here all the time. "Less than
  1%" is both shorter and true.
*/
function wholePct(pct: number): number {
  return Math.round(Math.abs(pct) * 100);
}

function aboutPct(pct: number): string {
  if (pct === 0) return "about flat";
  const n = wholePct(pct);
  const size = n === 0 ? "less than 1%" : `about ${n}%`;
  return pct > 0 ? `up ${size}` : `down ${size}`;
}

function aboutMove(pct: number): string {
  const n = wholePct(pct);
  return n === 0 ? "less than 1%" : `about ${n}%`;
}

function riseOrFell(pct: number): "rose" | "fell" {
  return pct >= 0 ? "rose" : "fell";
}

function withMove(
  holdings: InsightHolding[]
): Array<InsightHolding & { todayPct: number }> {
  return holdings.filter(
    (h): h is InsightHolding & { todayPct: number } =>
      h.value > 0 && h.todayPct != null && Number.isFinite(h.todayPct)
  );
}

function weightedPct(
  rows: Array<{ value: number; todayPct: number }>
): number | null {
  let value = 0;
  let dollar = 0;
  for (const r of rows) {
    value += r.value;
    dollar += r.value * r.todayPct;
  }
  if (value <= 0) return null;
  return dollar / value;
}

/** One name did the moving. */
export function loneMoverFact(
  holdings: InsightHolding[]
): LoneMoverFact | null {
  const rows = withMove(holdings);
  if (rows.length < 2) return null;

  let best: (InsightHolding & { todayPct: number }) | null = null;
  let bestGap = 0;
  let bestRest = 0;
  for (const h of rows) {
    const rest = rows.filter((x) => x.ticker !== h.ticker);
    const restPct = weightedPct(rest);
    if (restPct == null) continue;
    const gap = Math.abs(h.todayPct - restPct);
    if (gap > bestGap) {
      bestGap = gap;
      best = h;
      bestRest = restPct;
    }
  }
  if (!best) return null;
  if (Math.abs(best.todayPct) < 0.02) return null;
  if (bestGap < 0.03) return null;

  const others = [...rows]
    .filter((h) => h.ticker !== best.ticker)
    .sort((a, b) => b.value - a.value)
    .slice(0, 2)
    .map((h) => ({ ticker: h.ticker, pct: h.todayPct }));
  return {
    ticker: best.ticker,
    pct: best.todayPct,
    restPct: bestRest,
    others,
    othersQuiet: others.every((h) => Math.abs(h.pct) < 0.012),
  };
}

/** One name did the moving. The landing page's Worth noticing is this shape. */
export function loneMoverLine(
  holdings: InsightHolding[],
  when: InsightWhen = "today"
): string | null {
  const fact = loneMoverFact(holdings);
  if (!fact) return null;
  const tail = whenCopy(when).tail;
  const lead = `${cashtag(fact.ticker)} ${riseOrFell(fact.pct)} ${aboutMove(fact.pct)} ${tail}`;
  const vs =
    fact.othersQuiet && fact.others.length >= 1
      ? fact.others.length === 2
        ? `while ${cashtag(fact.others[0]!.ticker)} and ${cashtag(fact.others[1]!.ticker)} barely moved`
        : `while ${cashtag(fact.others[0]!.ticker)} barely moved`
      : `while the rest of your portfolio ${when === "friday" ? "was" : "is"} ${aboutPct(fact.restPct)}`;
  return `${lead} ${vs}. When one name moves on its own, the question is whether something changed at the company, or only the price.`;
}

export type MixDayFact = {
  label: string;
  plain: string;
  share: number;
  pct: number;
  loud: string | null;
};

export function mixDayFact(
  holdings: InsightHolding[]
): MixDayFact | null {
  const slices = themeBreakdown(
    holdings.map((h) => ({ ticker: h.ticker, currentValue: h.value }))
  );
  const top = slices[0];
  if (!top || top.pct < 0.45 || top.theme === "other") return null;
  const inTheme = withMove(holdings).filter(
    (h) => forecastThemeForTicker(h.ticker) === top.theme
  );
  if (inTheme.length < 2) return null;
  const pct = weightedPct(inTheme);
  if (pct == null || Math.abs(pct) < 0.02) return null;
  return {
    label: THEME_LABEL[top.theme],
    plain: THEME_PLAIN[top.theme],
    share: top.pct,
    pct,
    loud: loudestInTheme(inTheme, top.theme),
  };
}

/**
 * Mix framed as today's P&L. Only when that group actually moved, so it
 * is not the same 55% lecture every morning.
 */
export function concentrationDayLine(
  holdings: InsightHolding[],
  when: InsightWhen = "today"
): string | null {
  const fact = mixDayFact(holdings);
  if (!fact) return null;
  const w = whenCopy(when);
  const lead = fact.loud
    ? `${cashtag(fact.loud)} and the other ${fact.plain}`
    : fact.plain.charAt(0).toUpperCase() + fact.plain.slice(1);
  return `Most of your portfolio is ${fact.label} (${sharePct(fact.share)}). ${lead} ${w.verb} ${aboutPct(fact.pct)} ${w.tail}. A day like this in that group is a day like this for you, not a dip in one name.`;
}

/**
 * Neighbor gaps, but only when the heavy group actually moved. Home
 * rotates among these so the same utilities paragraph is not glued on.
 */
export function neighborGapsToday(
  holdings: InsightHolding[],
  when: InsightWhen = "today"
): NeighborGap[] {
  const slices = themeBreakdown(
    holdings.map((h) => ({ ticker: h.ticker, currentValue: h.value }))
  );
  const top = slices[0];
  if (!top || top.pct < 0.35) return [];
  const inTheme = withMove(holdings).filter(
    (h) => forecastThemeForTicker(h.ticker) === top.theme
  );
  const move = weightedPct(inTheme);
  if (move == null || Math.abs(move) < 0.015) return [];
  const options = NEXT_GROUP[top.theme] ?? [];
  const w = whenCopy(when);
  const group = THEME_PLAIN[top.theme];
  const named = group.charAt(0).toUpperCase() + group.slice(1);
  const out: NeighborGap[] = [];
  for (const opt of options) {
    if (themePct(slices, opt.need) >= GAP) continue;
    out.push({
      id: `gap-${top.theme}-${opt.need}`,
      text: `${named} ${w.verb} ${aboutPct(move)} ${w.tail}, and they are ${sharePct(top.pct)} of this portfolio. ${opt.today}`,
      group: named,
      share: top.pct,
      move,
      closer: opt.today,
    });
  }
  return out;
}

function groupLead(ticker: string | null, group: string): string {
  if (ticker) return `${cashtag(ticker)} and the other ${group}`;
  return group.charAt(0).toUpperCase() + group.slice(1);
}

export function groupSplitFact(
  holdings: InsightHolding[]
): GroupSplitFact | null {
  const moving = holdings.filter(
    (h) => h.value > 0 && h.todayPct != null && Number.isFinite(h.todayPct)
  );
  if (moving.length < 2) return null;

  const byTheme = new Map<ForecastTheme, { value: number; dollar: number }>();
  let total = 0;
  for (const h of moving) {
    const theme = forecastThemeForTicker(h.ticker);
    const prev = byTheme.get(theme) ?? { value: 0, dollar: 0 };
    prev.value += h.value;
    prev.dollar += h.value * (h.todayPct as number);
    byTheme.set(theme, prev);
    total += h.value;
  }
  if (total <= 0 || byTheme.size < 2) return null;

  const ranked = [...byTheme.entries()]
    .map(([theme, v]) => ({
      theme,
      weight: v.value / total,
      pct: v.value !== 0 ? v.dollar / v.value : 0,
    }))
    .filter((t) => t.weight >= 0.15)
    .sort((a, b) => b.pct - a.pct);
  if (ranked.length < 2) return null;

  const best = ranked[0]!;
  const worst = ranked[ranked.length - 1]!;
  if (best.theme === worst.theme) return null;
  if (best.pct - worst.pct < 0.03) return null;
  if (best.pct <= 0 && worst.pct >= 0) return null;

  return {
    upTheme: best.theme,
    downTheme: worst.theme,
    upLabel: THEME_PLAIN[best.theme],
    downLabel: THEME_PLAIN[worst.theme],
    upPct: best.pct,
    downPct: worst.pct,
    upTicker: loudestInTheme(moving, best.theme),
    downTicker: loudestInTheme(moving, worst.theme),
    sameAiStory:
      AI_NEIGHBORS.has(best.theme) && AI_NEIGHBORS.has(worst.theme),
  };
}

function dayRotation(
  holdings: InsightHolding[],
  when: InsightWhen
): string | null {
  const split = groupSplitFact(holdings);
  if (!split) return null;
  const down = groupLead(split.downTicker, split.downLabel);
  const up = groupLead(split.upTicker, split.upLabel);
  const w = whenCopy(when);
  const closer = split.sameAiStory
    ? "Both sit in the AI story, but they are not the same bet."
    : `Those are two different parts of your portfolio. ${w.closer}`;
  return `${down} ${w.verb} ${aboutPct(split.downPct)} ${w.tail}. ${up} ${w.verb} ${aboutPct(split.upPct)} ${w.tail}. ${closer}`;
}

export function buildBookInsights(
  holdings: InsightHolding[],
  when: InsightWhen = "today"
): BookInsights {
  const slices = themeBreakdown(
    holdings.map((h) => ({ ticker: h.ticker, currentValue: h.value }))
  );
  const idea = ideaFor(slices);
  const dayMove = dayRotation(holdings, when);
  const loneMove = loneMoverLine(holdings, when);
  const rotation = dayMove ?? structuralRotation(slices, holdings);
  const lines = [dayMove, loneMove, idea].filter((x): x is string => Boolean(x));
  if (lines.length === 0 && rotation) lines.push(rotation);
  const promptBlock =
    lines.length === 0
      ? ""
      : `Portfolio insights (use when relevant, do not force into every reply):
${lines.map((l) => `- ${l}`).join("\n")}
Talk about groups of similar businesses, not a shopping list of new tickers, unless the user asks for names. Name the weight and what to check. Do not write a vibe. Educational scenario, not an order to buy. Use plain words a grandma would get. Never say sleeve, marks, conviction, digestion, beta, or rotation. Thesis is fine.`;

  return { idea, rotation, dayMove, loneMove, lines, promptBlock };
}

export function insightsPromptBlock(holdings: InsightHolding[]): string {
  return buildBookInsights(holdings).promptBlock;
}
