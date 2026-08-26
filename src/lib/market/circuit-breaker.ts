/**
 * Per-provider circuit breaker for third-party market data.
 *
 * In-process (same shape as a Redis breaker, no extra infra). Open duration
 * grows exponentially after repeated 429/503s so a rate-limited feed is not
 * hammered. Callers fail over to last-known prices the instant the circuit
 * is open.
 */

export class CircuitOpenError extends Error {
  readonly provider: string;
  constructor(provider: string) {
    super(`${provider} circuit open`);
    this.name = "CircuitOpenError";
    this.provider = provider;
  }
}

export class MarketHttpError extends Error {
  readonly provider: string;
  readonly status: number;
  readonly retryAfterMs: number | null;
  constructor(provider: string, status: number, retryAfterMs: number | null) {
    super(`${provider} HTTP ${status}`);
    this.name = "MarketHttpError";
    this.provider = provider;
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

export function isCircuitOpenError(err: unknown): boolean {
  return err instanceof CircuitOpenError;
}

type CircuitState = "closed" | "open" | "half-open";

type Circuit = {
  state: CircuitState;
  failures: number;
  successes: number;
  openedAt: number;
  openMs: number;
  openCount: number;
};

const FAILURE_THRESHOLD = 3;
const BASE_OPEN_MS = 5_000;
const MAX_OPEN_MS = 5 * 60_000;
const MAX_RETRIES = 2;
const RETRY_BASE_MS = 200;
const MAX_RETRY_SLEEP_MS = 8_000;

const circuits = new Map<string, Circuit>();

function freshCircuit(): Circuit {
  return {
    state: "closed",
    failures: 0,
    successes: 0,
    openedAt: 0,
    openMs: BASE_OPEN_MS,
    openCount: 0,
  };
}

function getCircuit(provider: string): Circuit {
  const existing = circuits.get(provider);
  if (existing) return existing;
  const created = freshCircuit();
  circuits.set(provider, created);
  return created;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractStatus(err: unknown): number | null {
  if (err instanceof MarketHttpError) return err.status;
  if (!err || typeof err !== "object") return null;
  const rec = err as { status?: unknown; statusCode?: unknown };
  if (typeof rec.status === "number") return rec.status;
  if (typeof rec.statusCode === "number") return rec.statusCode;
  return null;
}

function extractRetryAfterMs(err: unknown): number | null {
  if (err instanceof MarketHttpError && err.retryAfterMs != null) {
    return err.retryAfterMs;
  }
  if (!err || typeof err !== "object") return null;
  const rec = err as { retryAfterMs?: unknown; retryAfter?: unknown };
  if (typeof rec.retryAfterMs === "number" && rec.retryAfterMs > 0) {
    return rec.retryAfterMs;
  }
  if (typeof rec.retryAfter === "number" && rec.retryAfter > 0) {
    return rec.retryAfter * 1000;
  }
  return null;
}

function parseRetryAfterHeader(raw: string | null): number | null {
  if (!raw) return null;
  const sec = Number(raw);
  if (Number.isFinite(sec) && sec >= 0) return Math.min(sec * 1000, MAX_RETRY_SLEEP_MS);
  const when = Date.parse(raw);
  if (!Number.isFinite(when)) return null;
  return Math.min(Math.max(0, when - Date.now()), MAX_RETRY_SLEEP_MS);
}

export function isTransientMarketError(err: unknown, status?: number): boolean {
  const code = status ?? extractStatus(err);
  if (
    code === 408 ||
    code === 425 ||
    code === 429 ||
    code === 500 ||
    code === 502 ||
    code === 503 ||
    code === 504
  ) {
    return true;
  }
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /429|503|502|504|too many requests|rate limit|econnreset|etimedout|enotfound|eai_again|fetch failed|socket hang up|und_err|aborted|timeout/i.test(
    msg
  );
}

function retryDelayMs(err: unknown, attempt: number): number {
  const retryAfter = extractRetryAfterMs(err);
  if (retryAfter != null) return retryAfter;
  return Math.min(RETRY_BASE_MS * 2 ** attempt, MAX_RETRY_SLEEP_MS);
}

function recordFailure(provider: string) {
  const c = getCircuit(provider);
  c.failures += 1;
  c.successes = 0;
  if (c.state === "half-open" || c.failures >= FAILURE_THRESHOLD) {
    c.state = "open";
    c.openedAt = Date.now();
    c.openMs = Math.min(BASE_OPEN_MS * 2 ** Math.min(c.openCount, 6), MAX_OPEN_MS);
    c.openCount += 1;
  }
}

function recordSuccess(provider: string) {
  const c = getCircuit(provider);
  if (c.state === "half-open") {
    c.successes += 1;
    c.state = "closed";
    c.failures = 0;
    c.openCount = 0;
    c.openMs = BASE_OPEN_MS;
    c.successes = 0;
    return;
  }
  if (c.state === "closed") {
    c.failures = 0;
  }
}

function armHalfOpenIfDue(provider: string): Circuit {
  const c = getCircuit(provider);
  if (c.state === "open" && Date.now() - c.openedAt >= c.openMs) {
    c.state = "half-open";
    c.successes = 0;
  }
  return c;
}

/** True while the provider is parked and a probe is not yet due. */
export function isMarketCircuitOpen(provider: string): boolean {
  const c = circuits.get(provider);
  if (!c || c.state !== "open") return false;
  return Date.now() - c.openedAt < c.openMs;
}

export async function withMarketCircuit<T>(
  provider: string,
  fn: () => Promise<T>,
  opts?: { retries?: number }
): Promise<T> {
  const c = armHalfOpenIfDue(provider);
  if (c.state === "open") {
    throw new CircuitOpenError(provider);
  }

  const retries = opts?.retries ?? MAX_RETRIES;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await fn();
      recordSuccess(provider);
      return result;
    } catch (err) {
      lastErr = err;
      if (err instanceof CircuitOpenError) throw err;
      const transient = isTransientMarketError(err);
      if (!transient || attempt === retries) {
        recordFailure(provider);
        throw err;
      }
      await sleep(retryDelayMs(err, attempt));
    }
  }
  throw lastErr ?? new Error(`${provider} failed`);
}

/** Hung provider calls must not pin a Fluid isolate. */
export const MARKET_FETCH_TIMEOUT_MS = 15_000;

/** Fetch that trips the breaker on 429/502/503/504 and retries with backoff. */
export async function marketFetch(
  provider: string,
  input: string | URL | Request,
  init?: RequestInit
): Promise<Response> {
  return withMarketCircuit(provider, async () => {
    const timeout = AbortSignal.timeout(MARKET_FETCH_TIMEOUT_MS);
    const signal = init?.signal
      ? AbortSignal.any([init.signal, timeout])
      : timeout;
    const res = await fetch(input, { ...init, signal });
    if (
      res.status === 408 ||
      res.status === 425 ||
      res.status === 429 ||
      res.status === 500 ||
      res.status === 502 ||
      res.status === 503 ||
      res.status === 504
    ) {
      throw new MarketHttpError(
        provider,
        res.status,
        parseRetryAfterHeader(res.headers.get("retry-after"))
      );
    }
    return res;
  });
}

export function resetMarketCircuits() {
  circuits.clear();
}

export function noteMarketFailure(provider: string) {
  recordFailure(provider);
}

export function marketCircuitSnapshot(provider: string): CircuitState {
  return armHalfOpenIfDue(provider).state;
}
