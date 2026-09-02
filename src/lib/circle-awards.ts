/**
 * One award per person, and never one about how much money they have.
 *
 * The old version handed out ten awards to six people from nine independent
 * sorts, so the same person collected several and two of them contradicted
 * each other: an index fund tops the spread-out score *and* the one-kind
 * score, so Amanda was both "Most spread out, 100/100" and "One-kind diet,
 * 100%" on the same grid. Two more ranked people by the size of their
 * portfolio, which a circle is not allowed to know (see the privacy note in
 * `CircleHome`); a friend with a small portfolio was labelled the sapling in
 * front of everybody.
 *
 * So: every award is a percentage or a score out of 100, never a sum of
 * money; each person wins at most one; and the winner of each award is
 * settled by the **clearest margin**, meaning how far ahead of the runner up
 * they are on that measure. That is what makes an award worth reading. A
 * person who is barely ahead on three things and plainly ahead on one gets
 * the one, and an award nobody is plainly ahead on is simply not given.
 *
 * Sentence case throughout, because half the old titles were title case
 * ("The Steady Hand", "Small but Mighty") and half were not.
 */

import type { PortfolioPersonality } from "@/lib/portfolio-personality";

export type AwardCandidate = {
  id: string;
  name: string;
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

type Measure = {
  id: string;
  emoji: string;
  title: string;
  /** Bigger wins. Return null to keep somebody out of the running. */
  value: (p: PortfolioPersonality) => number | null;
  /** The winner has to clear this before the award is given at all. */
  floor: number;
  /** And has to be this far ahead of whoever is second. */
  margin: number;
  stat: (p: PortfolioPersonality) => string;
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
    value: (p) => p.diversificationScore,
    floor: 45,
    margin: 6,
    stat: (p) => `${Math.round(p.diversificationScore)} out of 100`,
    description: "The most spread out portfolio here.",
  },
  {
    id: "jumpiest",
    emoji: "🔥",
    title: "Jumpiest mix",
    value: (p) => p.riskScore,
    floor: 55,
    margin: 6,
    stat: (p) => `${Math.round(p.riskScore)} out of 100`,
    description: "The holdings here that move around the most.",
  },
  {
    id: "steady-hand",
    emoji: "🛡️",
    title: "Calmest mix",
    value: (p) => 100 - p.riskScore,
    floor: 55,
    margin: 6,
    stat: (p) => `${Math.round(p.riskScore)} out of 100 for jumpiness`,
    description: "The holdings here that move around the least.",
  },
  {
    id: "conviction",
    emoji: "🎯",
    title: "Biggest single bet",
    value: (p) => p.convictionScore,
    floor: 30,
    margin: 6,
    stat: (p) =>
      p.topTicker
        ? `${Math.round(p.convictionScore)}% in one company`
        : `${Math.round(p.convictionScore)}%`,
    description: "The largest holding, measured against the rest of it.",
  },
  {
    id: "themes",
    emoji: "🗺️",
    title: "Most kinds of business",
    value: (p) => p.themeCount,
    floor: 3,
    margin: 1,
    stat: (p) => `${p.themeCount} kinds`,
    description: "Owns the most different kinds of business.",
  },
  {
    id: "cash",
    emoji: "💧",
    title: "Most cash waiting",
    value: (p) => p.cashPct,
    floor: 8,
    margin: 4,
    stat: (p) => `${Math.round(p.cashPct)}% in cash`,
    description: "The most cash, measured against the size of the portfolio.",
  },
  {
    id: "specialist",
    emoji: "⬡",
    title: "Most in one kind of business",
    value: (p) => (p.dominantTheme === "index" ? null : p.specialistScore),
    floor: 68,
    margin: 6,
    stat: (p) => `${Math.round(p.specialistScore)}% in one kind`,
    description: "When that group of companies moves, so does the portfolio.",
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

  type Ranked = {
    measure: Measure;
    member: (typeof withPersonality)[number];
    margin: number;
  };

  const ranked: Ranked[] = [];
  for (const measure of MEASURES) {
    const scored = withPersonality
      .map((m) => ({ member: m, value: measure.value(m.personality) }))
      .filter((row): row is { member: typeof row.member; value: number } =>
        row.value != null && Number.isFinite(row.value)
      )
      .sort((a, b) => b.value - a.value);
    const best = scored[0];
    if (!best) continue;
    // A single-person circle has no runner up, so the margin is whatever
    // the winner clears the floor by. That is honest: with nobody to be
    // ahead of, "ahead" can only mean ahead of the bar.
    const runnerUp = scored[1]?.value ?? measure.floor;
    if (best.value < measure.floor) continue;
    const margin = best.value - runnerUp;
    if (margin < measure.margin) continue;
    ranked.push({ measure, member: best.member, margin });
  }

  ranked.sort((a, b) => b.margin / b.measure.margin - a.margin / a.measure.margin);

  const takenPeople = new Set<string>();
  const out: CircleAward[] = [];
  for (const row of ranked) {
    if (takenPeople.has(row.member.id)) continue;
    takenPeople.add(row.member.id);
    out.push({
      id: row.measure.id,
      emoji: row.measure.emoji,
      title: row.measure.title,
      winner: row.member.name,
      winnerId: row.member.id,
      stat: row.measure.stat(row.member.personality),
      description: row.measure.description,
    });
  }
  return out;
}
