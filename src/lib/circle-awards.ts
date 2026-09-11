/**
 * One award per person, chosen by the clearest margin.
 *
 * The version before this handed out ten awards to six people from nine
 * independent sorts, so the same person collected several and two of them
 * contradicted each other: an index fund tops the spread-out score *and*
 * the one-kind score, so Amanda was both "Most spread out, 100/100" and
 * "One-kind diet, 100%" on the same grid. That part of the rule stays: each
 * person wins at most one, the winner of each award is settled by how far
 * ahead of the runner up they are on that measure, and an award nobody is
 * plainly ahead on is simply not given.
 *
 * The size of a portfolio is a measure like any other here. It was taken
 * out for a while on the argument that a circle should never print what
 * anything is worth, and it is back because that is the circle's own
 * decision to make rather than this file's: a family who all know roughly
 * what each other have are not helped by the app pretending otherwise.
 *
 * **A size measure is ranked on the share of the circle, never on the
 * dollars.** Every other measure here is a score out of 100 and the ranking
 * divides one margin by another, so a raw balance would arrive in units
 * thousands of times larger and win every award in the room whatever the
 * portfolios actually said. The share is in the same units as the rest, so
 * `margin` still means what it means on the other seven. The amount itself
 * is printed as the award's `stat`, which is what a reader came for.
 *
 * Sentence case throughout, because half the old titles were title case
 * ("The Steady Hand", "Small but Mighty") and half were not, and the small
 * one is now named for what it is rather than for a joke at the expense of
 * whoever has the least ("Smallest portfolio", never "every circle has a
 * sapling").
 */

import { currency } from "@/lib/format";
import type { PortfolioPersonality } from "@/lib/portfolio-personality";

export type AwardCandidate = {
  id: string;
  name: string;
  /** Everything this person shares with the circle, at today's prices. */
  totalValue: number;
  personality: PortfolioPersonality | null;
};

export type CircleAward = {
  id: string;
  emoji: string;
  title: string;
  winner: string;
  winnerId: string;
  stat: string;
  description: string;
};

/**
 * One person, ranked. `sharePct` is what this portfolio is of everything
 * the circle shares, out of 100, so a size measure lands in the same units
 * as a diversification score and the margins stay comparable.
 */
type Contender = {
  id: string;
  name: string;
  totalValue: number;
  sharePct: number;
  personality: PortfolioPersonality;
};

type Measure = {
  id: string;
  emoji: string;
  title: string;
  /** Bigger wins. Return null to keep somebody out of the running. */
  value: (c: Contender) => number | null;
  /**
   * The winner has to clear this before the award is given at all. A
   * function where the bar depends on how many people are in the circle,
   * which is what "bigger than average" means when the average is 100/n.
   */
  floor: number | ((count: number) => number);
  /** And has to be this far ahead of whoever is second. */
  margin: number;
  /**
   * Outside the one-award-per-person rule.
   *
   * That rule exists because the seven shape measures overlap: an index
   * fund tops the spread-out score and the one-kind score at once, so
   * without it the same person collects three awards that are really one
   * observation. Size is not one of those observations. It says nothing
   * about how a portfolio is put together, so the largest portfolio in the
   * circle can also be the jumpiest without either award being a restatement
   * of the other, and it neither takes a person's slot nor is blocked by one.
   *
   * It is also what keeps size out of the way of everything else: a circle
   * where one person has two hundred times what anybody else has produces a
   * margin the shape measures cannot get near, so inside the greedy pass it
   * would settle first every time and quietly take that person out of the
   * running for the award they actually earned.
   */
  standalone?: boolean;
  stat: (c: Contender) => string;
  description: string;
};

/**
 * `specialistScore` counts the weight sitting in one kind of business, and a
 * broad market fund is one kind of business by that measure while being the
 * most spread out thing a person can own. Naming somebody a one-kind eater
 * for owning an index fund is simply wrong, so that measure skips them.
 */
