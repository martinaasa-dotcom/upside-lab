import type { Holding, Portfolio } from "./types";
import { tracksTradeCash } from "@/lib/cash-balance";
import { tradeCashDelta } from "@/lib/cash-delta";

/*
  There is no seed in this file, and that is deliberate.

  It used to carry four real people's portfolios: their names, the
  companies they hold, how many shares and what they paid. Nothing read
  them (an invariant asserts the portfolios route does not), the local
  store starts empty either way, and the repository is public, so the only
  thing they did was publish somebody's holdings to anybody who looked.

  The rule they existed to serve still stands and is in AGENTS.md: never
  invent holdings for Martin's own portfolios. It is served by asking him
  rather than by keeping the answer here.
*/

/** Working copy. May change with app versions; a locked save wins. */
const STORAGE_KEY = "portfell-demo-v8";

/**
 * User Save lock. Never cleared by version bumps or Reset.
 * Agents must not delete this key.
 */
export const LOCKED_STORAGE_KEY = "portfell-locked";

export type DemoStore = {
  portfolios: Portfolio[];
  holdings: Holding[];
};

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeStore(parsed: DemoStore): DemoStore {
  return {
    portfolios: parsed.portfolios ?? [],
    holdings: (parsed.holdings ?? []).map((row) => ({
      ...row,
      stock_target_override:
        row.stock_target_override === undefined
          ? null
          : row.stock_target_override,
    })),
  };
}

function defaultStore(): DemoStore {
  return { portfolios: [], holdings: [] };
}

function readJson(key: string): DemoStore | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return normalizeStore(JSON.parse(raw) as DemoStore);
  } catch {
    return null;
  }
}

export function hasLockedSave(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(localStorage.getItem(LOCKED_STORAGE_KEY));
}

export function loadDemoStore(): DemoStore {
  if (typeof window === "undefined") return defaultStore();
  // Working copy always wins — otherwise each edit reloads from Save lock and
  // wipes the previous field change.
  const working = readJson(STORAGE_KEY);
  if (working?.portfolios?.length) return working;

  const locked = readJson(LOCKED_STORAGE_KEY);
  if (locked?.portfolios?.length) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(locked));
    return locked;
  }
  return defaultStore();
}

export function saveDemoStore(store: DemoStore) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

/** Lock current portfolios/holdings so version bumps & Reset cannot wipe them. */
export function lockDemoStore(store: DemoStore): DemoStore {
  if (typeof window === "undefined") return store;
  const snapshot = normalizeStore(structuredClone(store));
  localStorage.setItem(LOCKED_STORAGE_KEY, JSON.stringify(snapshot));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  return snapshot;
}

function applyDemoCash(
  store: DemoStore,
  portfolioId: string,
  delta: number
): DemoStore {
  if (!Number.isFinite(delta) || delta === 0) return store;
  const sheet = store.portfolios.find((p) => p.id === portfolioId);
  if (!sheet || !tracksTradeCash(sheet)) return store;
  return {
    ...store,
    portfolios: store.portfolios.map((p) =>
      p.id === portfolioId
        ? { ...p, cash_balance: p.cash_balance + delta }
        : p
    ),
  };
}

export function upsertHolding(
  store: DemoStore,
  input: Omit<Holding, "id"> & { id?: string }
): DemoStore {
  const holdings = [...store.holdings];
  const ticker = input.ticker.toUpperCase();
  const idx = input.id
    ? holdings.findIndex((row) => row.id === input.id)
    : holdings.findIndex(
        (row) =>
          row.portfolio_id === input.portfolio_id &&
          row.ticker.toUpperCase() === ticker
      );
  const prev = idx >= 0 ? holdings[idx] : undefined;
  if (idx >= 0 && prev) {
    holdings[idx] = { ...prev, ...input, id: prev.id, ticker };
  } else {
    holdings.push({
      ...input,
      id: uid("h"),
      ticker,
      stock_target_override: input.stock_target_override ?? null,
    });
  }
  let delta = 0;
  if (!prev) {
    delta = tradeCashDelta({
      buyShares: input.shares,
      buyPrice: input.buy_price,
    });
  } else if (input.shares > prev.shares) {
    delta = tradeCashDelta({
      buyShares: input.shares - prev.shares,
      buyPrice: input.buy_price,
    });
  } else if (input.shares < prev.shares) {
    delta = tradeCashDelta({
      sellShares: prev.shares - input.shares,
      sellPrice: prev.buy_price,
    });
  }
  const next = applyDemoCash({ ...store, holdings }, input.portfolio_id, delta);
  saveDemoStore(next);
  return next;
}

