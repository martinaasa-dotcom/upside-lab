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
  crypto: "crypto companies",
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
};

export type InsightWhen = "today" | "friday" | "this week";

export type BookInsights = {
  idea: string | null;
  rotation: string | null;
  /** Same-day group move. Null when nothing actually diverged. */
  dayMove: string | null;
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

/** Missing neighbor for a lopsided mix. Names the weight, the risk, and a check. */
const NEXT_GROUP: Partial<
  Record<
    ForecastTheme,
    { need: ForecastTheme; line: (share: number) => string }[]
  >
> = {
  ai_infra: [
    {
      need: "ai_power",
      line: (share) =>
        `${sharePct(share)} of this portfolio is AI computer companies. Those names need cheap, reliable power, and you barely own the utilities that sell it. If electricity stays tight, this group can stall even when demand is fine. If that group is most of the money, a power shortage is a portfolio-wide problem.`,
    },
    {
      need: "semi",
      line: (share) =>
        `${sharePct(share)} is the cloud and computer-rental layer. Chip makers are who those companies pay, and you barely own them. When chips are scarce, this mix feels the squeeze and has no one who sells the scarce thing. That is how much of the money sits in that one group.`,
    },
  ],
  ai_power: [
    {
      need: "ai_infra",
      line: (share) =>
        `${sharePct(share)} is the electricity side of the data-center build. You barely own the cloud companies that actually buy that power. If the build slows, power names can sit still while you wait. The other half of that story is not in this mix.`,
    },
  ],
  crypto: [
    {
      need: "index",
      line: (share) =>
        `${sharePct(share)} is crypto. A bad year there is a bad year for the whole portfolio. A broad fund next to it is how some people keep one crash from being the only story. If crypto is more than half, that size is the risk in the mix.`,
    },
  ],
  space: [
    {
      need: "index",
      line: (share) =>
        `${sharePct(share)} is space. Launch slips and one failed mission move this group hard. A calmer mix next to it keeps a delay from being the whole year. That is how much sits in that one bet.`,
    },
  ],
  semi: [
    {
      need: "ai_infra",
      line: (share) =>
        `${sharePct(share)} is chip makers. The cloud companies that buy those chips are barely here. When buyers pause, chip names fall first. This mix is mostly the factory, not the customer.`,
    },
  ],
  software: [
    {
      need: "semi",
      line: (share) =>
        `${sharePct(share)} is software. The chips and computers those products run on are barely here. When hardware is scarce or expensive, this mix has no one who sells the scarce part. That split is in the mix today.`,
    },
  ],
  drones: [
    {
      need: "software",
      line: (share) =>
        `${sharePct(share)} is defense and drones. After the hardware ships, software and sensors are often how that group keeps earning. You barely have that. The mix is still a one-industry bet.`,
    },
  ],
  fintech: [
    {
      need: "index",
      line: (share) =>
        `${sharePct(share)} is payment and finance companies. They move when interest rates move. A broader mix next to them keeps one rate cycle from being the whole portfolio. That is the weight sitting in rate-sensitive names.`,
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

function aboutPct(pct: number): string {
  const n = Math.max(1, Math.round(Math.abs(pct) * 100));
  if (pct > 0) return `up about ${n}%`;
  if (pct < 0) return `down about ${n}%`;
  return "about flat";
}

function groupLead(ticker: string | null, group: string): string {
  if (ticker) return `${cashtag(ticker)} and the other ${group}`;
  return group.charAt(0).toUpperCase() + group.slice(1);
}

function dayRotation(
  holdings: InsightHolding[],
  when: InsightWhen
): string | null {
  const withMove = holdings.filter(
    (h) => h.value > 0 && h.todayPct != null && Number.isFinite(h.todayPct)
  );
  if (withMove.length < 2) return null;

  const byTheme = new Map<ForecastTheme, { value: number; dollar: number }>();
  let total = 0;
  for (const h of withMove) {
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

  const down = groupLead(loudestInTheme(withMove, worst.theme), THEME_PLAIN[worst.theme]);
  const up = groupLead(loudestInTheme(withMove, best.theme), THEME_PLAIN[best.theme]);
  const w = whenCopy(when);
  const closer =
    AI_NEIGHBORS.has(best.theme) && AI_NEIGHBORS.has(worst.theme)
      ? "Both sit in the AI story, but they are not the same bet."
      : `Those are two different parts of your portfolio. ${w.closer}`;
  return `${down} ${w.verb} ${aboutPct(worst.pct)} ${w.tail}. ${up} ${w.verb} ${aboutPct(best.pct)} ${w.tail}. ${closer}`;
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
  const rotation = dayMove ?? structuralRotation(slices, holdings);
  const lines = [rotation, idea].filter((x): x is string => Boolean(x));
  const promptBlock =
    lines.length === 0
      ? ""
      : `Portfolio insights (use when relevant, do not force into every reply):
${lines.map((l) => `- ${l}`).join("\n")}
Talk about groups of similar businesses, not a shopping list of new tickers, unless the user asks for names. Name the weight and what to check. Do not write a vibe. Educational scenario, not an order to buy. Use plain words a grandma would get. Never say sleeve, marks, conviction, digestion, beta, or rotation. Thesis is fine.`;

  return { idea, rotation, dayMove, lines, promptBlock };
}

export function insightsPromptBlock(holdings: InsightHolding[]): string {
  return buildBookInsights(holdings).promptBlock;
}
