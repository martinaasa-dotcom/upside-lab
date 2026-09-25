import { daysToExpiry } from "@/lib/options/black-scholes";

/**
 * Covered calls the reader has actually sold, or means to, and what the
 * market says about each one today.
 *
 * Everything else on the covered-call panel is a suggestion worked out from
 * a holding: here is a strike, here is what it would pay. That answers
 * "what could I write", and stops being any use the moment somebody writes
 * one, because the question then becomes the one this file answers: is the
 * call I sold still fine, is it about to take my shares, and have I already
 * made most of what it will ever pay me.
 *
 * Two readings decide it and both are checkable. **Delta** is how much the
 * call moves for a dollar of the share, and for the person who sold it the
 * market's own rough odds that the shares are taken at the strike; it is
 * worked out from the strike, the expiry and the price the market is paying
 * for that exact contract (`black-scholes.ts`). **What you have kept** is
 * the premium received less what buying the call back costs today, as a
 * share of the premium.
 *
 * The rules that turn those two readings into "roll" or "close" are the
 * reader's, with the two conventions most people who write these calls
 * already use as the starting values: roll once delta reaches 0.70, and
 * close once half the premium has been kept. Both are editable, the panel
 * prints them beside the verdict, and a verdict is always "your rule is
 * met" rather than this app's own view of the company.
 *
 * Pure: nothing here fetches or reads a clock it was not handed.
 */

export type TrackedCallStatus = "sold" | "planned";

