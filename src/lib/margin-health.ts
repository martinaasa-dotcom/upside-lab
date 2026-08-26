import { currency, percent } from "@/lib/format";
import { finiteNumber, roundMoney } from "@/lib/money";

/**
 * How much borrowed money a portfolio is carrying, and how far its stocks
 * could fall before the broker starts selling.
 *
 * Negative cash used to be one flat red alarm at anything under -$500: a
 * rose card, a warning triangle, and the sentence "Cash is -$20,000." That
 * is wrong in both directions at once. Borrowing $20,000 against $300,000
 * is an ordinary way to hold a portfolio and gets the same triangle as
 * borrowing $20,000 against $25,000, which is somebody about two bad weeks
 * from a forced sale. And neither version told the reader the one number
 * that decides which of those they are in, so the loudest thing on the
 * screen carried the least information on it.
 *
 * The size that matters is borrowed money against what the portfolio is
 * actually worth (stocks plus cash, so the loan is already netted out).
 * Up to about 30% of that is a normal amount to carry. Half of it is the
 * point where an ordinary bad month reaches the broker's floor.
 */

/**
 * The share of the stocks the broker wants covered by the reader's own
 * money before it can sell.
 *
 * Real maintenance requirements are usually 25% to 30%, and brokers raise
 * them without notice on a single concentrated or volatile name, which is
 * exactly the portfolio most likely to be reading this. 50% is the
 * conservative read, and it is the honest one to put in front of somebody
 * making a decision: a cushion that turns out to be bigger than promised
 * costs nobody anything, and one that turns out to be smaller is a forced
 * sale. `book-shock.ts` models a scenario against the standard 30% and
 * that stays as it is; this is the resting number on the Cash card.
 */
export const MAINTENANCE_RATE = 0.5;

/** Below this there is no loan worth naming, just a rounding balance. */
const MIN_DEBT = 50;

/** Normal to carry, more than most people carry, and close to the floor. */
export const HEAVY_SHARE = 0.3;
export const CALL_RISK_SHARE = 0.5;

export type MarginTier = "none" | "steady" | "heavy" | "call-risk";

export type MarginHealth = {
  tier: MarginTier;
  /** Dollars owed, always positive. Zero when nothing is borrowed. */
  borrowed: number;
  /** Market value of the stocks held. */
  stocksValue: number;
  /** Stocks plus cash, so the loan is already taken off. Can go negative. */
  portfolioValue: number;
  /** Borrowed money as a share of portfolio value. Null when that is gone. */
  borrowedShare: number | null;
  /**
   * How far the stocks can fall before the broker can sell to cover the
   * loan, as a fraction. Null when nothing is borrowed, 0 when the floor
   * has already been reached.
   */
  dropToCall: number | null;
  /** The same distance in dollars off the stocks. */
  dropDollars: number | null;
  maintenanceRate: number;
};

/**
 * Where the broker's floor sits.
 *
 * The reader's own money in the account is `stocks - borrowed`. The broker
 * wants that to stay at or above `m` of whatever the stocks are worth. Let
 * the stocks fall by a fraction f:
 *
 *   stocks(1 - f) - borrowed  >=  m * stocks(1 - f)
 *   stocks(1 - f)(1 - m)      >=  borrowed
 *   f                         <=  1 - borrowed / (stocks * (1 - m))
 *
 * At m = 0.5 that is simply `1 - 2 * borrowed / stocks`: borrow a quarter
 * of what the stocks are worth and they can halve before the call comes.
 */
export function dropToMarginCall(
  stocksValue: number,
  borrowed: number,
  maintenanceRate = MAINTENANCE_RATE
): number {
  const stocks = finiteNumber(stocksValue);
  const debt = Math.abs(finiteNumber(borrowed));
  if (debt <= 0) return 1;
  if (stocks <= 0) return 0;
  const room = stocks * (1 - maintenanceRate);
  if (room <= 0) return 0;
  return Math.min(1, Math.max(0, 1 - debt / room));
}

