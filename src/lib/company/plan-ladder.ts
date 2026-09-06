/**
 * A price ladder: the levels one person decides in advance, so the
 * decision is made on a quiet afternoon rather than in the middle of a
 * red week.
 *
 * Nothing in this file is advice and nothing in it may become advice.
 * What it computes is arithmetic on two numbers the reader can already
 * see on the page: an anchor, which is what the estimates on this page
 * add up to, and a step, which is how far this particular company
 * ordinarily travels. The bands are those two multiplied together. The
 * app's whole claim is "here is that arithmetic"; which band means what,
 * and whether to act on any of it, is the reader's, which is why every
 * edge is editable and why the labels are the reader's plan rather than
 * this app's opinion. `ADVICE_DISCLAIMER_SHORT` is the legal line and it
 * is said once, on the panel.
 *
 * Two rules carried over from `fair-value.ts`, for the same reasons.
 * **A method that cannot run stands down** rather than filling a number
 * in: a ladder with no anchor is absent, not a ladder around today's
 * price, because a ladder centred on the price says the price is right
 * and that is a claim nobody made. And **nothing is nudged towards the
 * current price**, or every band would agree with the market and say
 * nothing.
 */
import { cashtag, currency, percent } from "@/lib/format";

/**
 * The seven bands, widest to narrowest, top to bottom.
 *
 * The ids are stable and are what a saved edit, a dismissal and an alert
 * are keyed on, so they never change with the wording. The labels are the
 * plan's own words: they say what this reader decided to do at that
 * price, which is why they are imperative and why that is not this app
 * instructing anybody. Read them as the sentence they complete: "at this
 * price, my plan says ...".
 */
export type LadderBandId =
  | "trim-most"
  | "trim-some"
  | "hold"
  | "starter"
  | "full"
  | "full-aggressive"
  | "exit";

export type LadderBand = {
  id: LadderBandId;
  /** The plan's own words for this band. */
  label: string;
  /** Bottom of the band, or null for the open band at the bottom. */
  from: number | null;
  /** Top of the band, or null for the open band at the top. */
  to: number | null;
  /** Where this edge sits against the anchor, as a multiple of it. */
  fromRatio: number | null;
  toRatio: number | null;
  /** The reader typed at least one of this band's edges. */
  edited: boolean;
};

/** Which reading the ladder was built around, in the reader's own words. */
export type LadderAnchorKind =
  | "estimate"
  | "target"
  | "history"
  | "your-own";

export type PlanLadder = {
  ticker: string;
  /** The reading every band is a multiple of. */
  anchor: number;
  anchorKind: LadderAnchorKind;
  /** What the anchor is, in a sentence a person can argue with. */
  anchorSaid: string;
  /** How far apart the bands are, as a fraction of the anchor. */
  step: number;
  /** Why the step is that wide, naming the figure it was read off. */
  stepSaid: string;
  /**
   * True where the price is far enough under the anchor that the upper
   * bands were tightened. Said out loud, because a ladder three per cent
   * wide next to one ten per cent wide reads as a fault otherwise.
   */
  farBelow: boolean;
  /**
   * Whether the bottom of the ladder is a price the share has actually
   * traded at, or a fraction of the anchor because no year was on file.
   *
   * A flag rather than something a caller reads back out of `floorSaid`:
   * the Cash card already taught this app what happens when a surface
   * decides what to do by running a regex over its own copy, which is
   * that rewording a sentence changes behaviour.
   */
  floorFromYear: boolean;
  /** Where the bottom of the ladder came from, in a sentence. */
  floorSaid: string;
  bands: LadderBand[];
  /** Today's price, when there is one. */
  spot: number | null;
  /** The band today's price sits in, or null with no price. */
  atId: LadderBandId | null;
  /** True where any edge came from the reader rather than the arithmetic. */
  edited: boolean;
};

/**
 * Each band and the top edge of it, as a number of steps away from the
 * anchor.
 *
 * Read off the reference ladders this was built from, where the step is a
 * tenth of the anchor: the top band is open above, "hold" runs a step
 * either side of the anchor so the price is at the estimate within that,
 * and each band out from there is one step wide. The bottom two edges are
 * deliberately not steps. The floor of the ladder is a different kind of
 * level and `exitRatio` sets it; below that the band is open, because
 * there is no lowest price worth naming.
 *
 * A band's floor is the top of the band under it, so the edges are written
 * once and read in pairs. Two bands that disagree about the price between
 * them is a ladder with a hole in it.
 */
