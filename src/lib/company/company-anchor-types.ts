/**
 * The shape of the one shared answer to "what does this company look
 * worth", kept apart from the server module that builds it
 * (`company-anchors.ts`) so a browser can hold the type without pulling
 * the feed, the brief store and the database client in behind it.
 */
import type { LadderAnchorKind } from "@/lib/company/plan-ladder";

export type CompanyAnchor = {
  price: number;
  /** `estimate` where a valuation could be run, `history` where none could. */
  kind: LadderAnchorKind;
  /** What it is, in a sentence the reader can argue with. */
  said: string;
  /**
   * The year this share has actually had, from the same feed.
   *
   * The anchor is only half of a ladder: the step and the floor are read
   * off a high and a low, so shipping the reading without the window it
   * was measured over would leave two rooms agreeing about what a
   * company is worth and disagreeing about how wide its bands are. The
   * browser's own closes cover about three months, and this covers a
   * year, which is also the window `ladderFloor` wants for its floor.
   */
  high: number | null;
  low: number | null;
};

/** The window `high` and `low` cover, in words, for the sentences. */
export const ANCHOR_WINDOW_SAID = "the last year";

export type CompanyAnchors = Record<string, CompanyAnchor>;

/**
 * However many names one request may ask about.
 *
 * A cold company costs a provider call and the caller is a page load with
 * a reader's whole book in it. Facts are cached for an hour behind
 * `fetchCompanyFacts`, so a warm ask is free and this bound is about the
 * cold one: a circle of seventeen and an ordinary book both fit, and
 * nobody can hand the route a thousand symbols to walk.
 */
export const MAX_ANCHOR_TICKERS = 40;
