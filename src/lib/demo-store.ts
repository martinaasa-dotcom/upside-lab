import type { Holding, Portfolio } from "./types";
import { tracksTradeCash } from "@/lib/cash-balance";
import { tradeCashDelta } from "@/lib/cash-delta";

/** Yahoo-friendly symbols for non-US listings */
function yf(ticker: string) {
  return ticker;
}

function h(
  id: string,
  portfolio_id: string,
  ticker: string,
  shares: number,
  buy_price: number,
  sort_order: number,
  target_call_pct = 0.15,
  stock_target_override: number | null = null
): Holding {
  return {
    id,
    portfolio_id,
    ticker: yf(ticker),
    shares,
    buy_price,
    eoy_target: null,
    target_call_pct,
    stock_target_override,
    sort_order,
  };
}

export const DEMO_PORTFOLIOS: Portfolio[] = [
  {
    id: "p-aasad",
    name: "Aasad",
    slug: "aasad",
    sort_order: 1,
    // From Martin's Aasad sheet — do not invent different cash/holdings
    cash_balance: -7000,
  },
  {
    id: "p-anu",
    name: "Anu",
    slug: "anu",
    sort_order: 2,
    // MAJA FOND $2000 + KÖÖGI FOND $400
    cash_balance: 2400,
  },
  {
    id: "p-maryann",
    name: "MaryAnn",
    slug: "maryann",
    sort_order: 3,
    cash_balance: 0,
  },
  {
    id: "p-karud",
    name: "Karud",
    slug: "karud",
    sort_order: 4,
    cash_balance: 0,
  },
];

/**
 * Canonical holdings so agents do not invent a different Aasad/Anu/MaryAnn/Karud book.
 * These are real people's sheets. They are not a starter pack. Never paint them
 * as a signed-in user's book. Unsigned local mode starts empty; a Save lock
 * on this device (`portfell-locked`) is the only local copy.
 */
export const DEMO_HOLDINGS: Holding[] = [
  // —— Aasad (sheet + confirmed Call % / stock-target baselines) ——
  h("h-aasad-nbis", "p-aasad", "NBIS", 500, 109.96, 1, 0.22, 205),
  h("h-aasad-crwv", "p-aasad", "CRWV", 1100, 83.27, 2, 0.18, 90),
  h("h-aasad-rklb", "p-aasad", "RKLB", 200, 68.65, 3, 0.16, 77),
  h("h-aasad-bmnr", "p-aasad", "BMNR", 1500, 18.2, 4, 0.15, 19.5),
  h("h-aasad-vst", "p-aasad", "VST", 200, 145, 5, 0.07, 145),

  // —— Anu ——
  h("h-anu-crwv", "p-anu", "CRWV", 173, 88.47, 1, 0.15),
  h("h-anu-nbis", "p-anu", "NBIS", 73, 190.3, 2, 0.15),
  h("h-anu-rklb", "p-anu", "RKLB", 105, 75.59, 3, 0.16),
  h("h-anu-rddt", "p-anu", "RDDT", 13, 164.09, 4, 0.15),

  // —— MaryAnn ——
  h("h-maryann-crwv", "p-maryann", "CRWV", 1500, 73.07, 1, 0.15),
  h("h-maryann-nbis", "p-maryann", "NBIS", 800, 194.0, 2, 0.15),
  h("h-maryann-rklb", "p-maryann", "RKLB", 800, 67.83, 3, 0.16),
  h("h-maryann-nvda", "p-maryann", "NVDA", 300, 184.39, 4, 0.12),
  h("h-maryann-vst", "p-maryann", "VST", 700, 145.0, 5, 0.12),
  h("h-maryann-avgo", "p-maryann", "AVGO", 200, 385.22, 6, 0.12),

  // —— Karud (Lightyear + LHV) ——
  h("h-karud-jedi", "p-karud", "JEDI.L", 500, 1.2, 1, 0.15),
  h("h-karud-asml", "p-karud", "ASML.AS", 3, 650, 2, 0.12),
  h("h-karud-rklb", "p-karud", "RKLB", 80, 40, 3, 0.16),
  h("h-karud-bmnr", "p-karud", "BMNR", 200, 25, 4, 0.15),
  h("h-karud-nvda", "p-karud", "NVDA", 10, 130, 5, 0.12),
  h("h-karud-nbis", "p-karud", "NBIS", 70, 55, 6, 0.15),
  h("h-karud-vwce", "p-karud", "VWCE.DE", 50, 120, 7, 0.1),
  h("h-karud-anx", "p-karud", "ANX.PA", 20, 15, 8, 0.12),
  h("h-karud-cspx", "p-karud", "CSPX.L", 15, 500, 9, 0.1),
  h("h-karud-smh", "p-karud", "SMH.L", 40, 40, 10, 0.12),
  h("h-karud-abea", "p-karud", "ABEA.DE", 25, 150, 11, 0.12),
  h("h-karud-ex13", "p-karud", "EX13.VI", 100, 25, 12, 0.1),
  h("h-karud-pwr", "p-karud", "PWR", 15, 280, 13, 0.12),
];

/** Working copy — may change with app versions; locked save wins. */
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
