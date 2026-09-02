/**
 * What you would have to believe for a price target to happen.
 *
 * A forecast panel puts a number in front of somebody and the number does
 * the arguing. "$120 by December" reads as a fact about the future even
 * when every label around it says otherwise, because a figure with two
 * decimal places looks like a measurement.
 *
 * The cure is not a louder disclaimer. It is arithmetic: say what that
 * number is asking of the company, in units the reader can weigh against
 * things they have already seen. A price that needs a 44% gain in four
 * months is asking for something; whether it is a lot depends on how far
 * that company usually travels, and the reader's own history says.
 *
 * Nothing here forecasts, endorses or refuses a target. It restates one,
 * and every sentence is checkable against numbers already on the screen.
 */

import { typicalMoveFromCloses, type TypicalMove } from "@/lib/typical-move";

export type BeliefInput = {
  /** What the reader calls it: "Apple", or the cashtag if that is all we have. */
  subject: string;
  /** Today's price. */
  spot: number;
  /** The price the target names. */
  target: number;
  /** Months from now the target is set for. Zero or less means undated. */
  months: number;
  /** Recent closing prices, for the company's own sense of scale. */
  closes?: number[];
};

export type Belief = {
  /** The whole change asked for, as a fraction: 0.44 is a 44% gain. */
  totalPct: number;
  /** The same change said as a rate a year, when the horizon allows one. */
  annualPct: number | null;
  /** How the company's own recent range compares, when history allows. */
  scale: { lowest: number; highest: number; ranges: number } | null;
  typical: TypicalMove | null;
};

export function belief(input: BeliefInput): Belief | null {
  const { spot, target, months, closes } = input;
  if (!(spot > 0) || !(target > 0) || !Number.isFinite(months)) return null;

  const totalPct = (target - spot) / spot;
  const years = months / 12;
  const annualPct =
    years >= 0.5 && Number.isFinite(years)
      ? Math.pow(target / spot, 1 / years) - 1
      : null;

  const clean = (closes ?? []).filter((n) => Number.isFinite(n) && n > 0);
  let scale: Belief["scale"] = null;
  if (clean.length >= 10) {
    const lowest = Math.min(...clean);
    const highest = Math.max(...clean);
    const span = highest - lowest;
    if (span > 0) {
      scale = {
        lowest,
        highest,
        ranges: Math.abs(target - spot) / span,
      };
    }
  }

  return {
    totalPct,
    annualPct,
    scale,
    typical: typicalMoveFromCloses(clean),
  };
}

function pct(n: number): string {
  const shown = Math.abs(n) * 100;
  if (shown < 0.1) return "less than 0.1%";
  return `${shown < 10 ? Number(shown.toFixed(1)) : Math.round(shown)}%`;
}

function whenText(months: number): string {
  if (months <= 0) return "";
  if (months < 12) return ` in ${Math.round(months)} months`;
  const years = months / 12;
  const whole = Math.round(years);
  return ` in ${whole === 1 ? "a year" : `${whole} years`}`;
}

/**
 * Two or three sentences saying what the target asks for.
 *
 * The first is the plain arithmetic. The second puts it against the
 * company's own recent travel, which is the part that makes a number
 * feel large or ordinary. Neither says whether it will happen, because
 * nothing here knows.
 */
export function beliefLines(
  input: BeliefInput,
  money: (n: number) => string
): string[] {
  const b = belief(input);
  if (!b) return [];
  const { subject, spot, target, months } = input;
  const lines: string[] = [];

  if (Math.abs(b.totalPct) < 0.005) {
    lines.push(
      `${money(target)} is about where ${subject} is today, so this asks for no change at all.`
    );
  } else {
    const way = b.totalPct > 0 ? "gain" : "fall";
    lines.push(
      `For ${subject} to reach ${money(target)}${whenText(months)} from ${money(spot)} today, it has to ${way} ${pct(b.totalPct)}.`
    );
  }

  if (b.annualPct != null && Math.abs(b.totalPct) >= 0.005) {
    lines.push(
      `That is about ${pct(b.annualPct)} a year, every year, ${b.annualPct >= 0 ? "up" : "down"}.`
    );
  }

  if (b.scale && Math.abs(b.totalPct) >= 0.005) {
    const { lowest, highest, ranges } = b.scale;
    const howMany =
      ranges < 0.5
        ? "less than half"
        : ranges < 1.5
          ? "about one"
          : `about ${Math.round(ranges)}`;
    lines.push(
      `${subject} has been between ${money(lowest)} and ${money(highest)} lately, so this is ${howMany} of that whole stretch again.`
    );
  }

  return lines;
}

/**
 * The same idea for a broad fund, where naming the company is wrong.
 *
 * A fund's target is a statement about a whole market, so the sentence
 * says so: reaching it means every company in it, on average, doing this.
 */
export function fundBeliefLine(
  input: BeliefInput,
  money: (n: number) => string
): string | null {
  const b = belief(input);
  if (!b || Math.abs(b.totalPct) < 0.005) return null;
  const way = b.totalPct > 0 ? "worth" : "down to";
  return `${input.subject} holds hundreds of companies, so ${money(input.target)}${whenText(input.months)} means the whole market being ${way} ${pct(b.totalPct)} ${b.totalPct > 0 ? "more" : "less"} than it is today.`;
}
