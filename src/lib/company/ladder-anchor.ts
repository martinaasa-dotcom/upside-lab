/**
 * What a price plan hangs off, and how that choice is said out loud.
 *
 * The ladder is the anchor times a set of multiples, so the anchor is the
 * whole claim: everything else in `plan-ladder.ts` is multiplication. It
 * is chosen here rather than inside the ladder so that the two places a
 * ladder is drawn, the Research room and a holding you already own, can
 * make the same choice from different data and say the same thing about
 * it.
 *
 * The order is the order of how checkable each one is, and the last two
 * are deliberately not valuations. A fund and a coin get no estimate
 * anywhere in this app, for the reason `fairValueRead` gives, and the
 * honest answer for them is not to invent one: a plan built on where the
 * price has actually been is a plan about the price, which is what it
 * says it is.
 */
import type { CompanyFacts } from "@/lib/company/facts";
import { isCryptoLike, isFundLike } from "@/lib/company/facts";
import type { FairValueRead } from "@/lib/company/fair-value";
import type { LadderAnchorKind } from "@/lib/company/plan-ladder";
import { currency } from "@/lib/format";

export type LadderAnchor = {
  price: number;
  kind: LadderAnchorKind;
  said: string;
} | null;

function ok(v: number | null | undefined): v is number {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}

/** The midpoint of the year the share has actually had. */
export function rangeMidpoint(f: CompanyFacts): number | null {
  const { fiftyTwoWeekHigh: high, fiftyTwoWeekLow: low } = f;
  if (!ok(high) || !ok(low) || high <= low) return null;
  return (high + low) / 2;
}

export function anchorForCompany(
  facts: CompanyFacts,
  read: FairValueRead | null
): LadderAnchor {
  const estimate = read?.estimate.price ?? null;
  if (ok(estimate) && !isFundLike(facts) && !isCryptoLike(facts)) {
    const n = read?.estimate.used.length ?? 0;
    return {
      price: estimate,
      kind: "estimate",
      said: `${currency(estimate, 2)}, the blended estimate from the valuation panel below, which is ${n === 1 ? "one method" : `${n} methods`} averaged and nothing else. Nothing here re-estimates it and nothing nudges it towards today's price.`,
    };
  }
  const mid = rangeMidpoint(facts);
  if (ok(mid)) {
    const why = isFundLike(facts)
      ? "A fund's price is the sum of what it holds, so there is no estimate of its own to hang a plan on."
      : isCryptoLike(facts)
        ? "There are no accounts behind this one, so there is nothing to value it against and no estimate to hang a plan on."
        : "No valuation method could be run on this one, so there is no estimate to hang a plan on.";
    return {
      price: mid,
      kind: "history",
      said: `${currency(mid, 2)}, the middle of the range it has traded in over the last year. ${why} This is a plan about the price and says nothing about what it is worth.`,
    };
  }
  return null;
}

/**
 * A holding you already own, where the anchor is the end-of-year target
 * that holding already carries.
 *
 * That target is the reader's own where they typed one and the shared
 * forecast path's where they did not, and both are already on the screen
 * this ladder is drawn on, which is the property that matters: an anchor
 * a reader cannot see is a plan they cannot argue with.
 */
export function anchorForHolding(input: {
  target: number | null;
  targetIsYours: boolean;
}): LadderAnchor {
  if (!ok(input.target)) return null;
  return {
    price: input.target,
    kind: "target",
    said: input.targetIsYours
      ? `${currency(input.target, 2)}, the end of year price you wrote down for this holding. Change it and the whole ladder moves with it.`
      : `${currency(input.target, 2)}, the end of year price on the path a model reasoned for this company. Nobody at this app chose it, and you can write your own over it.`,
  };
}
