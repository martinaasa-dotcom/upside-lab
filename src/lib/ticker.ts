import { coinFromSymbol, isCoinSymbol, matchCoinQuery } from "@/lib/coins";

/**
 * Normalize human/exchange tickers to Yahoo Finance symbols.
 * Keep US tickers bare; attach exchange suffixes for EU listings.
 *
 * Examples: LON:VOD → VOD.L · XETRA:VWCE → VWCE.DE · SAP.DE unchanged
 * LHV1T → LHV1T.TL (Nasdaq Tallinn share class)
 *
 * Bare BTC is not rewritten to BTC-USD here. That mapping is search /
 * resolveTypedTicker / CSV import, so a US-listed Bitcoin fund ticker
 * still quotes if someone picks it.
 */
const PREFIX_TO_SUFFIX: Record<string, string> = {
  LON: ".L",
  LSE: ".L",
  XLON: ".L",
  XETRA: ".DE",
  ETR: ".DE",
  GER: ".DE",
  FRA: ".DE",
  XETR: ".DE",
  AMS: ".AS",
  AS: ".AS",
  PAR: ".PA",
  EPA: ".PA",
  BRU: ".BR",
  SWX: ".SW",
  VIE: ".VI",
  MIL: ".MI",
  MCE: ".MC",
  STO: ".ST",
  CPH: ".CO",
  HEL: ".HE",
  OSL: ".OL",
  TAL: ".TL",
  TLN: ".TL",
  XTAL: ".TL",
  RIG: ".RG",
  XRIG: ".RG",
  VLN: ".VS",
  XLIT: ".VS",
  TYO: ".T",
  TSE: ".T",
  HKG: ".HK",
  TSX: ".TO",
  TOR: ".TO",
  ASX: ".AX",
};

const KNOWN_SUFFIXES = new Set([
  ".L",
  ".DE",
  ".AS",
  ".PA",
  ".BR",
  ".SW",
  ".VI",
  ".MI",
  ".MC",
  ".ST",
  ".CO",
  ".HE",
  ".OL",
  ".TL",
  ".RG",
  ".VS",
  ".T",
  ".HK",
  ".TO",
  ".AX",
]);

/** Common Lightyear / Trade Republic / Xetra codes → Yahoo.
 * Bare names not listed here still get EU suffixes at quote time. */
const BROKER_BARE_TO_YAHOO: Record<string, string> = {
  RHM: "RHM.DE",
  HAG: "HAG.DE",
  VEUR: "VEUR.DE",
  VUAA: "VUAA.DE",
  "2B7K": "2B7K.DE",
  VWCE: "VWCE.DE",
  VWCG: "VWCG.DE",
  IWDA: "IWDA.AS",
  SXR8: "SXR8.DE",
  SPY5: "SPY5.DE",
  SPYL: "SPYL.DE",
  SPY4: "SPY4.DE",
  EUNL: "EUNL.DE",
  EXS1: "EXS1.DE",
  EXW1: "EXW1.DE",
  EXXT: "EXXT.DE",
  IUSQ: "IUSQ.DE",
  IUSN: "IUSN.DE",
  IUS3: "IUS3.DE",
  IS3N: "IS3N.DE",
  IS3R: "IS3R.DE",
  XDWD: "XDWD.DE",
  XD9U: "XD9U.DE",
  SPPW: "SPPW.DE",
  SXRV: "SXRV.DE",
  QDVE: "QDVE.DE",
  QDV5: "QDV5.DE",
  IQQH: "IQQH.DE",
  EUN2: "EUN2.DE",
  CSPX: "CSPX.L",
  VUSA: "VUSA.L",
  LHV: "LHV1T.TL",
  TVEAT: "TVEAT.TL",
};

/** Nasdaq Baltic share classes: 1T Tallinn, 1R Riga, 1L Vilnius. */
const BALTIC_CLASS_SUFFIX: Record<string, string> = {
  T: ".TL",
  R: ".RG",
  L: ".VS",
};

const ISIN_PREFIX_TO_SUFFIX: Record<string, string> = {
  DE: ".DE",
  IE: ".DE",
  NL: ".DE",
  GB: ".L",
  JE: ".L",
  FR: ".PA",
  FI: ".HE",
  SE: ".ST",
  DK: ".CO",
  NO: ".OL",
  CH: ".SW",
  IT: ".MI",
  ES: ".MC",
  BE: ".BR",
  AT: ".VI",
  EE: ".TL",
  LV: ".RG",
  LT: ".VS",
  JP: ".T",
  HK: ".HK",
  CA: ".TO",
  AU: ".AX",
};

const EXCHANGE_HINTS: Record<string, string> = {
  ".L": "London. Price is often in pence.",
  ".DE": "Xetra / Frankfurt",
  ".AS": "Amsterdam",
  ".PA": "Paris",
  ".BR": "Brussels",
  ".SW": "Zurich",
  ".VI": "Vienna",
  ".MI": "Milan",
  ".MC": "Madrid",
  ".ST": "Stockholm",
  ".CO": "Copenhagen",
  ".HE": "Helsinki",
  ".OL": "Oslo",
  ".TL": "Tallinn",
  ".RG": "Riga",
  ".VS": "Vilnius",
  ".T": "Tokyo",
  ".HK": "Hong Kong",
  ".TO": "Toronto",
  ".AX": "Australia",
};

/**
 * Listings to try when a bare ticker is not a US name. US is tried first
 * in yahooQuoteCandidates, so NVDA never spends a call on .DE unless the
 * US quote is empty. Xetra first among the extras (Lightyear / TR ETFs).
 */
