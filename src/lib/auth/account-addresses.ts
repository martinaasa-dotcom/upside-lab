import { createHash, randomBytes } from "node:crypto";

import { PRODUCT_NAME, PRODUCT_SUPPORT_EMAIL } from "@/lib/product";

/*
  Joining a second address to an account, decided in one place.

  A person has one Upside Lab account, one set of portfolios and one seat in
  every circle they joined, and may want to reach all of it from a work
  address on one day and a personal one the next. Every rule about whether
  that is allowed lives here, apart from the database and apart from Google,
  because the rules are the part worth testing: they are what stands between
  "this is also me" and "this is somebody else's mailbox".

  Nothing in this file talks to the outside world. The caller brings the facts
  it needs and gets a verdict back.
*/

/** How long a mailed confirmation stays good for. */
export const LINK_TOKEN_TTL_MINUTES = 60;

/** At most this many extra addresses on one account. */
export const MAX_LINKED_ADDRESSES = 4;

export type MintedToken = {
  /** Goes in the mail, and is never written down anywhere. */
  token: string;
  /** Goes in the database, and cannot be turned back into the token. */
  hash: string;
  expiresAt: string;
};

/**
 * A confirmation token and the digest that will be stored for it.
 *
 * Hashed for the same reason a password is: the table holding these is read
 * by more things than the one route that checks them, and a token kept in the
 * clear is a token anybody who can read a backup can spend.
 */
export function mintLinkToken(now: Date = new Date()): MintedToken {
  const token = randomBytes(32).toString("base64url");
  return {
    token,
    hash: hashLinkToken(token),
    expiresAt: new Date(
      now.getTime() + LINK_TOKEN_TTL_MINUTES * 60 * 1000
    ).toISOString(),
  };
}

export function hashLinkToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Where the confirmation in the mail points. */
export function linkUrl(origin: string, token: string): string {
  return `${origin}/auth/link?token=${encodeURIComponent(token)}`;
}

/**
 * An address with most of the mailbox taken out.
 *
 * Every page in this feature has to name the account a link would open, or
 * the reader is being asked to agree to something nobody told them. None of
 * those pages is behind a sign-in: a confirmation is read in whatever mailbox
 * it was sent to, and the Google question is read before any session exists.
 * So the sentence names enough for the person it is meant for to recognise
 * their own account, and not enough for anybody else to learn an address.
 *
 * The domain is kept whole on purpose. It is the half somebody recognises,
 * and it is public: it is on every business card and in the MX record.
 */
export function maskAddress(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 1) return "...";

  const local = email.slice(0, at);
  const keep = local.length >= 4 ? 2 : 1;
  return `${local.slice(0, keep)}...${email.slice(at)}`;
}

/*
  What should happen when an account asks for an address.

  "already" is not a failure. Somebody who connects the same Google account
  twice, or types the address they already sign in with, has asked for a state
  the account is in, and telling them off for it helps nobody.

  "adopt" is the one that closes something, and it is deliberately narrow. It
  only comes up when the address already has an Upside Lab account that has
  never been used for anything: no name, no portfolio, no holdings, no circle,
  nothing bought. Somebody who signed in with their second Google account
  once, saw an empty portfolio and closed the tab is the whole of the case it
  exists for.
*/
export type ClaimVerdict =
  | { kind: "ok" }
  | { kind: "adopt"; account: string }
  | { kind: "already" }
  | { kind: "refuse"; code: AddressOutcome };

/*
  Every way asking for an address can end, and the one sentence each of them
  says.

  In one place because two roads arrive at the same outcomes: a form on the
  account screen, which can answer in the page, and a Google handshake, which
  comes back as a redirect and can only carry a word. A word and a sentence
  kept apart would drift, and the sentence somebody reads would depend on
  which button they pressed.
*/
export type AddressOutcome =
  | "linked"
  | "already"
  | "sent"
  | "linked-elsewhere"
  | "has-data"
  | "limit"
  | "no-mail"
  | "slow-down"
  | "signed-out"
  | "not-configured"
  | "failed";

export const ADDRESS_MESSAGES: Record<AddressOutcome, string> = {
  linked: "That address now opens this account.",
  already: "That address already opens this account.",
  sent: "Check that inbox. The link in it lasts one hour.",
  "linked-elsewhere":
    `That address already reaches another ${PRODUCT_NAME} account. Take it off there first.`,
  "has-data":
    `That address already has a ${PRODUCT_NAME} account with things in it. Two accounts that have both been used cannot be joined here. Email ${PRODUCT_SUPPORT_EMAIL}.`,
  limit: `An account holds ${MAX_LINKED_ADDRESSES} extra addresses at most. Take one off to add another.`,
  "no-mail":
    `${PRODUCT_NAME} cannot send mail from this deployment, so an address cannot be confirmed here. Connect it with Google instead.`,
  "slow-down":
    "That address has had a few confirmations sent to it already today. Try again tomorrow.",
  "signed-out":
    "You were signed out before that came back, so nothing was added. Sign in and try again.",
  "not-configured": "Adding an address is not switched on here yet.",
  failed: "We could not do that. Try once more.",
};

/** True for anything `ADDRESS_MESSAGES` has a sentence for. */
export function isAddressOutcome(value: string | null): value is AddressOutcome {
  return value != null && Object.hasOwn(ADDRESS_MESSAGES, value);
}

/** The outcomes that are not a refusal, so the account screen knows the tone. */
const GOOD_OUTCOMES: ReadonlySet<AddressOutcome> = new Set<AddressOutcome>([
  "linked",
  "already",
  "sent",
]);

export function addressOutcomeIsGood(outcome: AddressOutcome): boolean {
  return GOOD_OUTCOMES.has(outcome);
}

export type ClaimFacts = {
  /** The account asking. */
  me: string;
  /** The address being asked for, normalized. */
  email: string;
  /** The address this account already signs in with. */
  primaryEmail: string | null;
  /*
    The account this address is already on, and whether that row is confirmed
    or still waiting for somebody to open a link. The difference matters: a
    row of this account's own that nobody confirmed is a request to send the
    link again, not an address that already works.
  */
  linked: { account: string; verified: boolean } | null;
  /** The account that signs in with this address today, if any. */
  loginAccount: string | null;
  /** Whether that account has ever been used. Only asked about when there is one. */
  neverUsed: boolean;
  /*
    How many other addresses are on this account, not counting the primary and
    not counting this one. Excluding this one is what lets somebody at the
    limit ask for their own confirmation to be sent again.
  */
  linkedCount: number;
};

export function decideClaim(facts: ClaimFacts): ClaimVerdict {
  if (facts.primaryEmail && facts.email === facts.primaryEmail.toLowerCase()) {
    return { kind: "already" };
  }

  if (facts.linked?.account === facts.me) {
    return facts.linked.verified ? { kind: "already" } : { kind: "ok" };
  }

  if (facts.linked) return { kind: "refuse", code: "linked-elsewhere" };

  if (facts.loginAccount && facts.loginAccount !== facts.me) {
    if (!facts.neverUsed) return { kind: "refuse", code: "has-data" };

    /*
      Room is checked after the accounts, so somebody at the limit is told the
      real reason they cannot add this particular address rather than being
      sent away to make space for one that was never going to be allowed.
    */
    if (facts.linkedCount >= MAX_LINKED_ADDRESSES) {
      return { kind: "refuse", code: "limit" };
    }

    return { kind: "adopt", account: facts.loginAccount };
  }

  if (facts.linkedCount >= MAX_LINKED_ADDRESSES) return { kind: "refuse", code: "limit" };

  return { kind: "ok" };
}
