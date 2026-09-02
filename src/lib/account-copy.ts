/**
 * The words on the Account page that have to agree with something else.
 *
 * Everything here is either derived from a constant the app already acts on,
 * or from the reader's own rows. That is the whole reason the file exists.
 * Account is the page where the product describes itself to somebody who has
 * already signed up, and every sentence on it had drifted from the thing it
 * describes: the panel asking for twelve euros promised "Pro" while the
 * paragraph beside it said the subscription gets you nothing, the experience
 * question said it "only changes how much is shown" without ever saying what,
 * and the delete dialog explained in seventy words what it could have listed
 * from rows the page has already fetched.
 *
 * A sentence about behaviour that is typed by hand is a sentence that goes
 * stale silently. So the tier lines are computed from `TIER_HIDDEN_META_TABS`
 * and `TIER_HIDDEN_LAB_TABS`, the next Sunday comes from the same schedule
 * `vercel.json` gives the cron, and the deletion list is built from the
 * portfolios, holdings and circles the account actually has.
 */
import { LAB_TAB_ID } from "@/lib/overview";
import {
  TIER_HIDDEN_LAB_TABS,
  TIER_HIDDEN_META_TABS,
  type ExperienceTier,
} from "@/lib/experience-tier";

/* ------------------------------------------------------------------ *
 * Supporter
 * ------------------------------------------------------------------ */

/**
 * The price, in one place. `SIGNIN_PRICE_NOTE` in `product.ts` names the same
 * figure for a stranger who has not signed in yet, and `account-copy.test.ts`
 * fails if the two stop matching.
 */
export const SUPPORTER_MONTHLY = "€12 a month";

/**
 * What the panel is called, and what the button says.
 *
 * Not "Upgrade" and not "Pro". An upgrade is a promise of more, and there is
 * no more: the subscription genuinely adds nothing to the app. Calling it one
 * is the single most misleading word on the page, and it sat directly above a
 * paragraph saying so.
 */
export const SUPPORTER_TITLE = "Supporter";

export function supporterButtonLabel(active: boolean): string {
  return active ? "Manage" : "Become a supporter";
}

/** The offer, for somebody who is not paying. One line, no salesmanship. */
export const SUPPORTER_OFFER =
  `${SUPPORTER_MONTHLY}. It adds no features at all, and it is not going to. ` +
  "It pays for the market data, the servers and the time that go into building this.";

/** The one light sentence, at the same weight as the fact above it. */
export const SUPPORTER_ASIDE =
  "You also get the warm feeling of having paid for something you did not have to.";

/**
 * The thank-you, with the two facts the billing route already returns and the
 * page used to throw away.
 *
 * Somebody paying for a product that gives them nothing extra is owed the
 * courtesy of being thanked by name for it, and of being told when the next
 * charge lands without having to open a payment portal to find out.
 */
export function supporterThanks(input: {
  since?: string | null;
  nextCharge?: string | null;
}): string {
  const parts = ["Thank you."];
  if (input.since) parts.push(`You have been a supporter since ${input.since}.`);
  parts.push(
    input.nextCharge
      ? `It is ${SUPPORTER_MONTHLY}, next on ${input.nextCharge}.`
      : `It is ${SUPPORTER_MONTHLY}.`
  );
  return parts.join(" ");
}

/**
 * Right after paying, believe the reader rather than the mirror.
 *
 * `subscriptionStatus` is copied out of Stripe by the webhook, and the webhook
 * has not necessarily landed by the time Stripe sends the reader back to
 * `?upgraded=1`. Read straight, that put a thank-you toast on screen above a
 * card still asking for the money they had just paid. So a return from
 * checkout counts as active for this render, and the page re-asks the billing
 * route a few times before it trusts a "no".
 */
export function supporterIsActive(input: {
  status: string | null;
  justPaid: boolean;
  activeStatuses: readonly string[];
}): boolean {
  if (input.justPaid && input.status === null) return true;
  return !!input.status && input.activeStatuses.includes(input.status);
}

/* ------------------------------------------------------------------ *
 * Experience level
 * ------------------------------------------------------------------ */

/** Does this tier get the Lab room at all? Read from the gate itself. */
export function tierShowsLab(tier: ExperienceTier): boolean {
  return !TIER_HIDDEN_META_TABS[tier].includes(LAB_TAB_ID);
}

/** Does this tier get Lab's Risk tab? Read from the gate itself. */
export function tierShowsRisk(tier: ExperienceTier): boolean {
  return !TIER_HIDDEN_LAB_TABS[tier].includes("risk");
}

/**
 * Whether this tier opens the covered-call panel by default.
 *
 * The one thing the answer still decides, and it reads the same rule
 * `Dashboard` does. A novice gets the panel folded away rather than gone,
 * so nothing is out of reach and the first screen is quieter.
 */
