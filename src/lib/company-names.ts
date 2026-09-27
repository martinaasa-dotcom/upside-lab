/**
 * The name people use for a company, where this app can be sure of it.
 *
 * The Sunday letter is written for somebody who has never worked in
 * finance, and "$NVDA" means nothing to them where "Nvidia" does. The
 * model knows most of these names and was still measured writing the
 * ticker, and the fallback that writes the letter when no model answers
 * knew none of them, so it printed cashtags every week.
 *
 * This is a list of names, not of opinions: every company in the public
 * research universe (`research/universe.ts`) plus a few that commonly sit
 * beside them in a first portfolio. A name is only here when there is one
 * obvious answer. Funds are deliberately absent: a fund is described by
 * what it holds (`describeCompany`), never by a brand, because "Vanguard"
 * says nothing about whether it is the whole market or one corner of it.
 * A ticker not on the list returns null, and callers keep the cashtag,
 * because a wrong name is worse than a ticker.
 */
const NAMES: Readonly<Record<string, string>> = {
  AAPL: "Apple",
  ABBV: "AbbVie",
  ABNB: "Airbnb",
  ADBE: "Adobe",
  AMAT: "Applied Materials",
  AMD: "AMD",
  AMGN: "Amgen",
  AMZN: "Amazon",
  ANET: "Arista Networks",
  APP: "AppLovin",
  ARM: "Arm",
  ASML: "ASML",
  ASTS: "AST SpaceMobile",
  AVGO: "Broadcom",
  AXP: "American Express",
  BA: "Boeing",
  BAC: "Bank of America",
  BE: "Bloom Energy",
  "BRK-B": "Berkshire Hathaway",
  CAT: "Caterpillar",
  CEG: "Constellation Energy",
  CMCSA: "Comcast",
  CMG: "Chipotle",
  COIN: "Coinbase",
  COP: "ConocoPhillips",
  COST: "Costco",
  CRM: "Salesforce",
  CRWV: "CoreWeave",
  CVX: "Chevron",
  DE: "John Deere",
  DIS: "Disney",
  F: "Ford",
  FCX: "Freeport-McMoRan",
  GE: "GE Aerospace",
  GM: "General Motors",
  GOOG: "Google",
  GOOGL: "Google",
  GS: "Goldman Sachs",
  HD: "Home Depot",
  HON: "Honeywell",
  HOOD: "Robinhood",
  INTC: "Intel",
  IONQ: "IonQ",
  ISRG: "Intuitive Surgical",
  JNJ: "Johnson & Johnson",
  JPM: "JPMorgan",
  KO: "Coca-Cola",
  LIN: "Linde",
  LLY: "Eli Lilly",
  LMT: "Lockheed Martin",
  LRCX: "Lam Research",
  LULU: "Lululemon",
  MA: "Mastercard",
  MCD: "McDonald's",
  META: "Meta",
  MRK: "Merck",
  MRNA: "Moderna",
  MRVL: "Marvell",
  MS: "Morgan Stanley",
  MSFT: "Microsoft",
  MU: "Micron",
  NBIS: "Nebius",
  NEE: "NextEra Energy",
  NET: "Cloudflare",
  NFLX: "Netflix",
  NKE: "Nike",
  NOW: "ServiceNow",
  NVDA: "Nvidia",
  NVO: "Novo Nordisk",
  OKLO: "Oklo",
  ORCL: "Oracle",
  OXY: "Occidental",
  PEP: "PepsiCo",
  PFE: "Pfizer",
  PG: "Procter & Gamble",
  PLTR: "Palantir",
  PYPL: "PayPal",
  QCOM: "Qualcomm",
  RBLX: "Roblox",
  RDDT: "Reddit",
  RIVN: "Rivian",
  RKLB: "Rocket Lab",
  RTX: "RTX",
  SBUX: "Starbucks",
  SCHW: "Charles Schwab",
  SHOP: "Shopify",
  SLB: "SLB",
  SNOW: "Snowflake",
  SOFI: "SoFi",
  SPOT: "Spotify",
  T: "AT&T",
  TGT: "Target",
  TMO: "Thermo Fisher",
  TSLA: "Tesla",
  TSM: "TSMC",
  TXN: "Texas Instruments",
  UBER: "Uber",
  UNH: "UnitedHealth",
  UPS: "UPS",
  V: "Visa",
  VST: "Vistra",
  VZ: "Verizon",
  WBD: "Warner Bros. Discovery",
  WFC: "Wells Fargo",
  WMT: "Walmart",
  XOM: "ExxonMobil",
};

/** The everyday name for a ticker, or null when this app is not sure of one. */
export function companyName(ticker: string): string | null {
  const key = ticker.trim().toUpperCase().replace(/^\$/, "").replace(".", "-");
  return NAMES[key] ?? null;
}

/**
 * Every everyday name this table knows, with the tickers that carry it.
 *
 * The Sunday letter checks its finished text against this so that a
 * company it names is provably one the reader owns or watches: a name
 * found in the text whose tickers are none of the reader's is a letter
 * that is not sent as written.
 */
export function knownCompanyNames(): { name: string; tickers: string[] }[] {
  const byName = new Map<string, string[]>();
  for (const [ticker, name] of Object.entries(NAMES)) {
    byName.set(name, [...(byName.get(name) ?? []), ticker.replace("-", ".")].concat(ticker));
  }
  return [...byName.entries()].map(([name, tickers]) => ({ name, tickers: [...new Set(tickers)] }));
}
