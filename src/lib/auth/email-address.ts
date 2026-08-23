/*
  Whether an address can plausibly receive the confirmation we are about to
  send it.

  Adding a second address to an account is one of two places in Upside Lab
  where a person types an address and something is posted to it, and it is the
  only one where the person typing is also the person waiting. A mistyped
  address is not a small problem: nothing arrives, they assume the app is
  broken, and the message hard-bounces at the far end. Enough of those and
  Resend throttles or suspends the account, which takes the Sunday letter down
  for everybody, including the people who typed their address correctly.

  So the rule here is: never send to an address that provably cannot receive,
  and never guess on somebody's behalf. A domain that cannot exist is refused.
  A domain that looks like a slip of the finger is put back to the person as a
  question, with their own spelling still on offer, because "did you mean" is
  help and a silent correction is a lie about where their mail went.

  Everything in this file is pure and free of Node built-ins, so it runs on a
  server, in a test, or in a browser. The DNS half lives next door in
  email-mx.ts, which is server only.

  `normalizeAddress` rather than `normalizeEmail`, which is already taken next
  door in identity.ts and does a plainer job (trim and lowercase). Two
  functions with one name in one codebase is how the wrong one gets imported.
*/

/** The verdict on one typed address. */
export type EmailVerdict =
  /** Nothing wrong with it. Send. */
  | { kind: "ok"; email: string }
  /** Deliverable as written, but one edit from a very common domain. Ask. */
  | { kind: "check"; email: string; suggestion: string }
  /** Cannot receive mail, whatever the person meant. Refuse, and say why. */
  | { kind: "unreachable"; email: string; message: string };

/*
  Domains reserved by the RFCs precisely so that they never resolve: 2606 for
  example/invalid/test/localhost, 6761 for the rest. Every one of these is a
  guaranteed bounce, and they turn up in real address fields constantly,
  because example.com is what a placeholder teaches people to type.
*/
const RESERVED_TLDS = new Set([
  "test",
  "example",
  "invalid",
  "localhost",
  "local",
  "internal",
  "lan",
  "home",
  "corp",
]);

const RESERVED_DOMAINS = new Set([
  "example.com",
  "example.net",
  "example.org",
  "email.tst",
]);

/*
  Mailboxes that exist to send and never to receive. A confirmation posted to
  one of these is either rejected outright or read by nobody, and in both
  cases the person waiting for it is waiting for nothing.
*/
const UNATTENDED_LOCAL_PARTS = new Set([
  "noreply",
  "no-reply",
  "no_reply",
  "donotreply",
  "do-not-reply",
  "do_not_reply",
  "bounce",
  "bounces",
  "mailer-daemon",
]);

/*
  The domains most people actually use, which is also the list a typo is most
  likely to be one edit away from. The Estonian ones are here because Upside
  Lab's first readers are, and a suggestion list that only knows Gmail is no
  help to somebody on hot.ee.
*/
const COMMON_DOMAINS = [
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.uk",
  "ymail.com",
  "hotmail.com",
  "hotmail.co.uk",
  "outlook.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "pm.me",
  "gmx.com",
  "gmx.de",
  "web.de",
  "mail.ru",
  "yandex.ru",
  "zoho.com",
  "fastmail.com",
  "hot.ee",
  "mail.ee",
  "online.ee",
  "upthink.ee",
] as const;

const COMMON_DOMAIN_SET: ReadonlySet<string> = new Set(COMMON_DOMAINS);

/*
  Slips that are two or more edits from the real thing, so the general rule
  below will not catch them. Short, and only for spellings that turn up often
  enough to be worth naming.
*/
const KNOWN_MISSPELLINGS: Readonly<Record<string, string>> = {
  "gmail.com.com": "gmail.com",
  "gmail.co.uk": "gmail.com",
  "gmailc.om": "gmail.com",
  "gmail.ocm": "gmail.com",
  "gmaill.co": "gmail.com",
  "gmial.co": "gmail.com",
  "yahho.com": "yahoo.com",
  "yaoo.com": "yahoo.com",
  "yahoo.co": "yahoo.com",
  "hotmial.co": "hotmail.com",
  "hotmai.co": "hotmail.com",
  "hotmail.co": "hotmail.com",
  "outlok.co": "outlook.com",
  "outllok.com": "outlook.com",
  "iclould.com": "icloud.com",
  "icloud.co": "icloud.com",
  "protonmai.com": "protonmail.com",
};

/*
  A deliberately conservative reading of RFC 5321. Quoted local parts and
  address literals are legal and are refused anyway: no real person types
  `"a b"@[192.0.2.1]` into a form, and every address that looks like it in
  practice is a paste that went wrong.
*/
const LOCAL_PART = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
const DOMAIN_LABEL = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const TLD = /^[a-z]{2,63}$/;

/**
 * Tidies an address the way a person would if they were reading it aloud.
 *
 * Whitespace, an angle-bracketed display form, a `mailto:` prefix and the
 * invisible characters that ride along with a copy from a web page are all
 * things somebody meant to leave out, so removing them is not correcting
 * them. Case is not information in a domain, and no mail system anybody uses
 * treats it as information in a local part either.
 */
