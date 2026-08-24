/**
 * Bounded fan-out for provider calls.
 *
 * `Promise.all(tickers.map(fetch))` starts every request in the same tick,
 * which defeats the circuit breaker: `isMarketCircuitOpen` is read by all
 * of them before any of them has come back, so a provider that is already
 * answering 429 gets the whole batch anyway. Measured on the Finnhub path,
 * one request for 120 unpriceable names opened 120 sockets and made 360
 * upstream calls (the breaker's own retries tripling it) without a single
 * call being skipped.
 *
 * A worker pool fixes the shape rather than the size. Work is handed out
 * as slots free, so the first wave's failures are recorded before the
 * second wave asks, and `fn` can short-circuit the rest. The same 120 name
 * request measures 6 sockets and 24 upstream calls after this, because the
 * breaker opens on the first wave and every name behind it is skipped.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const width = Math.max(1, Math.min(Math.floor(limit), items.length));
  if (items.length === 0) return [];

  const out = new Array<R>(items.length);
  let next = 0;

  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  }

  await Promise.all(Array.from({ length: width }, () => worker()));
  return out;
}
