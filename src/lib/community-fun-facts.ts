/**
 * A few plain sentences about the circle, different every day.
 *
 * **The voice rule, which does not move.** No slang and never a villain:
 * "Today's villain arc belongs to Amanda", "main character", "Squirrel
 * energy", "Gap season", "Not a small group project", "Chin up", "could use
 * a pep talk". A grandmother gets every sentence in this product, and
 * somebody having a bad day in front of their family is not a joke the app
 * gets to make. That is the whole reason the money facts below are written
 * as flat statements: the amount is a fact about a portfolio, and the
 * sentence around it must not be a fact about a person.
 *
 * **The money rule, which did.** These four sentences (the biggest
 * portfolio, the combined total, the gap between the biggest and the
 * smallest, and the circle's move for the day) were taken out on the
 * argument that a circle should never print what anything is worth, and
 * they are back because whether a circle shares its amounts is that
 * circle's decision rather than this file's. Every one of them is worded
 * without a comparison a reader could take as a ranking of the people in
 * it: the gap fact names the two portfolios and no winner.
 *
 * They also repeated the awards printed directly above them, three of six on
 * a normal day, so `buildCommunityFunFacts` takes the award ids that are
 * already on screen and skips any fact that would say the same thing twice.
 * Purely descriptive; never a basis for advice.
 */

import { currency } from "@/lib/format";
import { hashSeed, mulberry32, pick, shuffleInPlace } from "@/lib/seeded-rng";
import type { PortfolioPersonality } from "@/lib/portfolio-personality";

export type CommunityMemberStat = {
  name: string;
  totalValue: number;
  todayDollar: number;
  todayPct: number | null;
  roiPct: number;
  personality: PortfolioPersonality | null;
};

function pct1(n: number): string {
  const rounded = Math.round(Math.abs(n) * 1000) / 10;
  // A figure this app states as fact is never rounded up into existence:
  // a fifth of a percent is not "0.2%" worth arguing about, it is small.
  if (rounded < 0.1) return "less than 0.1%";
  return `${rounded}%`;
}

/**
 * Money in a fact is whole dollars. Cents on a portfolio total is precision
 * nobody reads, and it is the difference between a sentence and a receipt.
 */
function money(n: number): string {
  return currency(Math.abs(n), 0);
}

const IRREGULAR_PLURALS: Record<string, string> = {
  Wolf: "Wolves",
  Fox: "Foxes",
  Octopus: "Octopuses",
};

function pluralAnimal(animal: string, n: number): string {
  if (n === 1) return animal;
  return IRREGULAR_PLURALS[animal] ?? `${animal}s`;
}

type FactCtx = {
  members: CommunityMemberStat[];
  rng: () => number;
  /** Award ids already on screen above these facts. */
  awarded: Set<string>;
};

type FactMaker = (ctx: FactCtx) => string | null;

