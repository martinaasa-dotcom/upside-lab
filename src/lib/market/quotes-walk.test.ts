/**
 * The prediction the unresolved budget is charged from. It has to be exact
 * in both directions: naming a real holding would bill a classroom for
 * ordinary use, and missing an invented symbol would leave the fifty-two
 * call walk unpaid for, which is the hole this whole arrangement closes.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({ known: [] as string[] }));

vi.mock("@/lib/market/quote-store", () => ({
  recallQuotes: async (tickers: string[]) => {
    const out: Record<string, { ticker: string; price: number }> = {};
    for (const t of tickers) {
      if (store.known.includes(t)) out[t] = { ticker: t, price: 1 };
    }
    return out;
  },
  recallFx: async () => null,
  rememberFx: () => {},
  rememberQuotes: () => {},
}));

import { namesThatWouldWalk } from "@/lib/market/quotes";
import {
  markUnresolvable,
  resetUnresolvableForTests,
} from "@/lib/market/unresolvable";

beforeEach(() => {
  store.known = [];
  resetUnresolvableForTests();
});

describe("namesThatWouldWalk", () => {
  it("charges nothing for a portfolio the shared cache already knows", async () => {
    store.known = ["NBIS", "CRWV", "VUAA.DE"];
    expect(await namesThatWouldWalk(["NBIS", "CRWV", "VUAA.DE"])).toEqual([]);
  });

  it("names every symbol no cache can vouch for", async () => {
    store.known = ["NBIS"];
    expect(await namesThatWouldWalk(["NBIS", "ZZQX", "QQZW"])).toEqual([
      "ZZQX",
      "QQZW",
    ]);
  });

  it("charges nothing for a repeat of a name already known to be dead", async () => {
    markUnresolvable(["ZZQX"]);
    expect(await namesThatWouldWalk(["ZZQX"])).toEqual([]);
  });

  it("counts a name once however many times it is asked for", async () => {
    expect(await namesThatWouldWalk(["ZZQX", "zzqx", " ZZQX "])).toEqual(["ZZQX"]);
  });

  it("charges a bare EU name once, then never again", async () => {
    // VWCE is stored bare by EU brokers and quotes as VWCE.DE. The first
    // ask pays for the walk that finds the Xetra listing; the quote store
    // then holds the answer under the spelling the reader asked with, so
    // every later ask is free.
    expect(await namesThatWouldWalk(["VWCE"])).toEqual(["VWCE"]);
    store.known = ["VWCE", "VWCE.DE"];
    expect(await namesThatWouldWalk(["VWCE"])).toEqual([]);
  });

  it("answers an empty ask without touching anything", async () => {
    expect(await namesThatWouldWalk([])).toEqual([]);
  });
});
