/**
 * What a price ladder hangs off, and how that choice is said out loud.
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
 * honest answer for them is not to invent one: a ladder built on where the
 * price has actually been is a ladder about the price, which is what it
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
      ? "A fund's price is the sum of what it holds, so there is no estimate of its own to hang a ladder on."
      : isCryptoLike(facts)
        ? "There are no accounts behind this one, so there is nothing to value it against and no estimate to hang a ladder on."
        : "No valuation method could be run on this one, so there is no estimate to hang a ladder on.";
    return {
      price: mid,
      kind: "history",
      said: `${currency(mid, 2)}, the middle of the range it has traded in over the last year. ${why} This is a ladder about the price and says nothing about what it is worth.`,
    };
  }
  return null;
}

/**
 * A holding you already own, anchored on exactly the same company-wide
 * reading a stranger looking the name up would get.
 *
 * OWNING A SHARE DOES NOT CHANGE WHAT THE COMPANY IS WORTH, AND UNTIL
 * 2026-09-15 THIS APP BEHAVED AS THOUGH IT DID.
 *
 * This used to anchor a holding on its end-of-year forecast target, on
 * the argument that the figure was already printed a few inches above
 * the ladder. Three things were wrong with it, and together they are
 * why the Circle and the holdings page could not be read against each
 * other at all.
 *
 * A target is a claim about where the price is GOING, and a ladder is a
 * claim about what the company looks WORTH; they are different
 * questions with different horizons. This app writes a target for every
 * holding whether or not anybody chose one, and the written-in default
 * is grown from today's price, so every name sat the same distance from
 * its own anchor and the picture ordered a book by how fast this app
 * expects each name to compound while looking like it ordered it by how
 * cheap they are. Measured on a real book, five of six holdings landed
 * in one band. And the target lives in one browser's own storage, so
 * nobody else could ever see the same ladder: the Circle, which has no
 * member's targets to read, fell through to the trading-range midpoint
 * and put the same company in a different band on the next screen.
 *
 * So the anchor is `estimate`, the blended twelve-month estimate
 * `anchorForCompany` publishes for that company, fetched once on the
 * server and handed to every surface (`loadCompanyAnchors`). The reader
 * keeps a lever over it, and it is the honest one: the ladder's own
 * anchor edit, which they type, which is stored as theirs, and which
 * `buildPlanLadder` still lets outrank this. The trading range is the
 * last resort, for a name the feed could not answer about at all.
 */
export function anchorForHolding(input: {
  /**
   * What this company is worth, the same reading for every reader
   * (`loadCompanyAnchors`). Absent where the feed could not answer.
   */
  estimate?: { price: number; kind: LadderAnchorKind; said: string } | null;
  /** The middle of the range this browser has closes for, when it has any. */
  rangeMid?: number | null;
  /** The window those closes cover, in words. */
  windowSaid?: string;
}): LadderAnchor {
  const estimate = input.estimate;
  if (estimate && ok(estimate.price)) {
    return {
      price: estimate.price,
      kind: estimate.kind,
      said: estimate.said,
    };
  }
  const over = input.windowSaid ?? "the last few months";
  if (ok(input.rangeMid)) {
    return {
      price: input.rangeMid,
      kind: "history",
      said: `${currency(input.rangeMid, 2)}, the middle of the range this one has actually traded in over ${over}. No valuation method could be run on this company, so there is no estimate to hang a ladder on. This is a ladder about the price and says nothing about what it is worth.`,
    };
  }
  return null;
}