const MAKERS: FactMaker[] = [
  // The best day here.
  ({ members, rng }) => {
    const ranked = members
      .filter((m) => m.todayPct != null)
      .sort((a, b) => (b.todayPct ?? 0) - (a.todayPct ?? 0));
    const top = ranked[0];
    if (!top || (top.todayPct ?? 0) <= 0) return null;
    return pick(rng, [
      `${top.name} is having the best day here, up ${pct1(top.todayPct!)}.`,
      `Best day in the circle so far: ${top.name}, up ${pct1(top.todayPct!)}.`,
    ]);
  },
  // The hardest day here. Stated, never joked about.
  ({ members, rng }) => {
    const ranked = members
      .filter((m) => m.todayPct != null)
      .sort((a, b) => (a.todayPct ?? 0) - (b.todayPct ?? 0));
    const bottom = ranked[0];
    if (!bottom || (bottom.todayPct ?? 0) >= 0) return null;
    return pick(rng, [
      `${bottom.name} is having the hardest day here, down ${pct1(bottom.todayPct!)}.`,
      `${bottom.name} is down ${pct1(bottom.todayPct!)} today, the furthest down in the circle.`,
    ]);
  },
  // How far apart the best and the worst day are.
  ({ members, rng }) => {
    const ranked = members
      .filter((m) => m.todayPct != null)
      .sort((a, b) => (b.todayPct ?? 0) - (a.todayPct ?? 0));
    if (ranked.length < 2) return null;
    const best = ranked[0]!;
    const worst = ranked[ranked.length - 1]!;
    const gap = (best.todayPct ?? 0) - (worst.todayPct ?? 0);
    if (gap < 0.01) return null;
    return pick(rng, [
      `The best and the hardest day in the circle are ${pct1(gap)} apart today.`,
      `${pct1(gap)} between ${best.name}'s day and ${worst.name}'s.`,
    ]);
  },
  // Everybody the same way, which is worth noticing.
  ({ members, rng }) => {
    const known = members.filter((m) => m.todayPct != null);
    if (known.length < 3) return null;
    const allUp = known.every((m) => (m.todayPct ?? 0) > 0);
    const allDown = known.every((m) => (m.todayPct ?? 0) < 0);
    if (!allUp && !allDown) return null;
    return pick(rng, [
      `Every portfolio in the circle is ${allUp ? "up" : "down"} today.`,
      `All ${known.length} portfolios here are ${allUp ? "up" : "down"} today.`,
    ]);
  },
  // The jumpiest mix.
  ({ members, rng, awarded }) => {
    if (awarded.has("jumpiest")) return null;
    const withScore = members.filter((m) => m.personality);
    const ranked = [...withScore].sort(
      (a, b) => (b.personality?.riskScore ?? 0) - (a.personality?.riskScore ?? 0)
    );
    const top = ranked[0];
    if (!top?.personality) return null;
    return pick(rng, [
      `Jumpiest mix in the circle: ${top.name}, ${top.personality.riskScore} out of 100.`,
      `${top.name} runs the jumpiest portfolio here, ${top.personality.riskScore} out of 100.`,
    ]);
  },
  // Most spread out.
  ({ members, awarded }) => {
    if (awarded.has("diversifier")) return null;
    const withScore = members.filter((m) => m.personality);
    const ranked = [...withScore].sort(
      (a, b) =>
        (b.personality?.diversificationScore ?? 0) -
        (a.personality?.diversificationScore ?? 0)
    );
    const top = ranked[0];
    if (!top?.personality) return null;
    return `${top.name} is the most spread out, at ${top.personality.diversificationScore} out of 100.`;
  },
  // Most concentrated.
  ({ members, rng }) => {
    const withScore = members.filter((m) => m.personality);
    const ranked = [...withScore].sort(
      (a, b) =>
        (a.personality?.diversificationScore ?? 100) -
        (b.personality?.diversificationScore ?? 100)
    );
    const top = ranked[0];
    if (!top?.personality || top.personality.diversificationScore >= 40)
      return null;
    return pick(rng, [
      `${top.name} owns the fewest different things here, scoring ${top.personality.diversificationScore} out of 100 for spread.`,
      `${top.name} keeps it tight, the least spread out portfolio in the circle.`,
    ]);
  },
  // Animal census.
  ({ members, rng }) => {
    const counts = new Map<string, { emoji: string; n: number }>();
    for (const m of members) {
      if (!m.personality) continue;
      const key = m.personality.animal;
      const prev = counts.get(key);
      counts.set(key, {
        emoji: m.personality.animalEmoji,
        n: (prev?.n ?? 0) + 1,
      });
    }
    if (counts.size === 0) return null;
    const parts = [...counts.entries()]
      .sort((a, b) => b[1].n - a[1].n)
      .map(([animal, { emoji, n }]) => `${n} ${emoji} ${pluralAnimal(animal, n)}`);
    return pick(rng, [
      `Animal census: ${parts.join(", ")}.`,
      `The circle's animals: ${parts.join(", ")}.`,
    ]);
  },
  // How many people hold the same company.
  ({ members, rng }) => {
    const holders = new Map<string, number>();
    for (const m of members) {
      const ticker = m.personality?.topTicker;
      if (!ticker) continue;
      holders.set(ticker, (holders.get(ticker) ?? 0) + 1);
    }
    const shared = [...holders.entries()]
      .filter(([, n]) => n >= 2)
      .sort((a, b) => b[1] - a[1])[0];
    if (!shared) return null;
    return pick(rng, [
      `${shared[1]} people here have $${shared[0]} as their biggest holding.`,
      `$${shared[0]} is the biggest holding for ${shared[1]} people in this circle.`,
    ]);
  },
  // Most kinds of business.
  ({ members, rng, awarded }) => {
    if (awarded.has("themes")) return null;
    const spread = members.filter((m) => (m.personality?.themeCount ?? 0) >= 3);
    if (spread.length === 0) return null;
    const s = pick(rng, spread);
    const p = s.personality!;
    return `${s.name} owns ${p.themeCount} different kinds of business, the most in the circle.`;
  },
  // Cash waiting.
  ({ members, rng, awarded }) => {
    if (awarded.has("cash")) return null;
    const withCash = members.filter(
      (m) => m.personality && m.personality.cashPct >= 8
    );
    if (withCash.length === 0) return null;
    const top = [...withCash].sort(
      (a, b) => (b.personality?.cashPct ?? 0) - (a.personality?.cashPct ?? 0)
    )[0]!;
    return pick(rng, [
      `${top.name} is holding the most cash, ${top.personality!.cashPct}% of the portfolio.`,
      `Most cash waiting: ${top.name}, at ${top.personality!.cashPct}% of the portfolio.`,
    ]);
  },
  // The biggest single holding.
  ({ members, awarded }) => {
    if (awarded.has("conviction")) return null;
    const withTop = members.filter(
      (m) => m.personality && m.personality.convictionScore >= 30
    );
    if (withTop.length === 0) return null;
    const top = [...withTop].sort(
      (a, b) =>
        (b.personality?.convictionScore ?? 0) -
        (a.personality?.convictionScore ?? 0)
    )[0]!;
    const company = top.personality!.topTicker
      ? `$${top.personality!.topTicker}`
      : "one company";
    return `${top.name}'s biggest holding is ${top.personality!.convictionScore}% of the portfolio (${company}). That is a big bet.`;
  },
  // One kind of business. Never a broad market fund, which is the most
  // spread out thing a person can own and would be labelled the opposite.
  ({ members, rng, awarded }) => {
    if (awarded.has("specialist")) return null;
    const specialists = members.filter(
      (m) =>
        (m.personality?.specialistScore ?? 0) >= 68 &&
        m.personality?.dominantTheme !== "index"
    );
    if (specialists.length === 0) return null;
    const s = pick(rng, specialists);
    const p = s.personality!;
    return `${s.name} has ${p.specialistScore}% in one kind of business. When that group moves, so does the whole portfolio.`;
  },
  // The largest portfolio here. Skipped when the award above already says
  // it, which on a circle with one clear leader is most days.
  ({ members, rng, awarded }) => {
    if (awarded.has("big-portfolio")) return null;
    const ranked = [...members].sort((a, b) => b.totalValue - a.totalValue);
    const top = ranked[0];
    if (!top || top.totalValue <= 0) return null;
    return pick(rng, [
      `${top.name} has the largest portfolio in the circle, ${money(top.totalValue)}.`,
      `Largest portfolio here: ${top.name}, at ${money(top.totalValue)}.`,
    ]);
  },
  // Everything the circle shares, added up.
  ({ members, rng }) => {
    const total = members.reduce((s, m) => s + m.totalValue, 0);
    if (total <= 0) return null;
    const n = members.length;
    return pick(rng, [
      `The circle shares ${money(total)} between ${n} portfolio${n === 1 ? "" : "s"}.`,
      `Everything in this circle adds up to ${money(total)} today.`,
    ]);
  },
  // The day in money rather than in percent.
  ({ members, rng }) => {
    const total = members.reduce((s, m) => s + m.todayDollar, 0);
    if (Math.round(total) === 0) return null;
    return pick(rng, [
      `Add up every portfolio and the circle is ${total > 0 ? "up" : "down"} ${money(total)} today.`,
      `The circle's day comes to ${total > 0 ? "+" : "-"}${money(total)} across everybody.`,
    ]);
  },
  /*
    How far apart the two ends are.

    Named as a distance between two portfolios and never as one person
    being ahead of another: the numbers are the same either way and the
    sentence a family reads is not.
  */
  ({ members, rng }) => {
    if (members.length < 2) return null;
    const sorted = [...members].sort((a, b) => b.totalValue - a.totalValue);
    const biggest = sorted[0]!;
    const smallest = sorted[sorted.length - 1]!;
    if (biggest.name === smallest.name) return null;
    const gap = biggest.totalValue - smallest.totalValue;
    if (gap <= 0) return null;
    return pick(rng, [
      `There is ${money(gap)} between the largest portfolio here and the smallest.`,
      `The two ends of the circle, ${biggest.name}'s and ${smallest.name}'s, are ${money(gap)} apart.`,
    ]);
  },
];