const EDGES: { id: LadderBandId; label: string; steps: number | null }[] = [
  { id: "trim-most", label: "Trim 60%+", steps: null },
  { id: "trim-some", label: "Consider a trim", steps: 2 },
  { id: "hold", label: "Hold, nothing new", steps: 1 },
  { id: "starter", label: "Half a starter", steps: -1 },
  { id: "full", label: "Full position", steps: -2 },
  { id: "full-aggressive", label: "Full position, and more", steps: -3 },
  { id: "exit", label: "Out of it", steps: null },
];

/** A tenth of the anchor per band, which is the reference ladder's own width. */
export const BASE_STEP = 0.1;

/**
 * The narrowest and widest a band may be.
 *
 * Deliberately close either side of `BASE_STEP` rather than the wide
 * bracket this started with. The reference ladders put a flat 10% on two
 * companies whose volatility is nothing like each other's, which is good
 * evidence that the source treats the step as a constant, and a step that
 * wanders between a twentieth and a fifth is not the same ladder any
 * more. What is left inside these bounds is a mild correction, not a
 * different design: a name that barely moves gets slightly finer bands
 * and one that swings hard slightly coarser.
 */
export const MIN_STEP = 0.08;
export const MAX_STEP = 0.14;

/**
 * How much of a name's own swing reaches the step.
 *
 * At 1 the step is proportional to the swing, which is what this file did
 * first and which pulled an ordinary large company out to 15% on nothing
 * but a wide year. At 0 it is the references' flat 10% for everything,
 * including a coin. Two fifths keeps the references' number for an
 * ordinary company and still separates a utility from something that
 * halves twice a year.
 *
 * It matters more since the floor started coming from the year's low
 * (`ladderFloor`): the same year would otherwise set both the width of
 * every band and the depth of the floor, so one bad month would widen
 * the whole ladder twice over.
 */
export const SWING_WEIGHT = 0.4;

/**
 * A SHARE TRADING A LONG WAY UNDER THE ANCHOR GETS A TIGHTER LADDER.
 *
 * Two of the four reference ladders are drawn on companies whose price
 * is down in the accumulation band, and both of them use a step about a
 * third of the other two's: 3.25% and 3.69% of the anchor against a flat
 * 10%. That looked at first like an inconsistency in the references and
 * it is the interesting part of them.
 *
 * The bands do a different job in the two cases. Near the anchor they are
 * the granularity of a decision that is live: every 10% is another slice
 * of a real choice about trimming or adding. A long way under it, every
 * price between the floor and the bottom of the ladder is the SAME
 * decision, so cutting that stretch into 10% slices is precision the
 * situation does not have; what is worth resolving finely is the top,
 * where the trimming levels are, because those are the ones this reader
 * will meet if they are right about the company. So the upper bands
 * tighten and the accumulation band swallows the whole gap, which is
 * exactly the shape the two references have: 18.6 and 9.6 steps wide.
 *
 * `MIN_STEP` does not apply here and that is the point rather than an
 * exception. That floor exists so a ladder does not fire twice a week,
 * and it cannot: the price is nowhere near these bands, which is the
 * condition that put it in this regime.
 */
export const FAR_BELOW_STEP_FACTOR = 1 / 3;
export const MIN_STEP_FAR_BELOW = 0.03;

/**
 * The swing that earns the reference ladder's own tenth-of-the-anchor step.
 *
 * A large listed company ordinarily travels about half its own price
 * between its high and its low over a year, and that is the company the
 * reference ladders were drawn for, so a name that swings twice as far
 * gets bands twice as wide and one that barely moves gets narrow ones.
 * The alternative, one width for every company, puts the same ladder on a
 * utility and on a coin.
 */
const ORDINARY_SWING = 0.5;

/**
 * How far below the anchor the bottom of the ladder sits, when there is
 * nothing better to put it on.
 *
 * Not a step. Every other edge on this ladder is a price where a reader
 * might do a bit more or a bit less of something; this one is the price
 * at which the estimates above are no longer describing the same company.
 * It moves with the step for the same reason the bands do: a name that
 * swings hard reaches a given fall on an ordinary bad month, so its floor
 * is further down.
 *
 * It is the fallback rather than the rule, because `ladderFloor` prefers
 * a real level to a ratio.
 */
export function exitRatio(step: number): number {
  return clamp(0.7 - 2 * step, 0.25, 0.55);
}