export function marginHealth(input: {
  cash: number;
  equityValue: number;
  maintenanceRate?: number;
}): MarginHealth {
  const maintenanceRate = input.maintenanceRate ?? MAINTENANCE_RATE;
  const cash = finiteNumber(input.cash);
  const stocksValue = Math.max(0, finiteNumber(input.equityValue));
  const borrowed = cash < 0 ? roundMoney(-cash) : 0;
  const portfolioValue = roundMoney(stocksValue + cash);

  if (borrowed < MIN_DEBT) {
    return {
      tier: "none",
      borrowed: 0,
      stocksValue,
      portfolioValue,
      borrowedShare: null,
      dropToCall: null,
      dropDollars: null,
      maintenanceRate,
    };
  }

  // Once the loan is worth more than the portfolio there is no share to
  // quote: the reader's own money in the account is gone or negative, and
  // any percentage of it is either enormous or the wrong sign. That case
  // goes straight to the top tier on its own.
  const borrowedShare = portfolioValue > 0 ? borrowed / portfolioValue : null;
  const dropToCall = dropToMarginCall(stocksValue, borrowed, maintenanceRate);

  const tier: MarginTier =
    borrowedShare == null || borrowedShare >= CALL_RISK_SHARE
      ? "call-risk"
      : borrowedShare >= HEAVY_SHARE
        ? "heavy"
        : "steady";

  return {
    tier,
    borrowed,
    stocksValue,
    portfolioValue,
    borrowedShare,
    dropToCall,
    dropDollars: roundMoney(stocksValue * dropToCall),
    maintenanceRate,
  };
}

/** Calm, then a note, then a real warning. Nothing red below 30%. */
export type MarginToneName = "neutral" | "warning" | "loss";

export function marginTone(tier: MarginTier): MarginToneName {
  if (tier === "call-risk") return "loss";
  if (tier === "heavy") return "warning";
  return "neutral";
}

/** "Stocks can fall 46% before a forced sale", or the already-there case. */
export function marginCushionLine(health: MarginHealth): string | null {
  if (health.dropToCall == null) return null;
  if (health.dropToCall <= 0) {
    return "Your stocks are already at the level where a broker can sell to cover the loan.";
  }
  return `Your stocks would have to fall ${percent(health.dropToCall, 0)}, about ${currency(health.dropDollars, 0)}, before a broker could sell them to cover the loan.`;
}

export type MarginCopy = {
  title: string;
  detail: string;
  /** The short version, for a card that has one line to spend. */
  cushion: string | null;
};

/**
 * One sentence on the size, one on the distance to the floor.
 * The numbers are the point. An instruction to sell or repay is not.
 */
export function marginCopy(health: MarginHealth): MarginCopy | null {
  if (health.tier === "none") return null;

  const amount = currency(health.borrowed, 0);
  const share =
    health.borrowedShare != null ? percent(health.borrowedShare, 0) : null;
  const cushion = marginCushionLine(health);
  const floor = `This assumes a broker wanting ${percent(health.maintenanceRate, 0)} of the stocks covered by your own money, which is stricter than most and the safer thing to plan against.`;

  if (health.tier === "steady") {
    return {
      title: `You have ${amount} of borrowed money`,
      detail: [
        share
          ? `That is ${share} of what your portfolio is worth, which is a normal amount to carry.`
          : "That is a normal amount to carry.",
        cushion,
        "Gains and losses both land on the full amount you hold, not just your own share of it.",
      ]
        .filter(Boolean)
        .join(" "),
      cushion,
    };
  }

  if (health.tier === "heavy") {
    return {
      title: share
        ? `Borrowed money is ${share} of your portfolio`
        : `You have ${amount} of borrowed money`,
      detail: [
        `${amount} borrowed is more than most people carry, and past here an ordinary bad month starts to matter.`,
        cushion,
        floor,
      ]
        .filter(Boolean)
        .join(" "),
      cushion,
    };
  }

  // Two leads, because "close to the point" beside a cushion line reading
  // "already at the level" is the card contradicting itself in consecutive
  // sentences, and the reader it happens to is the one with the least room
  // to spare. Past the floor, say so first.
  const atFloor = health.dropToCall != null && health.dropToCall <= 0;
  const lead = atFloor
    ? `${amount} borrowed is at or past the point where a broker can sell your stocks without asking you first, which is called a margin call.`
    : `${amount} borrowed against ${currency(Math.max(0, health.portfolioValue), 0)} of your own money is close to the point where a broker can sell your stocks without asking you first, which is called a margin call.`;

  return {
    title: share
      ? `Borrowed money is ${share} of your portfolio`
      : `Your ${amount} loan is larger than your portfolio`,
    detail: [
      lead,
      cushion,
      floor,
    ]
      .filter(Boolean)
      .join(" "),
    cushion,
  };
}
