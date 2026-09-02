/**
 * A few plain sentences about the circle, different every day.
 *
 * Two rules, and both of them were broken.
 *
 * **No money.** A circle says how a day went and never what anything is
 * worth, which is the promise the landing page makes and the reason anybody
 * agrees to be in one. Four of these facts printed dollars: the biggest
 * portfolio, the combined total, the gap between the biggest and the
 * smallest, and the circle's move for the day. The gap one was the worst of
 * them, because naming the two people either end of it publishes both.
 *
 * **No slang, and never a villain.** "Today's villain arc belongs to
 * Amanda", "main character", "Squirrel energy", "Gap season", "Not a small
 * group project", "Chin up", "could use a pep talk". A grandmother gets
 * every sentence in this product, and somebody having a bad day in front of
 * their family is not a joke the app gets to make.
 *
 * They also repeated the awards printed directly above them, three of six on
 * a normal day, so `buildCommunityFunFacts` now takes the award titles that
 * are already on screen and skips any fact that would say the same thing
 * twice. Purely descriptive; never a basis for advice.
 */

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
  for (const idx of order) {
    if (out.length >= limit) break;
    const candidate = MAKERS[idx]!(ctx);
    if (!candidate) continue;
    const key = candidate.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(candidate);
  }
  return out;
}