export const EU_QUOTE_SUFFIXES = [
  ".DE",
  ".L",
  ".AS",
  ".PA",
  ".HE",
  ".ST",
  ".CO",
  ".OL",
  ".SW",
  ".MI",
  ".MC",
  ".BR",
  ".VI",
  ".TL",
  ".RG",
  ".VS",
] as const;

/** Nasdaq Baltic: LHV1T, TKM1T, GRD1R, TEL1L, … */
export function balticYahooSymbol(stem: string): string | null {
  const m = stem.trim().toUpperCase().match(/^[A-Z]{2,6}1([TRL])$/);
  if (!m) return null;
  const suffix = BALTIC_CLASS_SUFFIX[m[1]];
  return suffix ? `${stem.toUpperCase()}${suffix}` : null;
}

/** Yahoo symbols to try for one typed ticker. US listing first when bare. */
export function yahooQuoteCandidates(raw: string): string[] {
  const normalized = normalizeYahooTicker(raw);
  if (!normalized) return [];
  if (isCoinSymbol(normalized) || normalized.includes(".")) return [normalized];
  const out = [normalized];
  for (const suffix of EU_QUOTE_SUFFIXES) {
    const next = `${normalized}${suffix}`;
    if (!out.includes(next)) out.push(next);
  }
  return out;
}

export function normalizeYahooTicker(raw: string): string {
  let t = raw.trim().toUpperCase().replace(/\s+/g, "");
  if (!t) return t;
  // Broker UI often prefixes €RHM / $GOOGL. Strip every leading mark so
  // $€VUAA does not stay as €VUAA and miss the quote.
  t = t.replace(/^[€$£]+/, "");

  // LON:VOD / XETRA:SAP / TAL:LHV1T
  const prefixed = t.match(/^([A-Z]{2,5})[:\-/]([A-Z0-9.\-]+)$/);
  if (prefixed) {
    const [, exch, sym] = prefixed;
    const suffix = PREFIX_TO_SUFFIX[exch];
    if (suffix) {
      const base = sym.replace(/\.[A-Z]+$/, "");
      return `${base}${suffix}`;
    }
  }

  // Already Yahoo-style with suffix
  const dot = t.lastIndexOf(".");
  if (dot > 0) {
    const suffix = t.slice(dot);
    if (KNOWN_SUFFIXES.has(suffix)) return t;
  }

  // Lightyear and other EU brokers show VUAA / VWCE / LHV1T bare. Yahoo
  // needs the exchange suffix or the quote call comes back empty.
  if (BROKER_BARE_TO_YAHOO[t]) return BROKER_BARE_TO_YAHOO[t];

  const baltic = balticYahooSymbol(t);
  if (baltic) return baltic;

  return t;
}

/** Strip a known exchange suffix so VUAA matches VUAA.DE in search. */
export function tickerStem(ticker: string): string {
  const t = ticker.trim().toUpperCase();
  const coin = coinFromSymbol(t);
  if (coin) return coin.short;
  const dot = t.lastIndexOf(".");
  if (dot > 0 && KNOWN_SUFFIXES.has(t.slice(dot))) return t.slice(0, dot);
  return t;
}

/** After normalize: Yahoo-style symbols only, no HTML or free text. */
export function isPlausibleTicker(ticker: string): boolean {
  return /^[A-Z0-9^=.][A-Z0-9.\-=]{0,23}$/.test(ticker);
}

/**
 * Is this name worth asking a market provider about at all?
 *
 * A name that is not a ticker is the most expensive thing the market layer
 * can be handed, not the cheapest: nothing resolves it, so it walks the
 * bare symbol plus every European exchange suffix at two upstream calls
 * each before anyone learns it was free text. So the shape is checked
 * before a provider is contacted rather than after.
 *
 * The typed spelling counts as well as the stored one. A reader whose
 * holding still reads LON:VOD is asking about a real London listing, and
 * `normalizeYahooTicker` is what turns it into VOD.L on the way out, so a
 * name is quotable when either form is a real symbol shape. Coins
 * (BTC-USD), indexes (^GSPC), currency pairs (EURUSD=X) and futures (ES=F)
 * all pass on the first test.
 */
export function isQuotableTicker(raw: string): boolean {
  const typed = raw.trim().toUpperCase();
  if (!typed) return false;
  // A space inside is free text, and it has to be refused before the
  // normalized form is consulted: `normalizeYahooTicker` strips whitespace,
  // so "HELLO WORLD" comes back as HELLOWORLD, which is a perfectly good
  // symbol shape and a name no provider will ever resolve.
  if (/\s/.test(typed)) return false;
  return isPlausibleTicker(typed) || isPlausibleTicker(normalizeYahooTicker(typed));
}

/**
 * Resolve a broker screenshot ticker (+ optional ISIN) to a Yahoo symbol.
 * Prefer explicit exchange suffixes; else map known EU names; else ISIN country.
 */
export function resolveImportTicker(raw: string, isin?: string | null): string {
  const coin = matchCoinQuery(raw);
  if (coin) return coin.symbol;
  const base = normalizeYahooTicker(raw);
  if (!base) return base;
  if (base.includes(".")) return base;
  if (BROKER_BARE_TO_YAHOO[base]) return BROKER_BARE_TO_YAHOO[base];

  const code = (isin ?? "").trim().toUpperCase();
  if (code.startsWith("US") || code.startsWith("KY")) return base;
  const country = code.slice(0, 2);
  const suffix = ISIN_PREFIX_TO_SUFFIX[country];
  if (suffix) return `${base}${suffix}`;
  return base;
}

export function tickerExchangeHint(ticker: string): string | null {
  const t = ticker.toUpperCase();
  const dot = t.lastIndexOf(".");
  if (dot <= 0) return null;
  return EXCHANGE_HINTS[t.slice(dot)] ?? null;
}
