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
 * session instead, and the class gets twenty-five buckets rather than one.
 * The cookie value is only ever used as a bucket key, so the hash is a
 * cheap non-cryptographic one and no network call is involved: the point is
 * to tell two people apart, not to authenticate either of them.
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

/** The Supabase session cookie, whichever project ref and chunk it is. */
function sessionCookieValue(req: Request): string | null {
  const raw = req.headers.get("cookie");
  if (!raw) return null;
  const parts: string[] = [];
  for (const piece of raw.split(";")) {
    const eq = piece.indexOf("=");
    if (eq < 1) continue;
    const name = piece.slice(0, eq).trim();
    if (/^sb-.+-auth-token(\.\d+)?$/.test(name)) {
      parts.push(piece.slice(eq + 1).trim());
    }
  }
  if (parts.length === 0) return null;
  // Chunked cookies arrive in an order the browser chooses; sort so the
  // same session always hashes to the same bucket.
  return parts.sort().join("");
}

/**
 * Bucket key for a request: the session when there is one, the IP
 * otherwise. Prefixed so a session bucket and an IP bucket can never
 * collide.
 */
export function clientBucket(req: Request): string {
  const session = sessionCookieValue(req);
  if (session) return `s:${hashToBucket(session)}`;
  return `i:${clientIp(req)}`;
}

const MUTATION = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const TIGHT_PATHS = [
  "/api/auth",
  "/api/account/delete",
  "/api/account/export",
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
  const exportGet = method === "GET" && pathname === "/api/account/export";
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