const MEASURES: Measure[] = [
  {
    id: "diversifier",
    emoji: "🌐",
    title: "Most spread out",
    value: (c) => c.personality.diversificationScore,
    floor: 45,
    margin: 6,
    stat: (c) => `${Math.round(c.personality.diversificationScore)} out of 100`,
    description: "The most spread out portfolio here.",
  },
  {
    id: "jumpiest",
    emoji: "🔥",
    title: "Jumpiest mix",
    value: (c) => c.personality.riskScore,
    floor: 55,
    margin: 6,
    stat: (c) => `${Math.round(c.personality.riskScore)} out of 100`,
    description: "The holdings here that move around the most.",
  },
  {
    id: "steady-hand",
    emoji: "🛡️",
    title: "Calmest mix",
    value: (c) => 100 - c.personality.riskScore,
    floor: 55,
    margin: 6,
    stat: (c) => `${Math.round(c.personality.riskScore)} out of 100 for jumpiness`,
    description: "The holdings here that move around the least.",
  },
  {
    id: "conviction",
    emoji: "🎯",
    title: "Biggest single bet",
    value: (c) => c.personality.convictionScore,
    floor: 30,
    margin: 6,
    stat: (c) =>
      c.personality.topTicker
        ? `${Math.round(c.personality.convictionScore)}% in one company`
        : `${Math.round(c.personality.convictionScore)}%`,
    description: "The largest holding, measured against the rest of it.",
  },
  {
    id: "themes",
    emoji: "🗺️",
    title: "Most kinds of business",
    value: (c) => c.personality.themeCount,
    floor: 3,
    margin: 1,
    stat: (c) => `${c.personality.themeCount} kinds`,
    description: "Owns the most different kinds of business.",
  },
  {
    id: "cash",
    emoji: "💧",
    title: "Most cash waiting",
    value: (c) => c.personality.cashPct,
    floor: 8,
    margin: 4,
    stat: (c) => `${Math.round(c.personality.cashPct)}% in cash`,
    description: "The most cash, measured against the size of the portfolio.",
  },
  {
    id: "specialist",
    emoji: "⬡",
    title: "Most in one kind of business",
    value: (c) =>
      c.personality.dominantTheme === "index"
        ? null
        : c.personality.specialistScore,
    floor: 68,
    margin: 6,
    stat: (c) => `${Math.round(c.personality.specialistScore)}% in one kind`,
    description: "When that group of companies moves, so does the portfolio.",
  },
  /*
    The two size awards. Ranked on the share of the circle (see the note at
    the top of this file) and printed as the amount, with no cents, because
    a portfolio's value to the dollar is precision nobody reads and it makes
    the card wrap.

    The floors are the average share either way, so neither is handed out in
    a circle where everybody is within a few points of everybody else, and
    `margin` keeps them off a near tie. A one-person circle gets neither:
    largest and smallest of one is not an award, and the floor is exactly
    the share, so it fails the margin.
  */
  {
    id: "big-portfolio",
    emoji: "🏦",
    title: "Largest portfolio",
    value: (c) => c.sharePct,
    floor: (count) => 100 / count,
    margin: 5,
    standalone: true,
    stat: (c) => currency(c.totalValue, 0),
    description: "The largest portfolio shared with this circle.",
  },
  {
    id: "small-portfolio",
    emoji: "🌱",
    title: "Smallest portfolio",
    value: (c) => 100 - c.sharePct,
    floor: (count) => 100 - 100 / count,
    margin: 5,
    standalone: true,
    stat: (c) => currency(c.totalValue, 0),
    description: "The smallest portfolio shared with this circle.",
  },
];

/**
 * Awards, best margin first, at most one per person and at most one per
 * measure. Greedy on the margin: the clearest result is settled first, so a
 * person who wins two measures keeps whichever of them they won by more, and
 * the other measure passes to the next person clearly enough ahead.
 */
export function buildCircleAwards(members: AwardCandidate[]): CircleAward[] {
  const withPersonality = members.filter(
    (m): m is AwardCandidate & { personality: PortfolioPersonality } =>
      Boolean(m.personality)
  );
  if (withPersonality.length === 0) return [];

  /*
    Shares of the circle. A circle whose portfolios all read zero (nothing
    priced yet) has no shares to take, so everybody gets the same one and
    the two size measures fail their own margin, which is the honest answer
    rather than a coin toss.
  */
  const pooled = withPersonality.reduce(
    (s, m) => s + Math.max(0, m.totalValue),
    0
  );
  const contenders: Contender[] = withPersonality.map((m) => ({
    id: m.id,
    name: m.name,
    totalValue: m.totalValue,
    sharePct:
      pooled > 0
        ? (Math.max(0, m.totalValue) / pooled) * 100
        : 100 / withPersonality.length,
    personality: m.personality,
  }));

  type Ranked = {
    measure: Measure;
    member: Contender;
    margin: number;
  };

  // Temporary: append ?debugAwards to the circle URL to see why each
  // measure was or wasn't handed out, in the browser console. Remove once
  // the "only one award" question is answered.
  const debug =
    typeof window !== "undefined" &&
    window.location.search.includes("debugAwards");

  const ranked: Ranked[] = [];
  for (const measure of MEASURES) {
    const floor =
      typeof measure.floor === "function"
        ? measure.floor(contenders.length)
        : measure.floor;
    const scored = contenders
      .map((m) => ({ member: m, value: measure.value(m) }))
      .filter((row): row is { member: Contender; value: number } =>
        row.value != null && Number.isFinite(row.value)
      )
      .sort((a, b) => b.value - a.value);
    const best = scored[0];
    if (!best) {
      if (debug) console.debug(`[awards] ${measure.id}: nobody eligible`);
      continue;
    }
    // A single-person circle has no runner up, so the margin is whatever
    // the winner clears the floor by. That is honest: with nobody to be
    // ahead of, "ahead" can only mean ahead of the bar.
    const runnerUp = scored[1]?.value ?? floor;
    const margin = best.value - runnerUp;
    if (debug) {
      console.debug(
        `[awards] ${measure.id}: best ${best.member.name}=${best.value.toFixed(1)}` +
          ` runnerUp=${runnerUp.toFixed(1)} floor=${floor.toFixed(1)}` +
          ` margin=${margin.toFixed(1)} (needs ${measure.margin})` +
          (best.value < floor
            ? " -> BELOW FLOOR"
            : margin < measure.margin
              ? " -> MARGIN TOO CLOSE"
              : " -> qualifies")
      );
    }
    if (best.value < floor) continue;
    if (margin < measure.margin) continue;
    ranked.push({ measure, member: best.member, margin });
  }

  ranked.sort((a, b) => b.margin / b.measure.margin - a.margin / a.measure.margin);

  const takenPeople = new Set<string>();
  const out: CircleAward[] = [];
  for (const row of ranked) {
    if (!row.measure.standalone) {
      if (takenPeople.has(row.member.id)) continue;
      takenPeople.add(row.member.id);
    }
    out.push({
      id: row.measure.id,
      emoji: row.measure.emoji,
      title: row.measure.title,
      winner: row.member.name,
      winnerId: row.member.id,
      stat: row.measure.stat(row.member),
      description: row.measure.description,
    });
  }
  return out;
}