export type TrackedCall = {
  id: string;
  portfolio_id: string;
  ticker: string;
  status: TrackedCallStatus;
  strike: number;
  /** YYYY-MM-DD, the listed expiry date. */
  expiry: string;
  contracts: number;
  /**
   * Per share. For a sold call, what the buyer paid. For a planned one,
   * the price the reader wants for it, or null for "whatever it pays".
   */
  premium: number | null;
  /** YYYY-MM-DD, the day it was sold. Optional. */
  opened_on: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

/** Where a delta's volatility came from, in the order it is preferred. */
export type VolSource =
  /** Solved from the mid the market is quoting for this exact contract. */
  | "market"
  /** The feed's own implied figure for this contract. */
  | "feed"
  /** Borrowed from the nearest listed strike on the same expiry. */
  | "neighbour"
  /** The share's own recent daily moves: no option price was available. */
  | "history";

/** A way to roll a call up and out that the chain can actually fill. */
export type RollIdea = {
  strike: number;
  expiry: string;
  /** Per share: what the new call pays. */
  newMid: number;
  /** Per share: what buying the current one back costs. */
  closeMid: number;
  /** Per share: newMid - closeMid. Positive is money in. */
  net: number;
  delta: number | null;
  /** "up-and-out" raises the strike; "out" keeps it and only buys time. */
  kind: "up-and-out" | "out";
};

/** The market's answer about one contract, as the scan route returns it. */
export type ContractReading = {
  id: string;
  ticker: string;
  strike: number;
  expiry: string;
  spot: number;
  /** Per share, or null when the chain had no usable quote. */
  mid: number | null;
  bid: number | null;
  ask: number | null;
  vol: number | null;
  volSource: VolSource | null;
  delta: number | null;
  /** True when a mid was quoted rather than worked out from a volatility. */
  quoted: boolean;
  /** Only asked for when a sold call is past its roll level or near the bell. */
  roll: RollIdea | null;
  /** True once the server has looked for a roll and found none that pays. */
  rollSearched: boolean;
};

export type CallRules = {
  /** Delta at which the reader wants to roll. */
  rollDelta: number;
  /** Share of the premium kept at which the reader wants to buy back. */
  takeProfit: number;
};

export const DEFAULT_CALL_RULES: CallRules = { rollDelta: 0.7, takeProfit: 0.5 };

/** Where a call is at the money: even odds the shares are taken. */
export const WATCH_DELTA = 0.5;
/** Days left at which an in-the-money call is treated as likely exercised. */
export const ASSIGNMENT_DAYS = 5;
/** Below this delta with a couple of days left, it is expiring with nothing to pay. */
export const WORTHLESS_DELTA = 0.1;

export const ROLL_DELTA_RANGE = { min: 0.5, max: 0.95 } as const;
export const TAKE_PROFIT_RANGE = { min: 0.2, max: 0.95 } as const;

export function sanitizeRules(raw: unknown): CallRules {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const clamp = (v: unknown, lo: number, hi: number, fallback: number) =>
    typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? v : fallback;
  return {
    rollDelta: clamp(r.rollDelta, ROLL_DELTA_RANGE.min, ROLL_DELTA_RANGE.max, DEFAULT_CALL_RULES.rollDelta),
    takeProfit: clamp(r.takeProfit, TAKE_PROFIT_RANGE.min, TAKE_PROFIT_RANGE.max, DEFAULT_CALL_RULES.takeProfit),
  };
}

export type CallHealthKind =
  | "expired"
  | "roll"
  | "assignment"
  | "close"
  | "watch"
  | "ok"
  | "unknown"
  // planned only
  | "ready"
  | "waiting";

export type CallTone = "loss" | "warning" | "gain" | "neutral";

export type CallHealth = {
  kind: CallHealthKind;
  /** Two or three words, the badge. */
  label: string;
  tone: CallTone;
  /** One sentence: what the readings say. */
  read: string;
  /** One sentence: what the rule that fired means doing, or null. */
  move: string | null;
  /** Fraction of the premium kept so far, or null when it cannot be known. */
  kept: number | null;
  /** Per share, premium received less the cost of buying it back. */
  gainPerShare: number | null;
  /** Whole position, in dollars. */
  gainTotal: number | null;
  /** What buying the whole position back costs today. */
  closeCost: number | null;
  /** Whether the reader should be asked about this one on Home. */
  urgent: boolean;
};

const SHARES_PER_CONTRACT = 100;

function money(n: number): string {
  const abs = Math.abs(n);
  const s = abs.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${n < 0 ? "-" : ""}$${s}`;
}

function wholeMoney(n: number): string {
  const abs = Math.abs(Math.round(n));
  return `${n < 0 ? "-" : ""}$${abs.toLocaleString("en-US")}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A date key as a person reads it: "Oct 16". Not a clock, so no time zone. */
export function dayText(key: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return key;
  return `${MONTHS[Number(m[2]) - 1] ?? m[2]} ${Number(m[3])}`;
}

/** Delta as the broker prints it, two decimals. */
export function deltaText(delta: number): string {
  return delta.toFixed(2);
}

/**
 * Delta said as odds a person can picture. Rounded to a plain fraction so
 * it never reads as more precise than a model of a price can be.
 */
export function oddsText(delta: number): string {
  const pct = Math.round(delta * 100);
  if (pct >= 97) return "almost certain";
  if (pct <= 3) return "close to none";
  const table: [number, string][] = [
    [10, "about one in ten"],
    [20, "about one in five"],
    [25, "about one in four"],
    [33, "about one in three"],
    [40, "about two in five"],
    [50, "about even"],
    [60, "about three in five"],
    [67, "about two in three"],
    [75, "about three in four"],
    [80, "about four in five"],
    [90, "about nine in ten"],
  ];
  let best = table[0]!;
  for (const row of table) {
    if (Math.abs(row[0] - pct) < Math.abs(best[0] - pct)) best = row;
  }
  return best[1];
}

function daysSaid(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "1 day left";
  return `${days} days left`;
}

/** A rolled call described in one sentence, in the reader's own money. */
export function rollSaid(roll: RollIdea, contracts: number): string {
  const shares = contracts * SHARES_PER_CONTRACT;
  const total = roll.net * shares;
  const where =
    roll.kind === "up-and-out"
      ? `the ${money(roll.strike)} strike expiring ${dayText(roll.expiry)}`
      : `the same strike expiring ${dayText(roll.expiry)}`;
  const delta = roll.delta != null ? `, delta ${deltaText(roll.delta)}` : "";
  if (roll.net >= 0) {
    return `One that pays for itself: ${where}${delta}. It brings in ${money(roll.net)} a share more than buying this one back costs, ${wholeMoney(total)} in all.`;
  }
  return `Nothing later pays for itself at a higher strike. The closest is ${where}${delta}, which costs ${money(-roll.net)} a share more than it brings in, ${wholeMoney(-total)} in all.`;
}

/**
 * What the readings say about a call the reader has sold.
 *
 * The order is the order of what costs most to miss: a call past its
 * expiry, then one past the roll level, then one likely to be exercised
 * this week, then one that has already paid most of what it will, then
 * one at the money, and only then "fine".
 */
export function soldCallHealth(
  call: TrackedCall,
  reading: ContractReading | null,
  rules: CallRules,
  daysLeft: number | null
): CallHealth {
  const shares = call.contracts * SHARES_PER_CONTRACT;
  const premium = call.premium != null && call.premium > 0 ? call.premium : null;
  const mid = reading?.mid ?? null;
  const delta = reading?.delta ?? null;
  const kept =
    premium != null && mid != null ? (premium - mid) / premium : null;
  const gainPerShare = premium != null && mid != null ? premium - mid : null;
  const gainTotal = gainPerShare != null ? gainPerShare * shares : null;
  const closeCost = mid != null ? mid * shares : null;
  const base = { kept, gainPerShare, gainTotal, closeCost };

  if (daysLeft != null && daysLeft <= 0) {
    const spot = reading?.spot ?? null;
    const taken = spot != null && spot > call.strike;
    return {
      ...base,
      kind: "expired",
      label: "Expired",
      tone: "neutral",
      read: taken
        ? `It expired with the share above ${money(call.strike)}, so the shares were most likely taken at the strike.`
        : `It expired below the strike, so the whole ${premium != null ? money(premium) + " a share" : "premium"} is kept.`,
      move: "Remove it here once your broker shows it settled.",
      urgent: false,
    };
  }

  if (delta == null) {
    return {
      ...base,
      kind: "unknown",
      label: "No reading",
      tone: "neutral",
      read: "The option market has no price for this contract right now, so there is no delta to show.",
      move: null,
      urgent: false,
    };
  }

  const dText = deltaText(delta);
  const days = daysLeft ?? null;
  const keptSaid =
    kept != null && premium != null
      ? kept >= 0
        ? `You have kept ${Math.round(kept * 100)}% of the ${money(premium)} a share you were paid.`
        : `Buying it back now costs ${money(-gainPerShare!)} a share more than you were paid.`
      : null;

  if (delta >= rules.rollDelta) {
    return {
      ...base,
      kind: "roll",
      label: "Roll zone",
      tone: "loss",
      read: `Delta is ${dText}, at or past the ${deltaText(rules.rollDelta)} you set for rolling: the market puts the odds of your shares being taken at ${oddsText(delta)}.${days != null ? ` ${capitalise(daysSaid(days))}.` : ""}`,
      move:
        "Rolling up and out means buying this call back and selling one with a later expiry and a higher strike, ideally for more than the buyback costs. Letting it run means the shares may be sold at the strike.",
      urgent: true,
    };
  }

  if (delta >= WATCH_DELTA && days != null && days <= ASSIGNMENT_DAYS) {
    return {
      ...base,
      kind: "assignment",
      label: "Could be taken",
      tone: "warning",
      read: `Delta is ${dText} with ${daysSaid(days)}: the share is above the strike, and if it stays there the shares are likely to be taken at ${money(call.strike)} on ${dayText(call.expiry)}.`,
      move:
        "If you want to keep the shares, this is the week to roll it up and out. If selling at the strike is fine, there is nothing to do.",
      urgent: true,
    };
  }

  if (kept != null && kept >= rules.takeProfit) {
    const worthless = days != null && days <= 2 && delta < WORTHLESS_DELTA;
    return {
      ...base,
      kind: "close",
      label: worthless ? "Nearly done" : "Close zone",
      tone: "gain",
      read: `${keptSaid} Delta is down to ${dText}.`,
      move: worthless
        ? `It is likely to expire with nothing to pay, so letting it run out costs nothing. Buying it back costs ${wholeMoney(closeCost!)} and only frees the shares a day or two early.`
        : `That is past the ${Math.round(rules.takeProfit * 100)}% you set for buying it back. Buying it back costs ${wholeMoney(closeCost!)} and frees the shares to write another call${days != null && days > 0 ? `, instead of waiting ${days === 1 ? "a day" : `${days} days`} for the rest` : ""}.`,
      urgent: !worthless,
    };
  }

  if (delta >= WATCH_DELTA) {
    return {
      ...base,
      kind: "watch",
      label: "Watch",
      tone: "warning",
      read: `Delta is ${dText}: the share is at or above the strike, and the odds of it being taken are ${oddsText(delta)}. Your roll level is ${deltaText(rules.rollDelta)}.`,
      move: keptSaid,
      urgent: false,
    };
  }

  return {
    ...base,
    kind: "ok",
    label: "On track",
    tone: "neutral",
    read: `Delta is ${dText}: odds of the shares being taken are ${oddsText(delta)}.${days != null ? ` ${capitalise(daysSaid(days))}.` : ""}`,
    move: keptSaid,
    urgent: false,
  };
}

/** What the readings say about a call the reader plans to sell. */
export function plannedCallHealth(
  call: TrackedCall,
  reading: ContractReading | null,
  daysLeft: number | null
): CallHealth {
  const shares = call.contracts * SHARES_PER_CONTRACT;
  const mid = reading?.mid ?? null;
  const delta = reading?.delta ?? null;
  const base = {
    kept: null,
    gainPerShare: null,
    gainTotal: mid != null ? mid * shares : null,
    closeCost: null,
    urgent: false,
  };
  if (daysLeft != null && daysLeft <= 0) {
    return {
      ...base,
      kind: "expired",
      label: "Date passed",
      tone: "neutral",
      read: "This expiry has passed without the call being sold.",
      move: "Change the date to a later expiry, or remove it.",
    };
  }
  const deltaSaid =
    delta != null
      ? ` Delta would be ${deltaText(delta)}, so odds of the shares being taken are ${oddsText(delta)}.`
      : "";
  if (mid == null) {
    return {
      ...base,
      kind: "unknown",
      label: "No price",
      tone: "neutral",
      read: `The option market has no price for this contract right now.${deltaSaid}`,
      move: null,
    };
  }
  const payNow = `It pays ${money(mid)} a share now, ${wholeMoney(mid * shares)} for ${call.contracts} contract${call.contracts === 1 ? "" : "s"}.`;
  if (call.premium == null || call.premium <= 0) {
    return {
      ...base,
      kind: "ready",
      label: "Priced",
      tone: "neutral",
      read: `${payNow}${deltaSaid}`,
      move: null,
    };
  }
  if (mid >= call.premium) {
    return {
      ...base,
      kind: "ready",
      label: "Price reached",
      tone: "gain",
      read: `${payNow} That is at or above the ${money(call.premium)} you wanted.${deltaSaid}`,
      move: "Once you have sold it, mark it as sold here so its delta is tracked.",
      urgent: true,
    };
  }
  return {
    ...base,
    kind: "waiting",
    label: "Waiting",
    tone: "neutral",
    read: `${payNow} You want ${money(call.premium)}, ${Math.round(((call.premium - mid) / call.premium) * 100)}% more.${deltaSaid}`,
    move: null,
  };
}

function capitalise(s: string): string {
  return s ? s[0]!.toUpperCase() + s.slice(1) : s;
}

/* ------------------------------------------------------------------ */
/* Every call read against the rules, most pressing first.             */
/* ------------------------------------------------------------------ */

export const URGENCY: Record<CallHealth["kind"], number> = {
  roll: 0,
  assignment: 1,
  close: 2,
  ready: 3,
  expired: 4,
  watch: 5,
  waiting: 6,
  ok: 7,
  unknown: 8,
};

/** A reading only counts for the contract it was taken on. */
export function readingFor(call: TrackedCall, readings: Record<string, ContractReading>) {
  const r = readings[call.id];
  if (!r) return null;
  return r.strike === call.strike && r.expiry === call.expiry && r.ticker === call.ticker
    ? r
    : null;
}

export type CallView = {
  call: TrackedCall;
  reading: ContractReading | null;
  health: CallHealth;
  daysLeft: number | null;
};

export function buildCallViews(
  calls: TrackedCall[],
  readings: Record<string, ContractReading>,
  rules: CallRules,
  now: Date = new Date()
): CallView[] {
  return calls
    .map((call) => {
      const reading = readingFor(call, readings);
      const daysLeft = daysToExpiry(call.expiry, now);
      const health =
        call.status === "sold"
          ? soldCallHealth(call, reading, rules, daysLeft)
          : plannedCallHealth(call, reading, daysLeft);
      return { call, reading, health, daysLeft };
    })
    .sort(
      (a, b) =>
        URGENCY[a.health.kind] - URGENCY[b.health.kind] ||
        a.call.expiry.localeCompare(b.call.expiry)
    );
}

/* ------------------------------------------------------------------ */
/* Validation, shared by the route and the browser store.              */
/* ------------------------------------------------------------------ */

export const MAX_TRACKED_CALLS = 60;

export function isDateKey(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

export type TrackedCallDraft = Omit<TrackedCall, "id" | "portfolio_id" | "created_at" | "updated_at">;

/**
 * The fields of a call, or the sentence saying what is wrong with them.
 * Every figure here reaches a reader as a fact, so a range is settled
 * before anything is stored.
 */
export function validateCallDraft(
  raw: unknown
): { ok: true; draft: TrackedCallDraft } | { ok: false; error: string } {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const ticker = typeof r.ticker === "string" ? r.ticker.trim().toUpperCase() : "";
  if (!ticker || ticker.length > 24) return { ok: false, error: "Pick which holding the call is on." };
  const status = r.status === "planned" ? "planned" : r.status === "sold" ? "sold" : null;
  if (!status) return { ok: false, error: "Say whether you have sold it or plan to." };
  const strike = Number(r.strike);
  if (!Number.isFinite(strike) || strike <= 0 || strike > 1_000_000) {
    return { ok: false, error: "The strike must be a positive price." };
  }
  if (!isDateKey(r.expiry)) return { ok: false, error: "The expiry must be a date." };
  const contracts = Number(r.contracts);
  if (!Number.isInteger(contracts) || contracts < 1 || contracts > 10_000) {
    return { ok: false, error: "Contracts must be a whole number, at least 1." };
  }
  let premium: number | null = null;
  if (r.premium != null && r.premium !== "") {
    const p = Number(r.premium);
    if (!Number.isFinite(p) || p <= 0 || p > 100_000) {
      return { ok: false, error: "The premium must be a positive price per share." };
    }
    premium = Math.round(p * 10_000) / 10_000;
  }
  if (status === "sold" && premium == null) {
    return { ok: false, error: "Enter the premium you were paid, per share." };
  }
  const openedOn = r.opened_on == null || r.opened_on === "" ? null : r.opened_on;
  if (openedOn != null && !isDateKey(openedOn)) {
    return { ok: false, error: "The date sold must be a date." };
  }
  return {
    ok: true,
    draft: {
      ticker,
      status,
      strike: Math.round(strike * 10_000) / 10_000,
      expiry: r.expiry as string,
      contracts,
      premium,
      opened_on: openedOn as string | null,
    },
  };
}