export function normalizeAddress(raw: string): string {
  return raw
    // Zero-width and byte-order marks, which paste in invisibly and then
    // fail a syntax check nobody can see the reason for.
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .trim()
    /*
      Brackets before the scheme, because a copy out of a mail client hands
      over `<mailto:you@gmail.com>` and stripping the scheme first leaves the
      brackets holding it in place.
    */
    .replace(/^<([\s\S]*)>$/, "$1")
    .trim()
    .replace(/^mailto:/i, "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .trim()
    .toLowerCase()
    // A trailing dot is a legal fully qualified name and is rejected by
    // enough mail systems to be worth dropping rather than arguing about.
    .replace(/\.$/, "");
}

/** True when one string becomes the other with a single insert, delete, substitution or swap. */
function isOneEditAway(a: string, b: string): boolean {
  if (a === b) return false;

  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  if (longer.length - shorter.length > 1) return false;

  let i = 0;
  while (i < shorter.length && shorter[i] === longer[i]) i++;

  // Same length: either one substitution, or two adjacent characters swapped.
  if (shorter.length === longer.length) {
    const rest = shorter.slice(i + 1) === longer.slice(i + 1);
    if (rest) return true;
    const swapped =
      shorter[i] === longer[i + 1] &&
      shorter[i + 1] === longer[i] &&
      shorter.slice(i + 2) === longer.slice(i + 2);
    return swapped;
  }

  // One longer: the remainder must match once the extra character is skipped.
  return shorter.slice(i) === longer.slice(i + 1);
}

/** The name a domain is known by, without its ending: the "gmail" of gmail.com. */
function stem(domain: string): string {
  const labels = domain.split(".");
  return labels[Math.max(0, labels.length - 2)] ?? domain;
}

/**
 * The common domain a typed one was probably meant to be, if there is exactly
 * one candidate.
 *
 * Exactly one matters. Two candidates means the guess is a coin toss, and a
 * coin toss presented as help is worse than saying nothing.
 */
export function suggestDomain(domain: string): string | undefined {
  if (COMMON_DOMAIN_SET.has(domain)) return undefined;

  const named = KNOWN_MISSPELLINGS[domain];
  if (named) return named;

  const near = COMMON_DOMAINS.filter((candidate) => isOneEditAway(domain, candidate));
  if (near.length !== 1) return undefined;

  const suggestion = near[0]!;

  /*
    A short name is one edit from half the internet. we.com is a real domain
    and is not a mistyped me.com, so a difference inside a stem of three
    characters or fewer is not evidence of anything. A difference in the
    ending, with the name itself intact, is: gmail.con is nobody's domain.
  */
  if (stem(domain) !== stem(suggestion)) {
    if (stem(domain).length < 4 || stem(suggestion).length < 4) return undefined;
  }

  return suggestion;
}

/**
 * Reads a typed address and says whether a confirmation should go to it.
 *
 * Refusals are limited to addresses that cannot work: malformed, reserved by
 * an RFC so as never to resolve, or a send-only mailbox. Anything merely
 * unusual is allowed through, because a rule that keeps out one real person
 * to stop one bounce is a bad trade.
 */
export function readEmail(raw: string): EmailVerdict {
  const email = normalizeAddress(raw);

  const malformed = (message: string): EmailVerdict => ({
    kind: "unreachable",
    email,
    message,
  });

  if (!email) return malformed("Enter the email address you read.");
  if (email.length > 254) return malformed("That address is too long to be a real one.");

  const at = email.lastIndexOf("@");
  if (at < 1 || at === email.length - 1) {
    return malformed("That address needs a name, an @ and a domain, like you@gmail.com.");
  }

  const local = email.slice(0, at);
  const domain = email.slice(at + 1);

  if (local.includes("@")) {
    return malformed("That address has more than one @ in it.");
  }
  if (/\s/.test(email)) {
    return malformed("That address has a space in it. Check for a stray keystroke.");
  }
  if (local.length > 64 || !LOCAL_PART.test(local)) {
    return malformed("The part before the @ is not a name a mailbox can have.");
  }

  if (domain.length > 253) return malformed("That domain is too long to be a real one.");

  const labels = domain.split(".");
  if (labels.length < 2 || !labels.every((label) => DOMAIN_LABEL.test(label))) {
    return malformed("The part after the @ is not a domain, like gmail.com.");
  }

  const tld = labels[labels.length - 1]!;
  if (!TLD.test(tld)) {
    return malformed(`No mail is delivered to .${tld}. Check the end of the address.`);
  }

  if (RESERVED_TLDS.has(tld) || RESERVED_DOMAINS.has(domain)) {
    return {
      kind: "unreachable",
      email,
      message: `${domain} is a reserved name that can never receive mail. Use the address you actually read.`,
    };
  }

  if (UNATTENDED_LOCAL_PARTS.has(local)) {
    return {
      kind: "unreachable",
      email,
      message: "That mailbox only sends, so a confirmation would never reach anybody.",
    };
  }

  const suggestion = suggestDomain(domain);
  if (suggestion) {
    return { kind: "check", email, suggestion: `${local}@${suggestion}` };
  }

  return { kind: "ok", email };
}
