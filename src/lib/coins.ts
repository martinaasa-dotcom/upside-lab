/**
 * Household coins a Lab reader might actually own or watch.
 *
 * This is not a crypto app. Yahoo already prices these pairs (the macro
 * strip has used BTC-USD for a while). Search used to drop CRYPTOCURRENCY
 * on purpose, because typing BTC also hits a US-listed Bitcoin fund, and
 * because Yahoo's coin list is a casino. The catalog is the filter: three
 * chips people have heard of, a few more if they type the name, and the
 * Yahoo pair stored so quotes keep working.
 *
 * Bare BTC stays a stock ticker in normalizeYahooTicker. Mapping to the
 * coin happens in search and in resolveTypedTicker, so the fund is still
 * pickable from the second row.
 */

export type Coin = {
  /** Yahoo CRYPTOCURRENCY symbol, what we store. */
  symbol: string;
  /** English name on chips and in the suggestion list. */
  name: string;
  /** $BTC in the table. Symbol minus the -USD quote. */
  short: string;
  /** What a person types: BTC, BITCOIN, BTCUSD. Uppercase, no spaces. */
  aliases: readonly string[];
};

function coin(
  symbol: string,
  name: string,
  extraAliases: readonly string[] = []
): Coin {
  const short = symbol.replace(/-USD$/, "");
  const aliases = [
    short,
    name.toUpperCase().replace(/[^A-Z0-9]/g, ""),
    `${short}USD`,
    symbol,
    ...extraAliases,
  ];
  return {
    symbol,
    name,
    short,
    aliases: [...new Set(aliases)],
  };
}

/**
 * Bitcoin, Ethereum, Solana on the chips. The rest only appear when
 * someone types the name. No stables, no coins whose Yahoo price sits
 * under the 0.0001 sanity floor (SHIB, PEPE).
 */
export const COINS: readonly Coin[] = [
  coin("BTC-USD", "Bitcoin", ["XBT"]),
  coin("ETH-USD", "Ethereum", ["ETHER"]),
  coin("SOL-USD", "Solana"),
  coin("XRP-USD", "XRP", ["RIPPLE"]),
  coin("BNB-USD", "BNB", ["BINANCE"]),
  coin("DOGE-USD", "Dogecoin"),
  coin("ADA-USD", "Cardano"),
  coin("AVAX-USD", "Avalanche"),
  coin("LINK-USD", "Chainlink"),
  coin("TON-USD", "Toncoin"),
  coin("SUI-USD", "Sui"),
  coin("LTC-USD", "Litecoin"),
];

export const HOUSEHOLD_COINS: readonly Coin[] = COINS.slice(0, 3);

const BY_SYMBOL = new Map(COINS.map((c) => [c.symbol, c]));

function queryKey(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/^[€$£]+/, "")
    .replace(/\s+/g, "");
}

export function coinFromSymbol(ticker: string): Coin | null {
  const t = ticker.trim().toUpperCase();
  return BY_SYMBOL.get(t) ?? null;
}

export function isCoinSymbol(ticker: string): boolean {
  return coinFromSymbol(ticker) != null;
}

/** Exact name, alias, or stored symbol. Prefix matching is search-only. */
export function matchCoinQuery(raw: string): Coin | null {
  const key = queryKey(raw);
  if (!key) return null;
  const named = COINS.find((c) => c.name.toUpperCase() === key);
  if (named) return named;
  return COINS.find((c) => c.aliases.includes(key)) ?? null;
}

export type CoinSuggestion = { symbol: string; name: string };

/** Typeahead hits, including prefixes ("bit" → Bitcoin). */
export function coinSuggestions(
  query: string,
  exclude: ReadonlySet<string> = new Set()
): CoinSuggestion[] {
  const q = query.trim();
  if (!q) return [];
  const key = queryKey(q);
  const lower = q.toLowerCase();
  if (!key) return [];
  const out: CoinSuggestion[] = [];
  for (const c of COINS) {
    if (exclude.has(c.symbol)) continue;
    const aliasHit = c.aliases.some(
      (a) => a === key || (key.length >= 2 && a.startsWith(key))
    );
    const nameHit =
      c.name.toLowerCase() === lower ||
      (lower.length >= 2 && c.name.toLowerCase().startsWith(lower));
    if (!aliasHit && !nameHit) continue;
    out.push({ symbol: c.symbol, name: c.name });
  }
  return out;
}

/**
 * What belongs in a ticker text field. English name for a coin, never
 * the Yahoo pair. Save still stores BTC-USD via resolveTypedTicker.
 */
export function tickerFieldText(storedOrQuery: string): string {
  const found = coinFromSymbol(storedOrQuery) ?? matchCoinQuery(storedOrQuery);
  return found?.name ?? storedOrQuery.trim();
}

/** Coins have no covered-call yield. Heal any leftover 15% on those rows. */
export function callPctForTicker(
  ticker: string,
  requested?: number | null
): number {
  const stored = matchCoinQuery(ticker)?.symbol ?? ticker;
  if (isCoinSymbol(stored)) return 0;
  if (requested == null || !Number.isFinite(Number(requested))) return 0.15;
  return Number(requested);
}
