/**
 * Best-effort in-memory rate limiter for API routes that hit shared,
 * cost-sensitive resources (free-tier LLM quotas, market data providers).
 *
 * This is per-warm-instance, not a distributed limiter — on Vercel a burst
 * spread across multiple cold instances can slip past it. That's an
 * accepted tradeoff for a project with no Redis/KV yet: it still reliably
 * catches the most common real-world abuse pattern (a retry loop or script
 * hammering one endpoint), at zero added infra or cost. Swap for
 * Upstash/Vercel KV if usage ever justifies it.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
let lastSweep = 0;
/** Cap so a unique-key flood cannot grow this Map without bound. */
const MAX_BUCKETS = 10_000;

function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (now >= bucket.resetAt) buckets.delete(key);
  }
}

export type RateLimitResult = {
  ok: boolean;
  /** Seconds until the caller can retry, only set when ok is false. */
  retryAfterSec?: number;
};

/**
 * @param key Unique identifier for the caller + endpoint, e.g. `chat:${userId}`.
 * @param limit Max units allowed within the window.
 * @param windowMs Window length in milliseconds.
 * @param cost How many units this call consumes. Defaults to 1, which is
 *   plain request counting. Pass a real weight when one request can cost
 *   far more than another -- a quote request's true cost is per ticker, not
 *   per request. Pass 0 to peek: report whether the bucket is already over
 *   its limit without consuming anything or creating a bucket.
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  cost = 1
): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const charge = Math.max(0, Math.floor(cost));

  // Peek. Deliberately does not create a bucket, so checking cannot itself
  // fill the Map, and an unknown key always reads as allowed.
  if (charge === 0) {
    const existing = buckets.get(key);
    if (!existing || now >= existing.resetAt || existing.count < limit) {
      return { ok: true };
    }
    return {
      ok: false,
      retryAfterSec: Math.ceil((existing.resetAt - now) / 1000),
    };
  }

  if (buckets.size >= MAX_BUCKETS && !buckets.has(key)) {
    sweep(now);
    if (buckets.size >= MAX_BUCKETS) {
      const first = buckets.keys().next().value;
      if (first !== undefined) buckets.delete(first);
    }
  }

  const bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: charge, resetAt: now + windowMs });
    return { ok: true };
  }
  if (bucket.count >= limit) {
    return { ok: false, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  bucket.count += charge;
  return { ok: true };
}

/**
 * Record that a shared limiter has already refused this key, so this
 * instance stops asking.
 *
 * The durable limiter is the source of truth across instances, but reaching
 * it costs a round trip. When it says no, writing that verdict into local
 * memory means every later request from the same caller to this instance is
 * refused for free until the window expires.
 */
export function markRateLimited(key: string, retryAfterSec: number) {
  const seconds = Math.max(1, Math.ceil(retryAfterSec));
  buckets.set(key, {
    // Above any limit this key could be checked against.
    count: Number.MAX_SAFE_INTEGER,
    resetAt: Date.now() + seconds * 1000,
  });
}

/**
 * Test seam: forget every bucket, as a cold serverless instance would.
 *
 * Exists so a test can simulate a caller landing on an instance that has
 * never seen them -- the case a per-instance limiter cannot handle on its
 * own, and the reason the market budget consults a shared bucket.
 */
export function resetRateLimitForTests() {
  buckets.clear();
  lastSweep = 0;
}

