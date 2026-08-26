import {
  coinSuggestions,
  isCoinSymbol,
  matchCoinQuery,
} from "@/lib/coins";
import { normalizeYahooTicker, tickerStem } from "@/lib/ticker";

export type TickerSuggestion = {
  symbol: string;
  name: string | null;
};

const WATCH_SYMBOL = /^[A-Z0-9.=^-]{1,12}$/;

/** Bare symbols people type. Mixed case is a company name (Apple, Nvidia). */
export function looksLikeTickerQuery(raw: string): boolean {
  const t = raw.trim().replace(/^[€$£]+/, "");
  if (!t || /\s/.test(t)) return false;
  if (/[a-z]/.test(t) && /[A-Z]/.test(t)) return false;
  return /^[A-Za-z0-9^=.][A-Za-z0-9.\-=:]{0,23}$/.test(t) && t.length <= 12;
}

function nameTokens(name: string): string[] {
  return name
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean);
}

export function scoreTickerSuggestion(
  query: string,
  row: TickerSuggestion
): number {
  const q = query.trim().toUpperCase();
  if (!q) return 0;
  const symbol = row.symbol.trim().toUpperCase();
  const stem = tickerStem(symbol);
  const mapped = looksLikeTickerQuery(query) ? normalizeYahooTicker(query) : "";
  const name = (row.name ?? "").toUpperCase();
  const tokens = nameTokens(row.name ?? "");

  // Coins beat an exact stock ticker of the same letters (BTC the fund)
  // when the person typed the coin's name or alias. The fund stays in
  // the list; it just is not the first Enter.
  if (isCoinSymbol(symbol)) {
    const coin = matchCoinQuery(query);
    if (coin && coin.symbol === symbol) return 104;
    if (stem === q || name === q) return 102;
  }

  if (symbol === q) return 100;
  if (mapped && symbol === mapped) return 98;
  if (stem === q) return 96;
  if (name === q) return 90;
  if (tokens.includes(q)) return 84;
  if (name.startsWith(q) || tokens.some((tok) => tok.startsWith(q))) return 80;
  if (q.length >= 3 && name.includes(q)) return 70;
  if (stem.startsWith(q) || symbol.startsWith(q)) return 60;
  return 10;
}

export function rankTickerSuggestions(
  query: string,
  rows: TickerSuggestion[]
): TickerSuggestion[] {
  return [...rows].sort(
    (a, b) => scoreTickerSuggestion(query, b) - scoreTickerSuggestion(query, a)
  );
}

export function pickTickerSuggestion(
  query: string,
  rows: TickerSuggestion[]
): TickerSuggestion | null {
  if (rows.length === 0) return null;
  return rankTickerSuggestions(query, rows)[0] ?? null;
}

/**
 * What to store for what they typed. Coins first (Bitcoin, BTC → BTC-USD),
 * then a ranked suggestion, then a bare Yahoo symbol. Does not call the
 * network; callers still search if this comes back empty.
 */
export function resolveTypedTicker(
  raw: string,
  suggestions: TickerSuggestion[] = []
): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const coin = matchCoinQuery(trimmed);
  if (coin) return coin.symbol;
  const picked = pickTickerSuggestion(trimmed, suggestions);
  if (picked?.symbol) return normalizeYahooTicker(picked.symbol);
  const prefix = coinSuggestions(trimmed)[0];
  if (prefix) return prefix.symbol;
  if (looksLikeTickerQuery(trimmed)) return normalizeYahooTicker(trimmed);
  return "";
}

/** Popular-list matches while Yahoo is still thinking. */
export function localTickerSuggestions(
  query: string,
  catalog: string[],
  exclude: Set<string>
): TickerSuggestion[] {
  const q = query.trim().toUpperCase();
  if (!q) return [];
  const seen = new Set<string>();
  const out: TickerSuggestion[] = [];

  const push = (symbol: string, name: string | null = null) => {
    const s = symbol.trim().toUpperCase();
    if (!WATCH_SYMBOL.test(s) || exclude.has(s) || seen.has(s)) return;
    seen.add(s);
    out.push({ symbol: s, name });
  };

  for (const row of coinSuggestions(query, exclude)) {
    push(row.symbol, row.name);
  }

  if (looksLikeTickerQuery(query)) {
    const symbol = normalizeYahooTicker(query);
    const raw = query.trim().toUpperCase().replace(/^[€$£]+/, "");
    if (
      symbol.includes(".") ||
      symbol !== raw ||
      catalog.some((t) => t.toUpperCase() === symbol || t.toUpperCase() === raw)
    ) {
      push(symbol);
    }
  }

  for (const t of catalog) {
    if (t === q) push(t);
  }
  for (const t of catalog) {
    if (t.startsWith(q) && t !== q) push(t);
  }
  for (const t of catalog) {
    if (!t.startsWith(q) && t.includes(q)) push(t);
  }
  return out.slice(0, 8);
}

export function mergeTickerSuggestions(
  local: TickerSuggestion[],
  remote: TickerSuggestion[],
  exclude: Set<string>,
  limit = 8
): TickerSuggestion[] {
  const seen = new Set<string>();
  const out: TickerSuggestion[] = [];

  const push = (row: TickerSuggestion) => {
    const symbol = row.symbol.trim().toUpperCase();
    if (!WATCH_SYMBOL.test(symbol) || exclude.has(symbol)) return;
    const existing = out.find((r) => r.symbol === symbol);
    if (existing) {
      if (!existing.name && row.name) existing.name = row.name;
      return;
    }
    if (seen.has(symbol)) return;
    seen.add(symbol);
    out.push({ symbol, name: row.name });
  };

  for (const row of local) push(row);
  for (const row of remote) push(row);
  return out.slice(0, limit);
}

export function mergeAndRankTickerSuggestions(
  query: string,
  local: TickerSuggestion[],
  remote: TickerSuggestion[],
  exclude: Set<string>,
  limit = 8
): TickerSuggestion[] {
  return rankTickerSuggestions(
    query,
    mergeTickerSuggestions(local, remote, exclude, limit * 2)
  ).slice(0, limit);
}
