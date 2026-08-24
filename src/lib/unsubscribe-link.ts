import { createHmac, timingSafeEqual } from "node:crypto";
import { siteUrl } from "@/lib/site-url";

/*
  Turning the Sunday letter off from inside the Sunday letter.

  There was a link and it went to /account, which is behind a sign-in. That is
  an unsubscribe in the sense that the word appears: somebody who no longer
  wants the letter is asked to remember an account they have stopped using,
  sign into it and find the switch. What they press instead is the button that
  says spam, and one of those costs the sending domain more than a hundred
  people quietly turning it off, because it is charged against the domain every
  other message goes out from.

  Gmail and Yahoo have both required one-click unsubscribe of bulk senders
  since 2024, and a weekly letter to every reader is exactly what they mean by
  bulk. The mechanism is small: a header carrying a URL, a second header
  saying a client may POST to it without asking anybody, and an endpoint that
  believes the request because the URL carries proof of who it is for.

  The proof is an HMAC of the profile id. It is not a session and not a
  capability: the only thing it permits is turning that person's letter off,
  which is the one action nobody has ever needed protecting from. There is no
  expiry either, deliberately, because a two year old letter is exactly the one
  somebody is most likely to unsubscribe from and "this link has expired" is a
  failure at the only job it has.
*/

/**
 * The key the signature is made with.
 *
 * Its own variable when there is one and the service role key otherwise, so
 * this works on a deployment nobody has configured for it. Both are server
 * side. With neither there is no signature and no header at all: an unset
 * variable must never be the thing that opens something, and a link anybody
 * could forge would let a stranger stop a stranger's letter.
 */
function secret(): string {
  return (
    process.env.UNSUBSCRIBE_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    ""
  );
}

function sign(profileId: string, key: string): string {
  return createHmac("sha256", key)
    .update(`unsubscribe:${profileId}`)
    .digest("base64url");
}

/** The link that goes in the header and at the foot of the letter. */
export function unsubscribeUrlFor(profileId: string): string | null {
  const key = secret();
  if (!key || !profileId) return null;

  const url = new URL("/api/unsubscribe", siteUrl());
  url.searchParams.set("p", profileId);
  url.searchParams.set("s", sign(profileId, key));
  return url.toString();
}

/**
 * Whose letter a link turns off, or null if it is not one of ours.
 *
 * Compared in constant time, which costs nothing and means a signature
 * checked character by character cannot tell whoever is guessing how much of
 * their guess was right.
 */
export function profileFromUnsubscribe(
  profileId: string | null,
  signature: string | null
): string | null {
  const key = secret();
  if (!key || !profileId || !signature) return null;

  const expected = Buffer.from(sign(profileId, key));
  const given = Buffer.from(signature);

  if (expected.length !== given.length) return null;
  return timingSafeEqual(expected, given) ? profileId : null;
}
