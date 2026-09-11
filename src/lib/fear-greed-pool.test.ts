import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();

/*
  Imported per test rather than at the top, because both this pool and the
  paint cache under it hold module state, and the whole subject here is
  what survives across a reader's session. A shared instance would let one
  test's reading answer the next test's question.
*/
async function freshPool() {
  vi.resetModules();
  return import("@/lib/fear-greed-pool");
}

function stubStorage() {
  const localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  } as unknown as Storage;
  vi.stubGlobal("window", { localStorage } as unknown as Window);
  vi.stubGlobal("localStorage", localStorage);
}

function reading(score: number) {
  return { score, rating: "neutral" };
}

describe("one market-mood reading for the whole browser", () => {
  beforeEach(() => {
    store.clear();
    stubStorage();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("costs one request however many surfaces want it at once", async () => {
    const { ensureFearGreed, pooledFearGreed } = await freshPool();
    /*
      The whole point. Measured on the real app, opening Pulse put three
      requests for one daily figure on the wire in the same millisecond:
      the header strip, Pulse and the Playbook each asked for themselves.
    */
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => reading(45),
    }));
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    await Promise.all([ensureFearGreed(), ensureFearGreed(), ensureFearGreed()]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(pooledFearGreed()?.score).toBe(45);

    /*
      And the time is written down, which is the half that makes the
      freshness rule work at all: a reading saved without one can never
      expire, which is the fault this replaced.
    */
    const paint = JSON.parse(store.get("upside-macro-paint-v1") ?? "{}");
    expect(paint.fearGreed.score).toBe(45);
    expect(typeof paint.fearGreedAt).toBe("number");
    expect(paint.fearGreedAt).toBeGreaterThan(0);
  });

  it("asks for nothing while the reading is recent", async () => {
    const { ensureFearGreed, fearGreedIsFresh } = await freshPool();
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => reading(45) }));
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
    await ensureFearGreed();
    await ensureFearGreed();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fearGreedIsFresh()).toBe(true);
  });

  it("re-asks for a reading restored from a browser that saved no time", async () => {
    /*
      The fault that actually reached a reader. The saved paint carried no
      timestamp, so the header strip's "have I got one?" guard could never
      expire: somebody opening the app in the morning read yesterday's
      mood under a card saying today, until a poll tick came round.
    */
    store.set(
      "upside-macro-paint-v1",
      JSON.stringify({
        macro: { vix: null, eurusd: null, btc: null, tenYear: null },
        fearGreed: reading(12),
      })
    );
    const { ensureFearGreed, fearGreedIsFresh, pooledFearGreed } =
      await freshPool();

    // Shown at once, because a number beats an empty cell.
    expect(pooledFearGreed()?.score).toBe(12);
    // But not trusted.
    expect(fearGreedIsFresh()).toBe(false);

    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => reading(77) }));
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
    await ensureFearGreed();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(pooledFearGreed()?.score).toBe(77);
  });

  it("records nothing from a bad minute", async () => {
    const { ensureFearGreed, fearGreedIsFresh, pooledFearGreed } = await freshPool();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }) as unknown as typeof fetch
    );
    await ensureFearGreed();
    expect(pooledFearGreed()).toBeNull();
    expect(fearGreedIsFresh()).toBe(false);
  });

  it("tells a surface that is only reading when one lands", async () => {
    const { ensureFearGreed, onFearGreed, pooledFearGreed } = await freshPool();
    const seen: number[] = [];
    const off = onFearGreed(() => seen.push(pooledFearGreed()?.score ?? -1));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => reading(60) })) as unknown as typeof fetch
    );
    await ensureFearGreed();
    expect(seen).toEqual([60]);
    off();
  });
});
