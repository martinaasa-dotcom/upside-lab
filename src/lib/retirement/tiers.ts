/**
 * SPENDING IN LAYERS, AND WHY A RETIREMENT PLANNED AS ONE NUMBER IS
 * PLANNED WRONG.
 *
 * Every safe withdrawal rate in the literature answers one question: how
 * much can I take out each year, adjusted for inflation, *and never
 * change it*, without running out. That constraint is where the whole
 * conservatism comes from. The rate has to survive the worst run in the
 * record while the person drawing on it carries on spending as if nothing
 * has happened, because that is what the studies assume they do.
 *
 * Nobody does that. A real person whose portfolio has fallen a third does
 * not book the same holiday. And the moment spending can move at all, the
 * arithmetic changes completely: the failures in those studies are almost
 * all cases where a fixed draw was taken out of a falling pot in the first
 * few years, and a person who simply skipped the holiday would have been
 * fine. Flexibility is worth more than any asset allocation decision
 * available, and it costs nothing to have.
 *
 * So spending is split into layers here. The bottom one is the rent, the
 * heating, the food, and it has to be there every year whatever the market
 * did; it is the layer the safe rate exists to protect. The layers above
 * it are the ones a real person would move, and they are drawn switching
 * off from the top down as the year gets worse. That picture is the whole
 * teaching point of this panel: what a bad year actually costs you is the
 * top of the stack, not the bottom, and seeing which of your own lines are
 * in which layer is the useful part.
 *
 * ONE RULE, AND IT IS THE SIMPLEST ONE THAT TELLS THE TRUTH. The year's
 * budget is the withdrawal rate applied to whatever the pot is now worth.
 * Essentials are paid first, then each layer above is filled in turn until
 * the money runs out. A good year fills every layer; a bad year takes the
 * top ones off. Anything left over in a very good year is deliberately NOT
 * spent, because a rule that ratchets spending up after every good year
 * and cannot come down after a bad one is how a flexible plan quietly
 * turns back into a fixed one.
 */

import { finiteNumber } from "@/lib/money";
import { PALETTE } from "@/lib/palette";

export type TierId = "essentials" | "regular" | "discretionary" | "luxuries";

export type SpendingTier = {
  id: TierId;
  label: string;
  /** What this layer is, in things a person actually buys. */
  blurb: string;
  /** Its share of the plan's ordinary annual spending, as a percent. */
  sharePct: number;
  color: string;
};

/**
 * The opening split. This is a split of the reader's WHOLE plan spend
 * (living cost plus their own housing and car dials, whatever those are
 * set to), not of the living-standard basket alone, so it still holds now
 * that basket excludes housing and a car: essentials is about three
 * fifths of an ordinary retiree's outgoings and holidays, replacing the
 * car and eating out are most of the rest, whether that car is a monthly
 * payment on the page or an occasional cash purchase nobody dials in.
 */
export const DEFAULT_TIERS: readonly SpendingTier[] = [
  {
    id: "essentials",
    label: "Essentials",
    blurb: "Housing, food, heating, insurance, getting about. Never skipped.",
    sharePct: 58,
    color: PALETTE.gain,
  },
  {
    id: "regular",
    label: "Regular lifestyle",
    blurb: "The ordinary week. Eating out, hobbies, presents, the phone bill.",
    sharePct: 21,
    color: PALETTE.steel,
  },
  {
    id: "discretionary",
    label: "Discretionary",
    blurb: "The yearly holiday, replacing the car sooner, the bigger treats.",
    sharePct: 13,
    color: PALETTE.brand,
  },
  {
    id: "luxuries",
    label: "Luxuries",
    blurb: "The second trip, the better seats, the thing you did not need.",
    sharePct: 8,
    color: PALETTE.teal,
  },
];

export type TierSlice = {
  tier: SpendingTier;
  /** What this layer would cost in a year where everything is funded. */
  full: number;
  /** What it actually gets this year. */
  funded: number;
  /** 0 to 1. Anything under 1 is a layer the year could not fully pay for. */
  fill: number;
};