/**
 * THE FLOOR IS THE YEAR'S LOW, NOT A FRACTION OF ANYTHING.
 *
 * The four reference ladders this was built from put their floor at
 * 0.46, 0.51, 0.30 and 0.54 of their own anchor, which is not a ratio
 * anybody chose: a rule would not produce four numbers that far apart on
 * four ordinary companies. They are prices. The lowest a share has
 * actually traded in a year is the one price down there that means
 * something a reader can check, and "below anything it has traded at all
 * year" is a sentence with evidence behind it, where "below half the
 * estimate" is a sentence with arithmetic behind it and nothing else.
 *
 * Two guards, and both of them fall back rather than bending the number.
 * A low that is not clear of the accumulation band above it is not a
 * floor, it is the same level twice, so it stands down. And with no year
 * on file there is nothing to read, so the ratio does the job it was
 * always the fallback for.
 */
export function ladderFloor(input: {
  anchor: number;
  step: number;
  low?: number | null;
}): { price: number; fromYear: boolean } {
  const { anchor, step } = input;
  const byRatio = anchor * exitRatio(step);
  const low = input.low;
  if (!ok(low)) return { price: byRatio, fromYear: false };
  /*
    The bottom of the accumulation band, which is where the floor has to
    sit clear of: closer than half a step and the ladder ends on two
    levels a reader cannot tell apart.
  */
  const accumulationFloor = anchor * (1 - 3 * step);
  if (low > accumulationFloor - anchor * step * 0.5) {
    return { price: byRatio, fromYear: false };
  }
  return { price: low, fromYear: true };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function ok(v: number | null | undefined): v is number {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}

/**
 * How wide this company's bands should be, from how far it actually
 * travels.
 *
 * The year's high against its low is the one swing figure every kind of
 * listing carries, a coin and a fund included, which is what lets one
 * ladder serve all three. With no range at all it stands down to the
 * reference width rather than inventing a swing.
 */
export function stepFor(input: {
  high?: number | null;
  low?: number | null;
  anchor: number;
  /**
   * The window the high and the low were read over, in words.
   *
   * A company page has the feed's own year; a holding has whatever daily
   * closes this browser already holds, which is about three months. The
   * arithmetic is the same and the sentence must not claim the longer one:
   * a step read off three months and described as a year is the kind of
   * quietly wrong sentence this app does not print.
   */
  windowSaid?: string;
}): { step: number; said: string } {
  const { high, low, anchor } = input;
  const over = input.windowSaid ?? "the last year";
  if (!ok(high) || !ok(low) || !ok(anchor) || high <= low) {
    return {
      step: BASE_STEP,
      said: `Bands of ${percent(BASE_STEP, 0)} of the anchor, which is the ordinary width. The feed carried no high and low for this one, so nothing measured how far it actually travels.`,
    };
  }
  const swing = (high - low) / anchor;
  const raw =
    BASE_STEP * (1 + (swing / ORDINARY_SWING - 1) * SWING_WEIGHT);
  const step = clamp(raw, MIN_STEP, MAX_STEP);
  const capped =
    raw > MAX_STEP
      ? ` Held at the widest this app will draw, ${percent(MAX_STEP, 0)}.`
      : raw < MIN_STEP
        ? ` Held at the narrowest this app will draw, ${percent(MIN_STEP, 0)}.`
        : "";
  return {
    step,
    said: `Bands of ${percent(step, 0)} of the anchor, starting from the ${percent(BASE_STEP, 0)} an ordinary company gets. Over ${over} this one ran from ${currency(low, 2)} to ${currency(high, 2)}, which is ${percent(swing, 0)} of the anchor against ${percent(ORDINARY_SWING, 0)} for an ordinary large company, and two fifths of that difference reaches the bands.${capped}`,
  };
}

/**
 * Whether this price is far enough under the anchor to be in the second
 * regime, judged against the ordinary ladder rather than the tightened
 * one.
 *
 * Read against the ordinary step on purpose, and not iterated: the
 * tightened ladder's own accumulation band starts much higher, so asking
 * the question of it would answer yes for almost any price under the
 * anchor and the two regimes would have no boundary between them. The
 * boundary is the bottom of the ladder a reader would otherwise have
 * been shown.
 */
export function isFarBelow(input: {
  anchor: number;
  spot?: number | null;
  ordinaryStep: number;
}): boolean {
  const { anchor, spot, ordinaryStep } = input;
  if (!ok(spot) || !ok(anchor)) return false;
  return spot < anchor * (1 - 3 * ordinaryStep);
}

/** One reader's edits to a ladder, as multiples of the anchor. */
export type LadderOverride = {
  /** Edge ratios by band id, each the TOP of that band. */
  edges?: Partial<Record<LadderBandId, number>>;
  /** An anchor the reader typed, which replaces the computed one. */
  anchor?: number | null;
};

export type LadderOverrides = Record<string, LadderOverride>;

/**
 * The ladder for one listing.
 *
 * Returns null rather than a ladder around today's price when there is no
 * anchor: a ladder centred on the price is a statement that the price is
 * right, which is exactly the claim this app does not get to make.
 */
export function buildPlanLadder(input: {
  ticker: string;
  /** The reading the bands hang off, and what it is. */
  anchor: number | null;
  anchorKind: LadderAnchorKind;
  anchorSaid: string;
  spot?: number | null;
  high?: number | null;
  low?: number | null;
  /** The window the high and the low cover, in words. */
  windowSaid?: string;
  override?: LadderOverride | null;
}): PlanLadder | null {
  const typed = ok(input.override?.anchor) ? input.override.anchor : null;
  const anchor = typed ?? (ok(input.anchor) ? input.anchor : null);
  if (!ok(anchor)) return null;

  const ordinary = stepFor({
    high: input.high,
    low: input.low,
    anchor,
    windowSaid: input.windowSaid,
  });

  /*
    The second regime. A price down in the accumulation band gets a
    tighter ladder, for the reason `FAR_BELOW_STEP_FACTOR` gives, and the
    sentence behind the mark says which regime the reader is looking at:
    bands three per cent wide with no explanation would read as a bug on
    a company whose neighbour on the next page has ten.
  */
  const over = input.windowSaid ?? "the last year";
  const farBelow = isFarBelow({
    anchor,
    spot: input.spot,
    ordinaryStep: ordinary.step,
  });
  const step = farBelow
    ? Math.max(ordinary.step * FAR_BELOW_STEP_FACTOR, MIN_STEP_FAR_BELOW)
    : ordinary.step;
  const said = farBelow
    ? `${ordinary.said} Tightened to ${percent(step, 2)} because the price is a long way under the anchor: down there every price is the same decision, so the fine detail belongs at the top, where the levels you would actually meet are.`
    : ordinary.said;

  const edits = input.override?.edges ?? {};
  const floor = ladderFloor({ anchor, step, low: input.low });
  const exitAt = floor.price / anchor;

  /*
    Every band's top edge, as a multiple of the anchor. The bottom of one
    band is the top of the next, so the edges are computed once and the
    bands read them in pairs: two bands that disagree about the price
    between them is a ladder with a hole in it, which is worse than a
    ladder that is slightly wrong.
  */
  const tops: {
    id: LadderBandId;
    label: string;
    ratio: number | null;
    edited: boolean;
  }[] = EDGES.map((e) => {
    const computed =
      e.id === "trim-most"
        ? null
        : e.id === "exit"
          ? exitAt
          : 1 + (e.steps ?? 0) * step;
    const edit = edits[e.id];
    const edited = ok(edit) && computed !== null;
    return {
      id: e.id,
      label: e.label,
      ratio: edited ? (edit as number) : computed,
      edited,
    };
  });

  /*
    An edit can put one edge above the one over it, and the ladder has to
    stay a ladder: a reader who drags the "consider a trim" level above
    the one over it has said something about where they want that level,
    not that the bands should cross. Sorting the edges back into order is
    the least surprising answer, and it never silently changes a number.
    The open top edge sorts first, since there is no price above it.
  */
  const ordered = [...tops].sort(
    (a, b) => (b.ratio ?? Infinity) - (a.ratio ?? Infinity)
  );

  const bands: LadderBand[] = ordered.map((top, i) => {
    const below = ordered[i + 1];
    const fromRatio = below ? below.ratio : null;
    return {
      id: top.id,
      label: top.label,
      // The top band is open above and the bottom one open below, because
      // there is no highest price and no price below zero worth naming.
      to: i === 0 ? null : top.ratio === null ? null : top.ratio * anchor,
      from: fromRatio === null ? null : fromRatio * anchor,
      toRatio: i === 0 ? null : top.ratio,
      fromRatio,
      edited: top.edited,
    };
  });

  const spot = ok(input.spot) ? input.spot : null;

  return {
    ticker: input.ticker.toUpperCase(),
    anchor,
    anchorKind: typed ? "your-own" : input.anchorKind,
    anchorSaid: typed
      ? `${currency(anchor, 2)}, which is the figure you typed. Every band is a multiple of it, so changing it moves the whole ladder at once.`
      : input.anchorSaid,
    step,
    stepSaid: said,
    farBelow,
    floorFromYear: floor.fromYear,
    /*
      The window is carried into this sentence rather than assumed. A
      holding's ladder is drawn from the price history the browser
      already holds, which is about three months, and calling that "the
      lowest in a year" would be a false sentence with a real number in
      it, which is worse than either half alone.
    */
    floorSaid: floor.fromYear
      ? `${currency(floor.price, 2)}, the lowest it has actually traded over ${over}. Under that level the price is below anything the market has paid for it in that time, which is a fact you can check rather than a fraction of the estimate.`
      : `${currency(floor.price, 2)}, which is ${percent(1 - exitAt, 0)} under the anchor. There was no low over ${over} sitting clear of the band above it, so this one is worked out from the anchor rather than read off a price the share has actually traded at.`,
    bands,
    spot,
    atId: spot === null ? null : bandAt(bands, spot),
    edited: typed !== null || bands.some((b) => b.edited),
  };
}

/** Which band a price falls in. The top edge belongs to the band above. */
export function bandAt(bands: LadderBand[], price: number): LadderBandId | null {
  for (const b of bands) {
    const overFloor = b.from === null || price > b.from;
    const underCeiling = b.to === null || price <= b.to;
    if (overFloor && underCeiling) return b.id;
  }
  return null;
}

/**
 * Where in its own band a price sits, as a fraction of the band's width.
 *
 * An open band has no width to be a fraction of, so the mark is put near
 * the end that carries the level, which is the one edge the reader can
 * check. Half way up an open band would be a position the arithmetic
 * never produced.
 */
export function positionInBand(band: LadderBand, price: number): number {
  const { from, to } = band;
  if (from !== null && to !== null && to > from) {
    return Math.min(Math.max((price - from) / (to - from), 0), 1);
  }
  return to === null ? 0.85 : 0.15;
}

/**
 * The bands where the plan says something decisive, and the only ones
 * anything is allowed to raise its voice about.
 *
 * The middle of a ladder is where a price ordinarily sits: an alert that
 * fires while nothing has happened is one a reader learns to swipe past,
 * which is the lesson the borrowed-money card already records. One list,
 * used by the alert builder and by the map on the holdings page, so a
 * name called out in one place cannot be quiet in the other.
 */
export const ACTIONABLE_BANDS: readonly LadderBandId[] = [
  "trim-most",
  "full",
  "full-aggressive",
  "exit",
];

export function isActionableBand(id: LadderBandId | string | null): boolean {
  return ACTIONABLE_BANDS.includes(id as LadderBandId);
}

export function bandById(
  ladder: PlanLadder,
  id: LadderBandId
): LadderBand | null {
  return ladder.bands.find((b) => b.id === id) ?? null;
}

/**
 * Where the price sits, as a fact rather than as a verdict.
 *
 * Deliberately never "cheap", never "time to buy", and never an
 * instruction of any kind: it names the band the reader's own plan puts
 * this price in, and the distance to the nearest edge, which is checkable
 * against the table directly underneath it.
 */
export function ladderRead(ladder: PlanLadder): string {
  const spot = ladder.spot;
  if (spot === null) {
    return `There is no price for ${cashtag(ladder.ticker)} right now, so nothing can be placed on this ladder. The levels below are still what your plan says.`;
  }
  const band = ladder.bands.find((b) => b.id === ladder.atId);
  if (!band) {
    return `${currency(spot, 2)} today. Your plan does not cover that price.`;
  }
  const next = nearestEdge(ladder, spot);
  /*
    "The level you set" only where the reader actually set one. Every
    ladder starts as arithmetic nobody typed, and telling somebody they
    chose a number they have never seen is the same mistake the strike
    alert made with a stock target the app had worked out for itself.
  */
  const whose = ladder.edited ? "The nearest level you set" : "The nearest level on it";
  const distance = next
    ? ` ${whose} is ${currency(next.price, 2)}, which is ${percent(Math.abs(next.price - spot) / spot, 1)} ${next.price > spot ? "above" : "below"} today.`
    : "";
  return `${currency(spot, 2)} today, which your plan files under "${band.label}".${distance}`;
}

/** The closest edge to a price, in either direction. */
export function nearestEdge(
  ladder: PlanLadder,
  price: number
): { id: LadderBandId; price: number } | null {
  let best: { id: LadderBandId; price: number } | null = null;
  for (const b of ladder.bands) {
    if (b.to === null) continue;
    if (!best || Math.abs(b.to - price) < Math.abs(best.price - price)) {
      best = { id: b.id, price: b.to };
    }
  }
  return best;
}