/** Client IP as Vercel sets it. First hop is the platform, so this is trustworthy on Vercel. */
export function clientIp(req: Request): string {
  const vercel = req.headers
    .get("x-vercel-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const real = req.headers.get("x-real-ip")?.trim();
  return vercel || forwarded || real || "unknown";
}

/**
 * Who to charge a request to.
 *
 * The IP is the only thing an anonymous request carries, and it is the
 * wrong unit the moment two people share one. This app has classrooms in
 * it: twenty-five students on one school's network are one IP, and a page
 * load makes two quote requests, so a class opening the app together spent
 * the whole 120 a minute in the first few seconds and every one of them saw
 * "Too many requests". A household behind one router is the same problem
 * with smaller numbers.
 *
 * A signed-in request carries a session cookie, so it can be charged to the
 * account instead, and the class gets twenty-five buckets rather than one.
 * The account is the `sub` of the access token inside that cookie, and it
 * is only ever used as a bucket key, so the hash is a cheap
 * non-cryptographic one and no network call is involved: the point is to
 * tell two people apart, not to authenticate either of them.
 *
 * What the cookie is not allowed to be is a free pass. The bucket used to
 * be keyed on whatever value arrived under a cookie named like the session,
 * and a bucket per value is no limit at all: a scrape loop that sent a new
 * random string each time got a fresh bucket each time and the cap never
 * tripped, on the quote endpoint and on every mutation route. So the cookie
 * has to look like a session before it earns a bucket of its own: the
 * shape `@supabase/ssr` writes, carrying an access token with a subject
 * and an expiry still in the future. Nothing here checks the signature,
 * so this is a shape check and not authentication: it turns "send a
 * different string" into "mint a token", which is the whole of what a
 * bucket key needs, and a random value buckets on the IP with everybody
 * else who sent junk. Verifying the signature would need the project's
 * signing key at the edge and is the door to close if minting ever shows
 * up in the logs.
 *
 * Anonymous requests still fall back to the IP, which is what actually
 * needs the cap: a scrape loop against the unauthenticated quote endpoint
 * has no session to hide behind.
 */
function hashToBucket(value: string): string {
  // FNV-1a, 32 bit. Fast, no allocation, and a bucket key needs nothing more.
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** Base64url, as a JWT and `@supabase/ssr` both write it. Null when it is not. */
function fromBase64Url(value: string): string | null {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) return null;
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  try {
    const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

/**
 * The subject of an access token that is shaped like one and has not
 * expired. Three parts, a JSON payload, a `sub` short enough to be an id
 * and an `exp` in the future; nothing about the signature.
 */
function unexpiredSubject(token: unknown, now: number): string | null {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const json = fromBase64Url(parts[1]);
  if (!json) return null;
  let payload: unknown;
  try {
    payload = JSON.parse(json);
  } catch {
    return null;
  }
  if (!payload || typeof payload !== "object") return null;
  const { sub, exp } = payload as { sub?: unknown; exp?: unknown };
  if (typeof sub !== "string" || sub.length === 0 || sub.length > 128) return null;
  if (typeof exp !== "number" || !Number.isFinite(exp)) return null;
  if (exp * 1000 <= now) return null;
  return sub;
}

/**
 * The account behind a session cookie value, or null when the value is
 * not one. `@supabase/ssr` writes `base64-` and then base64url of the
 * session JSON, whose `access_token` is the JWT; older versions wrote the
 * JSON bare, and a raw token is accepted for the same reason.
 */
function subjectOfSessionValue(value: string, now: number): string | null {
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return null;
  }
  if (decoded.startsWith("base64-")) {
    const json = fromBase64Url(decoded.slice("base64-".length));
    if (!json) return null;
    decoded = json;
  }
  if (decoded.startsWith("{")) {
    try {
      const session = JSON.parse(decoded) as { access_token?: unknown };
      return unexpiredSubject(session?.access_token, now);
    } catch {
      return null;
    }
  }
  return unexpiredSubject(decoded, now);
}

const SESSION_COOKIE = /^(sb-.+-auth-token)(?:\.(\d+))?$/;

/**
 * The account a request's session cookie belongs to, whichever project ref
 * it carries and however many chunks the browser split it into. Chunks
 * arrive in an order the browser chooses, so they are put back in the
 * order they were written before the value is read.
 */
function sessionSubject(req: Request): string | null {
  const raw = req.headers.get("cookie");
  if (!raw) return null;
  const whole = new Map<string, string>();
  const chunks = new Map<string, { index: number; value: string }[]>();
  for (const piece of raw.split(";")) {
    const eq = piece.indexOf("=");
    if (eq < 1) continue;
    const match = SESSION_COOKIE.exec(piece.slice(0, eq).trim());
    if (!match) continue;
    const value = piece.slice(eq + 1).trim();
    if (match[2] === undefined) {
      whole.set(match[1], value);
    } else {
      const list = chunks.get(match[1]) ?? [];
      list.push({ index: Number(match[2]), value });
      chunks.set(match[1], list);
    }
  }
  const now = Date.now();
  for (const value of whole.values()) {
    const sub = subjectOfSessionValue(value, now);
    if (sub) return sub;
  }
  for (const list of chunks.values()) {
    const joined = list
      .sort((a, b) => a.index - b.index)
      .map((c) => c.value)
      .join("");
    const sub = subjectOfSessionValue(joined, now);
    if (sub) return sub;
  }
  return null;
}

/**
 * Bucket key for a request: the account when a session cookie names one,
 * the IP otherwise. Prefixed so a session bucket and an IP bucket can never
 * collide.
 */
export function clientBucket(req: Request): string {
  const subject = sessionSubject(req);
  if (subject) return `s:${hashToBucket(subject)}`;
  return `i:${clientIp(req)}`;
}

const MUTATION = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const TIGHT_PATHS = [
  "/api/auth",
  "/api/account/delete",
  "/api/account/export",
  "/api/user/export",
  "/api/communities/join",
  "/api/portfolios/join",
  "/api/demo/lock",
  "/api/internal/log-error",
  "/api/internal/telemetry",
];

function normalizeApiPath(pathname: string): string {
  return pathname.replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi,
    ":id"
  );
}

function isTightPath(pathname: string): boolean {
  return TIGHT_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Route-level cap for auth and mutation APIs. Returns null when the
 * request is not in scope (GET reads, cron). Callers still keep tighter
 * per-user limits on LLM endpoints.
 */
export function limitMutationRequest(req: Request): RateLimitResult | null {
  const method = req.method.toUpperCase();
  let pathname = "/";
  try {
    pathname = new URL(req.url).pathname;
  } catch {
    return null;
  }
  if (pathname.startsWith("/api/cron/")) return null;

  const joinPeek = method === "GET" && pathname === "/api/communities/join";
  const exportGet =
    method === "GET" &&
    (pathname === "/api/account/export" || pathname === "/api/user/export");
  if (!MUTATION.has(method) && !joinPeek && !exportGet) return null;

  const tight = joinPeek || exportGet || isTightPath(pathname);
  return checkRateLimit(
    `api:${method}:${normalizeApiPath(pathname)}:${clientBucket(req)}`,
    tight ? 20 : 120,
    60_000
  );
}

function isPublicMarketPath(pathname: string): boolean {
  return pathname === "/api/quotes" || pathname.startsWith("/api/market/");
}

/**
 * GET quote and ticker-search endpoints are unauthenticated. Capped per
 * caller so a scrape loop cannot burn the Yahoo/Twelve Data fallbacks. See
 * `clientBucket`: a signed-in reader is charged to their session, an
 * anonymous one to their IP, so a classroom on one network is twenty-five
 * callers rather than one. Memory only; the CDN still absorbs repeats of
 * the same URL.
 */
export function limitPublicMarketRequest(req: Request): RateLimitResult | null {
  const method = req.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") return null;
  let pathname = "/";
  try {
    pathname = new URL(req.url).pathname;
  } catch {
    return null;
  }
  if (!isPublicMarketPath(pathname)) return null;
  return checkRateLimit(`mkt:${clientBucket(req)}`, 120, 60_000);
}

export function rateLimitJson(
  limit: RateLimitResult,
  error: string
): Response {
  return Response.json(
    { error },
    {
      status: 429,
      headers: { "Retry-After": String(limit.retryAfterSec ?? 60) },
    }
  );
}