export type FlexibleYear = {
  /** The pot after the year's return, before anything is taken out. */
  potAfterReturn: number;
  /** What the pot itself provides this year. Moves with the market. */
  fromPot: number;
  /** Pension and anything else guaranteed. Does not move with the market. */
  guaranteed: number;
  /** The two added together: everything available to spend this year. */
  budget: number;
  slices: TierSlice[];
  /** What is actually spent, which is the budget unless every layer is full. */
  spend: number;
  /** Left over in a very good year. It stays invested rather than being spent. */
  unspent: number;
  /** True when the year cannot even cover the bottom layer. */
  essentialsShort: boolean;
};

/** The full cost of each layer, from the plan's annual spending. */
export function tierAmounts(
  annualSpend: number,
  tiers: readonly SpendingTier[]
): { tier: SpendingTier; full: number }[] {
  const spend = Math.max(0, finiteNumber(annualSpend, 0));
  const total = tiers.reduce((sum, t) => sum + Math.max(0, t.sharePct), 0);
  if (total <= 0) return tiers.map((tier) => ({ tier, full: 0 }));
  return tiers.map((tier) => ({
    tier,
    full: (spend * Math.max(0, tier.sharePct)) / total,
  }));
}

/**
 * One year of flexible drawing.
 *
 * The layers are filled in the order they are given, so the order of
 * `DEFAULT_TIERS` is the priority order and is not cosmetic.
 */
export function flexibleYear(input: {
  pot: number;
  /** Everything the year costs, before any income is set against it. */
  annualSpend: number;
  /**
   * Pension and anything else that arrives whatever the market did.
   *
   * Counting this is the difference between a picture that teaches
   * something and one that quietly misleads. Without it the bottom layer
   * is a share of what the POT provides rather than of what the reader
   * spends, so a pension already covering most of the essentials is
   * invisible, and a bad year appears to threaten the food budget when in
   * fact it only reaches the holidays. Guaranteed income is the part of
   * the stack the market cannot touch, and that is most of why it is worth
   * so much.
   */
  guaranteedIncome?: number;
  withdrawalRatePct: number;
  marketReturnPct: number;
  tiers: readonly SpendingTier[];
}): FlexibleYear {
  const pot = Math.max(0, finiteNumber(input.pot, 0));
  const ret = finiteNumber(input.marketReturnPct, 0) / 100;
  const potAfterReturn = Math.max(0, pot * (1 + ret));
  const rate = Math.max(0, finiteNumber(input.withdrawalRatePct, 0)) / 100;
  const fromPot = potAfterReturn * rate;
  const guaranteed = Math.max(0, finiteNumber(input.guaranteedIncome, 0));
  const budget = fromPot + guaranteed;

  let left = budget;
  const slices: TierSlice[] = [];
  for (const { tier, full } of tierAmounts(input.annualSpend, input.tiers)) {
    const funded = Math.max(0, Math.min(full, left));
    left -= funded;
    slices.push({ tier, full, funded, fill: full > 0 ? funded / full : 0 });
  }

  const spend = slices.reduce((sum, s) => sum + s.funded, 0);
  const essentials = slices[0];
  return {
    potAfterReturn,
    fromPot,
    guaranteed,
    budget,
    slices,
    spend,
    unspent: Math.max(0, budget - spend),
    essentialsShort: essentials != null && essentials.fill < 0.999,
  };
}

/**
 * The three years worth naming on the slider, so a reader who never drags
 * it still meets the point. The returns are real ones, after inflation:
 * a bad year is a real market fall rather than a theoretical one, and the
 * good year is roughly what a strong year in world shares looks like.
 */
export const MARKET_YEARS: ReadonlyArray<{
  id: string;
  label: string;
  returnPct: number;
}> = [
  { id: "bad", label: "Bad year", returnPct: -25 },
  { id: "average", label: "Average year", returnPct: 5 },
  { id: "good", label: "Good year", returnPct: 16 },
];

/** The name for wherever the slider is, so the label is never blank. */
export function labelForReturn(returnPct: number): string {
  if (returnPct <= -15) return "Bad year";
  if (returnPct < -2) return "Weak year";
  if (returnPct <= 10) return "Average year";
  if (returnPct <= 25) return "Good year";
  return "Exceptional year";
}
