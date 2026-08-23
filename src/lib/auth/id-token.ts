/*
  Reading the address out of Google's identity token.

  The signature is not checked here, and that is not an oversight. This token
  is not something a browser handed us: the server fetched it from Google's
  own token endpoint over TLS, in exchange for a single use code bound to the
  state cookie this server set, using a client secret that never leaves the
  server. OpenID Connect says in as many words that a token received directly
  from the token endpoint over a protected channel does not need its signature
  validated, and this is that case exactly. Supabase still verifies the
  signature on its own account a moment later, on the sign-in path where the
  same token is handed to `signInWithIdToken`.

  What is checked is everything that says the token is about this app and is
  still good: who issued it, who it was issued for, whether it has expired,
  and whether Google considers the address itself confirmed. An unconfirmed
  address is refused outright, because the whole point of what happens next is
  that holding this address proves something.

  Pure, so all of that can be tested without a network.
*/

const GOOGLE_ISSUERS = new Set([
  "https://accounts.google.com",
  "accounts.google.com",
]);

export type IdTokenClaims = {
  iss?: string;
  aud?: string;
  exp?: number;
  email?: string;
  email_verified?: boolean | string;
};

/** The middle segment, decoded. Null for anything that is not a JWT payload. */
export function readIdTokenClaims(token: string): IdTokenClaims | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  try {
    const json = Buffer.from(parts[1]!, "base64url").toString("utf8");
    const claims: unknown = JSON.parse(json);
    if (!claims || typeof claims !== "object") return null;
    return claims as IdTokenClaims;
  } catch {
    return null;
  }
}

/**
 * The address this token is about, or null if it is about nothing we can use.
 *
 * Null and a wrong address are the same thing to every caller: neither one
 * gets to say who somebody is.
 */
export function googleEmailFromIdToken(
  token: string,
  clientId: string | undefined,
  now: Date = new Date()
): string | null {
  const claims = readIdTokenClaims(token);
  if (!claims) return null;

  if (!claims.iss || !GOOGLE_ISSUERS.has(claims.iss)) return null;
  if (!clientId || claims.aud !== clientId) return null;

  if (typeof claims.exp !== "number" || claims.exp * 1000 <= now.getTime()) return null;

  // Google sends this as a boolean in the token and as a string in some of
  // its other responses. Both mean the same thing and anything else is a no.
  const verified = claims.email_verified === true || claims.email_verified === "true";
  if (!verified) return null;

  const email = typeof claims.email === "string" ? claims.email.trim().toLowerCase() : "";
  if (!email || !email.includes("@")) return null;

  return email;
}