/**
 * Up to `limit` distinct facts for the given day, deterministic per dayKey
 * so a refresh does not shuffle the list while a new day gets a fresh batch.
 * `awarded` is the set of award ids already printed above these, so a fact
 * never restates one of them.
 */
export function buildCommunityFunFacts(
  members: CommunityMemberStat[],
  dayKey: string,
  limit = 6,
  awarded: Iterable<string> = []
): string[] {
  if (members.length === 0) return [];
  const seed = hashSeed(`upside-community-fun|${dayKey}|${members.length}`);
  const rng = mulberry32(seed);
  const ctx: FactCtx = { members, rng, awarded: new Set(awarded) };

  const order = shuffleInPlace(rng, MAKERS.map((_, i) => i));
  const out: string[] = [];
  const seen = new Set<string>();
  const named = new Set<string>();
  for (const idx of order) {
    if (out.length >= limit) break;
    const candidate = MAKERS[idx]!(ctx);
    if (!candidate) continue;
    const key = candidate.toLowerCase();
    if (seen.has(key)) continue;
    /*
      One person, one fact.

      Whoever tops the concentration measure usually tops the one-kind and
      the biggest-holding ones as well, because all three are asking the
      same question from different angles. Measured on a real circle, three
      of the six facts were about Liisa, so a list of six read as two facts
      about one person. A fact naming exactly one member is skipped once
      that member already has one; a fact naming two (the gap between the
      best and the hardest day) or none is always allowed, since it is
      about the circle rather than about somebody.
    */
    const mentioned = members
      .map((m) => m.name)
      .filter((name) => name && candidate.includes(name));
    const only = mentioned.length === 1 ? mentioned[0]! : null;
    if (only && named.has(only)) continue;
    seen.add(key);
    if (only) named.add(only);
    out.push(candidate);
  }
  return out;
}