export function tierOpensCoveredCalls(tier: ExperienceTier): boolean {
  return tier !== "novice";
}

/**
 * What picking this answer actually does, in the reader's words.
 *
 * Derived rather than typed, so somebody moving a room between tiers cannot
 * leave this page describing the old arrangement. Home, Pulse, Growth and
 * every portfolio are on every tier, which is worth saying out loud: the
 * sentence a beginner needs is that nothing is being taken away from them.
 *
 * The two hiding branches below are unreachable today and stay anyway. No
 * tier hides a room any more, on the argument in `experience-tier.ts` that
 * Lab is where a beginner finds out three holdings are most of their money,
 * so withholding it from the reader who said they are new was backwards.
 * If anybody ever reintroduces a gate, this sentence follows it rather than
 * going stale, which is the whole reason it is derived.
 *
 * The last line has to say something real, or the page asks a question
 * whose three answers read identically. What is left is the panel default,
 * so it says that.
 */
export function tierChangeLine(tier: ExperienceTier): string {
  if (!tierShowsLab(tier)) {
    return "Home, Pulse, Growth and your portfolios. Lab, the room for digging into what you own, stays out of the way.";
  }
  if (!tierShowsRisk(tier)) {
    return "Everything above, and Lab as well. Its Risk tab, which models a bad week, stays hidden.";
  }
  return tierOpensCoveredCalls(tier)
    ? "Every room, every tab inside Lab, and covered calls open on a portfolio that has them."
    : "Every room, and every tab inside Lab, Risk included. Covered calls start folded away, one tap from open.";
}

/* ------------------------------------------------------------------ *
 * The Sunday email
 * ------------------------------------------------------------------ */

/**
 * When the letter goes out, in UTC, matching the first `sunday-note` entry in
 * `vercel.json`. Sunday is day 0.
 */
export const SUNDAY_LETTER_UTC_DAY = 0;
export const SUNDAY_LETTER_UTC_HOUR = 4;

/**
 * The next Sunday the letter will be written, as an instant.
 *
 * Minted in UTC and formatted on the reader's own clock, the same way the
 * overnight note mints its resume time: the schedule is a fact about the
 * server and the time on screen is a fact about the reader.
 */
export function nextSundayLetter(now: Date): Date {
  const next = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      SUNDAY_LETTER_UTC_HOUR,
      0,
      0,
      0
    )
  );
  while (
    next.getUTCDay() !== SUNDAY_LETTER_UTC_DAY ||
    next.getTime() <= now.getTime()
  ) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  return next;
}

/* ------------------------------------------------------------------ *
 * Deleting the account
 * ------------------------------------------------------------------ */

export type DeletablePortfolio = {
  id: string;
  name: string | null;
  /** How many holdings are in it. */
  holdings: number;
  /** How many people own it, this reader included. */
  owners: number;
};

export type AccountDeletion = {
  /** Portfolios only this reader owns. These go, holdings and all. */
  deletes: { name: string; holdings: number }[];
  /** Portfolios someone else is on too. They keep them. */
  handsOver: string[];
  /** Circles and classes this reader leaves. */
  leaves: string[];
  /** Whether the delete also cancels a subscription in Stripe. */
  cancelsSupporter: boolean;
};

/**
 * What pressing delete would actually do, from the rows the page has.
 *
 * The route deletes a portfolio only this person owns and steps them off any
 * they share, so that is the split here. Getting it from the data rather than
 * from a paragraph means the dialog cannot promise the wrong thing to a
 * reader whose account does not look like the one the paragraph was written
 * about, and it means somebody with one portfolio is not made to read a
 * sentence about co-owners they do not have.
 */
export function describeAccountDeletion(input: {
  portfolios: DeletablePortfolio[];
  circles: string[];
  supporterActive: boolean;
}): AccountDeletion {
  const deletes: { name: string; holdings: number }[] = [];
  const handsOver: string[] = [];
  for (const p of input.portfolios) {
    const name = (p.name ?? "").trim() || "Untitled portfolio";
    if (p.owners > 1) handsOver.push(name);
    else deletes.push({ name, holdings: p.holdings });
  }
  return {
    deletes,
    handsOver,
    leaves: [...input.circles],
    cancelsSupporter: input.supporterActive,
  };
}

/** "6 holdings" / "1 holding" / "nothing in it yet". */
export function holdingCountLabel(count: number): string {
  if (count <= 0) return "nothing in it yet";
  return count === 1 ? "1 holding" : `${count} holdings`;
}

/** "Ada and Ben" out of a list, for a sentence rather than a list. */
export function joinWords(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0]!;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
