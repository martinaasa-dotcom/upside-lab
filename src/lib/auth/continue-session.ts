import { createHmac, timingSafeEqual } from "node:crypto";

import { safeInternalPath } from "@/lib/site-url";

/*
  The question asked between proving an address and being signed in with it.

  An address that was added to somebody's account opens that account, which is
  the whole point of the feature and also the one place it can go wrong
  quietly: the person at the keyboard proved a mailbox, and the session they
  get belongs to an account they may never have heard of. Nothing on screen
  used to say so. They tapped Continue with Google, and landed in somebody
  else's portfolios with no sentence anywhere naming whose.

  So a sign-in that lands on an account with a different address of its own
  stops and asks. What it stops with is here: what was proved, whose account it
  opens, where the reader was going, and the email sign-in token still to be
  spent when that is the road they came by.

  It travels in a cookie rather than in the page, because a value in a form
  field is a value the page can be made to hand over. It is signed for the
  narrower reason that a cookie is not proof of anything on its own: a
  neighbouring site on a shared parent domain can write one, and an unsigned
  one saying "this opens the account at somebody@else" would be a sign-in
  anybody could hand to anybody.
*/

export const CONTINUE_COOKIE = "ul-continue";

/** Long enough to read the question, short enough that a shared laptop forgets it. */
const CONTINUE_TTL_MS = 10 * 60 * 1000;

export type ContinuePass = {
  /** The address the reader just proved they hold. */
  address: string;
  /** The account it opens, named by the address that account signs in with. */
  primaryEmail: string;
  /** Where they were going before this was asked. */
  next: string;
  /*
    An email sign-in token that has not been spent yet. The email road peeks at
    its token rather than spending it, so that a reader who answers "no" still
    has a working link in their mailbox. Present on that road and absent on the
    Google one, which has nothing left to spend.
  */
  loginToken?: string;
  exp: number;
};

/*
  The service role key, which every road into this file already depends on:
  the account lookups behind the question are service-role only, so a
  deployment without one never reaches the question at all. Nothing is signed
  and nothing is opened when it is missing, because a signature anybody can
  forge is worse than no interstitial.
*/
function secret(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
}

function sign(body: string, key: string): string {
  return createHmac("sha256", key).update(body).digest("base64url");
}

export function sealContinue(
  pass: Omit<ContinuePass, "exp">,
  now: number = Date.now()
): string | null {
  const key = secret();
  if (!key) return null;

  const body = Buffer.from(
    JSON.stringify({ ...pass, exp: now + CONTINUE_TTL_MS }),
    "utf8"
  ).toString("base64url");

  return `${body}.${sign(body, key)}`;
}

export function openContinue(
  raw: string | undefined,
  now: number = Date.now()
): ContinuePass | null {
  const key = secret();
  if (!key || !raw) return null;

  const cut = raw.lastIndexOf(".");
  if (cut < 1) return null;

  const body = raw.slice(0, cut);
  const given = Buffer.from(raw.slice(cut + 1));
  const expected = Buffer.from(sign(body, key));

  if (given.length !== expected.length) return null;
  if (!timingSafeEqual(given, expected)) return null;

  let data: Partial<ContinuePass>;
  try {
    data = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Partial<ContinuePass>;
  } catch {
    return null;
  }

  if (
    typeof data.address !== "string" ||
    typeof data.primaryEmail !== "string" ||
    typeof data.exp !== "number" ||
    data.exp <= now
  ) {
    return null;
  }

  return {
    address: data.address,
    primaryEmail: data.primaryEmail,
    next: safeInternalPath(data.next),
    loginToken: typeof data.loginToken === "string" ? data.loginToken : undefined,
    exp: data.exp,
  };
}

export function continueCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
    maxAge: Math.floor(CONTINUE_TTL_MS / 1000),
  };
}
