/**
 * Is this state-changing API request coming from our own pages?
 *
 * The session cookies Supabase sets are `SameSite=Lax`, so a browser will
 * not attach them to a cross-site POST, and that is genuinely most of the
 * defence against a forged request. It is also all of it, and it is a
 * default owned by a dependency rather than a rule this app states: a
 * cookie option changed upstream, a route that starts reading a bearer
 * token, or an `Access-Control-Allow-Credentials` added in a hurry each
 * remove it silently. This is the second line, and it is one this app owns.
 *
 * Two headers, in the order they can be trusted.
 *
 * `Sec-Fetch-Site` is set by the browser itself and cannot be written by
 * page script, so when it is there it is the answer. `same-origin` is our
 * own page. `none` is a typed URL or a bookmark. `same-site` and
 * `cross-site` are not, and a mutation from either is refused.
 *
 * `Origin` is the fallback for a browser too old to send the first. Every
 * browser in use sends it on a POST, same-origin or not, so its host is
 * compared against the host the request arrived on.
 *
 * **Neither header present means this is not a browser**, and that case is
 * allowed on purpose. Stripe's webhook posts a signed body with no `Origin`
 * and no `Sec-Fetch-Site`, and so does every other server-to-server caller
 * and every `curl`. Refusing them would break the one payment path that
 * cannot be retried by a person, and it would buy nothing: a request with
 * no browser behind it has no ambient cookie to forge with. Forgery is a
 * browser attack, so a browser is what this checks.
 */
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Host without its port, lowercased, for comparing two of them. */
function hostname(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  const withScheme = trimmed.includes("://") ? trimmed : `https://${trimmed}`;
  try {
    const host = new URL(withScheme).hostname.toLowerCase();
    return host || null;
  } catch {
    return null;
  }
}

export function isMutatingRequest(method: string): boolean {
  return MUTATING.has(method.toUpperCase());
}

/**
 * False only when a browser says out loud that this mutation came from
 * somewhere else. Anything it cannot tell, it allows: this sits behind
 * `SameSite=Lax` and every route's own auth check, and a proxy layer that
 * guesses wrong locks people out of their own accounts.
 */
export function isSameOriginMutation(req: Request): boolean {
  const site = req.headers.get("sec-fetch-site");
  if (site) return site === "same-origin" || site === "none";

  const origin = hostname(req.headers.get("origin"));
  if (!origin) return true;

  const host = hostname(req.headers.get("host"));
  if (!host) return true;
  return origin === host;
}