export function deleteHolding(store: DemoStore, id: string): DemoStore {
  const removed = store.holdings.find((row) => row.id === id);
  let next: DemoStore = {
    ...store,
    holdings: store.holdings.filter((row) => row.id !== id),
  };
  if (removed) {
    next = applyDemoCash(
      next,
      removed.portfolio_id,
      tradeCashDelta({
        sellShares: removed.shares,
        sellPrice: removed.buy_price,
      })
    );
  }
  saveDemoStore(next);
  return next;
}

export function updateCash(
  store: DemoStore,
  portfolioId: string,
  cash: number
): DemoStore {
  const next = {
    ...store,
    portfolios: store.portfolios.map((p) =>
      p.id === portfolioId ? { ...p, cash_balance: cash } : p
    ),
  };
  saveDemoStore(next);
  return next;
}

function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "sheet"
  );
}

export function addPortfolio(store: DemoStore, name: string): DemoStore {
  let slug = slugify(name);
  const existing = new Set(store.portfolios.map((p) => p.slug));
  if (existing.has(slug)) {
    let i = 2;
    while (existing.has(`${slug}-${i}`)) i += 1;
    slug = `${slug}-${i}`;
  }
  const portfolio: Portfolio = {
    id: uid("p"),
    name: name.trim(),
    slug,
    sort_order: store.portfolios.length + 1,
    cash_balance: 0,
  };
  const next = {
    ...store,
    portfolios: [...store.portfolios, portfolio],
  };
  saveDemoStore(next);
  return next;
}

export function renamePortfolio(
  store: DemoStore,
  id: string,
  name: string
): DemoStore {
  const next = {
    ...store,
    portfolios: store.portfolios.map((p) =>
      p.id === id ? { ...p, name: name.trim() } : p
    ),
  };
  saveDemoStore(next);
  return next;
}

export function deletePortfolio(store: DemoStore, id: string): DemoStore {
  const next = {
    portfolios: store.portfolios.filter((p) => p.id !== id),
    holdings: store.holdings.filter((row) => row.portfolio_id !== id),
  };
  saveDemoStore(next);
  return next;
}

export function patchHolding(
  store: DemoStore,
  id: string,
  patch: Partial<
    Pick<
      Holding,
      | "shares"
      | "buy_price"
      | "target_call_pct"
      | "eoy_target"
      | "stock_target_override"
    >
  >
): DemoStore {
  const prev = store.holdings.find((row) => row.id === id);
  const holdings = store.holdings.map((row) =>
    row.id === id ? { ...row, ...patch } : row
  );
  let next: DemoStore = { ...store, holdings };
  if (prev && patch.shares != null && patch.shares !== prev.shares) {
    const buyPrice = patch.buy_price ?? prev.buy_price;
    let delta = 0;
    if (patch.shares > prev.shares) {
      delta = tradeCashDelta({
        buyShares: patch.shares - prev.shares,
        buyPrice,
      });
    } else {
      delta = tradeCashDelta({
        sellShares: prev.shares - patch.shares,
        sellPrice: prev.buy_price,
      });
    }
    next = applyDemoCash(next, prev.portfolio_id, delta);
  }
  saveDemoStore(next);
  return next;
}

/** Restore from locked Save if present; otherwise factory seed. Never clears the lock. */
export function resetDemoStore(): DemoStore {
  if (typeof window !== "undefined") {
    const locked = readJson(LOCKED_STORAGE_KEY);
    if (locked?.portfolios?.length) {
      saveDemoStore(locked);
      return locked;
    }
  }
  const next = defaultStore();
  saveDemoStore(next);
  return next;
}
