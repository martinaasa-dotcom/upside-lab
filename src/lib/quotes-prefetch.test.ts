import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  QUOTES_PREFETCH_GLOBAL,
  QUOTES_PREFETCH_KEY,
  QUOTES_PREFETCH_SCRIPT,
  rememberQuotesUrl,
  takeQuotesPrefetch,
} from "@/lib/quotes-prefetch";
import { readFileSync } from "node:fs";

/** A window stub with just what the script and the taker read. */
function stubWindow(stored: string | null, pathname = "/") {
  const store = new Map<string, string>();
  if (stored) store.set(QUOTES_PREFETCH_KEY, stored);
  const fetches: string[] = [];
  const w: Record<string, unknown> = {
    location: { pathname },
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  };
  const fetch = (u: string) => {
    fetches.push(u);
    return Promise.resolve(new Response("{}"));
  };
  return { w, fetches, store, fetch };
}

function runScript(w: Record<string, unknown>, fetch: unknown) {
  // The script is written against the browser globals; give it those.
  new Function("window", "fetch", "Date", QUOTES_PREFETCH_SCRIPT)(w, fetch, Date);
}

describe("the quotes head start", () => {
  const original = globalThis.window;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-24T15:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
    (globalThis as { window?: unknown }).window = original;
  });

  it("is in the head, before the body", () => {
    const layout = readFileSync("src/app/layout.tsx", "utf8");
    const head = layout.indexOf("<head>");
    const body = layout.indexOf("<body");
    const script = layout.indexOf("QUOTES_PREFETCH_SCRIPT", head);
    expect(script).toBeGreaterThan(head);
    expect(script).toBeLessThan(body);
  });

  it("fetches the remembered address and parks the promise", () => {
    const url = "/api/quotes?tickers=AAPL%2CNVDA";
    const { w, fetches, fetch } = stubWindow(url);
    runScript(w, fetch);
    expect(fetches).toEqual([url]);
    const parked = w[QUOTES_PREFETCH_GLOBAL] as { url: string; at: number };
    expect(parked.url).toBe(url);
    expect(parked.at).toBe(Date.now());
  });

  it("refuses any address that is not the quotes route", () => {
    const { w, fetches, fetch } = stubWindow("https://evil.example/x");
    runScript(w, fetch);
    expect(fetches).toEqual([]);
    expect(w[QUOTES_PREFETCH_GLOBAL]).toBeUndefined();
    const other = stubWindow("/api/account/export");
    runScript(other.w, other.fetch);
    expect(other.fetches).toEqual([]);
  });

  it("does nothing with nothing remembered, and survives storage throwing", () => {
    const { w, fetches, fetch } = stubWindow(null);
    runScript(w, fetch);
    expect(fetches).toEqual([]);
    const broken = {
      location: { pathname: "/" },
      localStorage: { getItem: () => { throw new Error("private"); } },
    };
    expect(() => runScript(broken, fetch)).not.toThrow();
  });

  it("stays quiet on pages that never mount a book", () => {
    const url = "/api/quotes?tickers=AAPL";
    for (const path of ["/research/NVDA", "/privacy", "/terms", "/auth/email", "/unsubscribe", "/admin"]) {
      const { w, fetches, fetch } = stubWindow(url, path);
      runScript(w, fetch);
      expect(fetches, path).toEqual([]);
    }
    for (const path of ["/", "/pulse", "/portfolio/retirement", "/growth", "/communities", "/stock/NVDA"]) {
      const { w, fetches, fetch } = stubWindow(url, path);
      runScript(w, fetch);
      expect(fetches, path).toEqual([url]);
    }
  });

  it("is taken once, for exactly the address the book asks for, while young", () => {
    const url = "/api/quotes?tickers=AAPL%2CNVDA";
    const { w, fetch } = stubWindow(url);
    runScript(w, fetch);
    (globalThis as { window?: unknown }).window = w;
    expect(takeQuotesPrefetch("/api/quotes?tickers=AAPL")).toBeNull();
    // The mismatch cleared it: a stale head start is never handed on later.
    runScript(w, fetch);
    const taken = takeQuotesPrefetch(url);
    expect(taken).not.toBeNull();
    expect(takeQuotesPrefetch(url)).toBeNull();
  });

  it("drops a head start older than the view bar", () => {
    const url = "/api/quotes?tickers=AAPL";
    const { w, fetch } = stubWindow(url);
    runScript(w, fetch);
    (globalThis as { window?: unknown }).window = w;
    vi.setSystemTime(Date.now() + 16_000);
    expect(takeQuotesPrefetch(url)).toBeNull();
  });

  it("remembers and forgets the polled address", () => {
    const { w, store } = stubWindow(null);
    (globalThis as { window?: unknown }).window = w;
    rememberQuotesUrl("/api/quotes?tickers=AAPL");
    expect(store.get(QUOTES_PREFETCH_KEY)).toBe("/api/quotes?tickers=AAPL");
    rememberQuotesUrl(null);
    expect(store.has(QUOTES_PREFETCH_KEY)).toBe(false);
  });
});
