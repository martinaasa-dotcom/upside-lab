/**
 * Upside Lab's own growth view: what kind of business a holding is, and how
 * fast this app assumes it compounds.
 *
 * ## This is a house view, on purpose, and it is the one in the product
 *
 * For most of this app's life the rule over `forecast-conviction.ts` was
 * that nothing here may carry an opinion about where a price goes: the
 * per-ticker baselines were deleted, the named strategist was taken out of
 * the persona, and `liftPathToThemeMagnitude` was removed on 2026-08-28 so
 * that the model's own number reached the reader untouched. The argument
 * was that a stance compiled into code reaches every reader, including one
 * whose whole portfolio is an index fund.
 *
 * Martin reversed that on 2026-09-14, twice and in writing, after the
 * argument was put to him. Two things drove it and both are worth keeping
 * in front of whoever reads this next.
 *
 * **A model with no anchor is not neutral, it is random.** Left to answer
 * freely, a small free-tier model asked for a five year path emits round,
 * timid, and above all *different* numbers every run: the same company came
 * back at $300 one day and over $1,000 another, with nothing about the
 * company having changed in between. A reader cannot plan against that, and
 * cannot tell the difference between a revision and a re-roll. Refusing to
 * hold a view did not remove the view, it delegated it to whichever model
 * answered and to the temperature it answered at.
 *
 * **So the view is written down instead, per name, where it can be argued
 * with.** Every rate below is one number, with one sentence saying why and
 * the date a person last checked it. It is deterministic: the same ticker
 * at the same price gives the same path today, tomorrow and on the next
 * deploy. That is the property Martin actually asked for, and it is the one
 * the old design could not provide at any level of bullishness.
 *
 * ## The rules that did not change
 *
 * - **Nothing here is hidden.** `forecastPathProvenance` names this file,
 *   the rate, the basis, the sentence and the date, and says outright that
 *   a person here chose it. The old failure was never that a number was
 *   optimistic, it was that a number the app computed was presented as the
 *   model's reasoning. A house view a reader can see and disagree with is
 *   the honest form of this; a house view wearing a model's voice is not.
 * - **It is not a target and not advice.** `ADVICE_DISCLAIMER_SHORT` still
 *   sits under every surface that draws one of these paths.
 * - **The ladder is allowed to point down.** `INTC` and `PFE` below sit
 *   under the market on purpose. A table where every entry beats the index
 *   is a cheerleader rather than a model, and the first thing to check when
 *   adding an entry is whether you would write a number under 10 here for
 *   anybody.
 *
 * ## How to change a number
 *
 * Edit the rate, rewrite `because` so it still says why, and move
 * `validated` to today. `forecast-growth.test.ts` fails on an entry whose
 * sentence is missing, whose date is stale beyond a year, or whose rate is
 * outside the sanity band, so an edit cannot be a silent one.
 */

import { isCoinSymbol } from "@/lib/coins";
import { FORECAST_YEARS } from "@/lib/forecast";

export type ForecastTheme =
  | "ai_infra"
  | "ai_power"
  | "crypto"
  | "space"
  | "semi"
  | "fintech"
  | "software"
  | "healthcare"
  | "drones"
  | "index"
  | "other";

/**
 * How many compounding steps a path covers. One per forecast year.
 *
 * A function rather than a top-level const, and that is load bearing.
 * `forecast.ts` imports this module's classifier and this module imports
 * its years, which is a cycle: when `forecast.ts` is the entry point its
 * imports evaluate before its own body, so `FORECAST_YEARS` is still in
 * its temporal dead zone while this module's top level runs. Reading it
 * inside a function defers that to first call, by which time both
 * modules are finished. `forecast-conviction.ts` has always avoided the
 * same trap by keeping its table a literal.
 */
export function growthYears(): number {
  return FORECAST_YEARS.length;
}

/**
 * The widest rate this app will hold a view at, either way.
 *
 * The ceiling is not modesty, it is arithmetic: past about 45% a year a
 * five year path implies a multiple that no company of any size has
 * sustained over a full cycle, and a number nobody can defend costs the
 * credibility of every honest figure beside it. The floor allows a real
 * decline, because a table that cannot express one is not a model.
 */
export const MAX_CAGR = 0.45;
export const MIN_CAGR = -0.15;

export type GrowthEntry = {
  /** Compound annual rate, as a fraction. 0.29 is 29% a year. */
  cagr: number;
  /** One sentence a reader could argue with. Never a slogan. */
  because: string;
  /** ISO date a person last checked this entry. */
  validated: string;
};

/**
 * The sector ladder: what this app assumes a kind of business compounds at
 * when it holds no view on the individual name.
 *
 * `index` and `other` sit at the market's own long run rate, and `other`
 * matches `index` deliberately: the honest assumption about a company this
 * app cannot even classify is that it does what the market does. Everything
 * above them is a risk premium this app is choosing to take a view on.
 */
export const SECTOR_GROWTH: Record<ForecastTheme, GrowthEntry> = {
  ai_infra: {
    cagr: 0.37,
    because:
      "Renting out computing power for AI, where demand is contracted years ahead of the capacity being built and the buyers are the largest companies in the world.",
    validated: "2026-09-14",
  },
  crypto: {
    cagr: 0.32,
    because:
      "Priced off the coins themselves, which move further and faster than shares in both directions, so the rate is high and the path below it is the jumpiest in the table.",
    validated: "2026-09-14",
  },
  semi: {
    cagr: 0.29,
    because:
      "The chips every part of the AI build has to buy, with a handful of companies able to make them and order books running years long.",
    validated: "2026-09-14",
  },
  ai_power: {
    cagr: 0.27,
    because:
      "Electricity and grid equipment for the datacenters, which is a real shortage with long lead times, priced as an industrial business rather than a technology one.",
    validated: "2026-09-14",
  },
  space: {
    cagr: 0.25,
    because:
      "Launch and satellites, where a few companies have working hardware and government money behind them, and most of the value is still ahead of the revenue.",
    validated: "2026-09-14",
  },
  fintech: {
    cagr: 0.22,
    because:
      "Taking payments and lending online, growing faster than banks and increasingly profitable, but competing with everyone.",
    validated: "2026-09-14",
  },
  drones: {
    cagr: 0.22,
    because:
      "Uncrewed aircraft and the defense budgets behind them, which are rising, against long procurement cycles that slow the money down.",
    validated: "2026-09-14",
  },
  software: {
    cagr: 0.19,
    because:
      "Sells the same product many times over, so growth drops through to profit, and the largest of them are already very large.",
    validated: "2026-09-14",
  },
  healthcare: {
    cagr: 0.12,
    because:
      "Demand that does not depend on the economy, set against patents running out and governments deciding what the products are allowed to cost.",
    validated: "2026-09-14",
  },
  other: {
    cagr: 0.1,
    because:
      "A company this app does not recognise is assumed to do exactly what the market does, which is the one assumption that needs no argument.",
    validated: "2026-09-14",
  },
  index: {
    cagr: 0.1,
    because:
      "A fund holding hundreds of companies is the market, and the market's own long run rate is what it gets.",
    validated: "2026-09-14",
  },
};

/**
 * The per-name view, which is what "validated separately" means.
 *
 * A name is on this list because somebody here has a reason to think it
 * does not compound at its sector's rate, in either direction. A name that
 * is not on it takes its sector's rate, which is a perfectly good answer
 * and the right one for most companies.
 *
 * Read the list for the entries *under* the market before trusting the
 * ones over it.
 */
export const TICKER_GROWTH: Record<string, GrowthEntry> = {
  // --- AI infrastructure -------------------------------------------------
  NBIS: {
    cagr: 0.415,
    because:
      "Revenue is multiplying rather than growing, the capacity is contracted before it is built, and Nvidia is both a supplier and a shareholder. The fastest thing in this table, and the one most dependent on that demand holding.",
    validated: "2026-09-14",
  },
  CRWV: {
    cagr: 0.38,
    because:
      "The same business as NBIS at larger scale, carrying much more debt against the buildout, which cuts both ways.",
    validated: "2026-09-14",
  },
  IREN: {
    cagr: 0.33,
    because:
      "Turning mining sites into AI computing, which is the cheapest way to get powered space, against a starting business that is worth much less.",
    validated: "2026-09-14",
  },
  SMCI: {
    cagr: 0.24,
    because:
      "Assembles the servers rather than designing them, so it grows with the build and keeps very little of each sale, and its accounting has needed restating before.",
    validated: "2026-09-14",
  },
  VRT: {
    cagr: 0.24,
    because:
      "Cooling and power inside the datacenter, a genuine shortage, priced and run as an industrial supplier.",
    validated: "2026-09-14",
  },
  ANET: {
    cagr: 0.22,
    because:
      "The networking in the middle of it, very profitable and very well run, already large enough that the percentages get harder.",
    validated: "2026-09-14",
  },
  DELL: {
    cagr: 0.12,
    because:
      "Sells AI servers, but most of what it sells is still laptops and storage, so the fast part is a minority of the company.",
    validated: "2026-09-14",
  },

  // --- Semiconductors ----------------------------------------------------
  NVDA: {
    cagr: 0.32,
    because:
      "Sells most of the chips the whole build runs on and keeps about half of every dollar, against a size where each further doubling is a larger sum than any company has added before.",
    validated: "2026-09-14",
  },
  AMD: {
    cagr: 0.3,
    because:
      "The only credible second source for those chips, so it grows off a small base if buyers want an alternative at all.",
    validated: "2026-09-14",
  },
  AVGO: {
    cagr: 0.26,
    because:
      "Custom chips for the companies that would rather not buy Nvidia's, plus software bought with debt that is being paid down.",
    validated: "2026-09-14",
  },
  MRVL: {
    cagr: 0.26,
    because: "Custom silicon and optical parts, smaller and more contested than Broadcom's.",
    validated: "2026-09-14",
  },
  MU: {
    cagr: 0.26,
    because:
      "The memory beside the processor, which the AI parts need far more of, in a business whose prices have always collapsed eventually.",
    validated: "2026-09-14",
  },
  TSM: {
    cagr: 0.24,
    because:
      "Actually makes nearly all of it, with pricing power to match, carrying a concentration of political risk no other company in this table has.",
    validated: "2026-09-14",
  },
  ASML: {
    cagr: 0.24,
    because: "The only company that makes the machines, selling a small number of them at a very high price.",
    validated: "2026-09-14",
  },
  ARM: {
    cagr: 0.24,
    because: "Licenses the designs and takes a royalty, which grows with units rather than with prices.",
    validated: "2026-09-14",
  },
  INTC: {
    cagr: 0.06,
    because:
      "Has lost the lead in both designing and making, is spending enormously to get it back, and is being kept going partly by government money. Deliberately under the market: this table is not a list of things to like.",
    validated: "2026-09-14",
  },

  // --- Power for the build ----------------------------------------------
  OKLO: {
    cagr: 0.35,
    because:
      "Small reactors with datacenter demand already queuing for them and essentially no revenue yet, so the rate is high and almost entirely a bet on the licensing going through.",
    validated: "2026-09-14",
  },
  SMR: {
    cagr: 0.31,
    because: "The same idea further along in approvals and further behind in orders.",
    validated: "2026-09-14",
  },
  VST: {
    cagr: 0.24,
    because: "Owns the generation the datacenters are signing for, already earning real money from it.",
    validated: "2026-09-14",
  },
  CEG: {
    cagr: 0.24,
    because: "The largest carbon free fleet, selling directly to the same buyers on long contracts.",
    validated: "2026-09-14",
  },
  GEV: {
    cagr: 0.22,
    because: "Turbines and grid equipment, an order book that is full and a factory pace that decides the rest.",
    validated: "2026-09-14",
  },
  ETN: {
    cagr: 0.16,
    because: "Electrical equipment into the same shortage, a large and diversified industrial underneath it.",
    validated: "2026-09-14",
  },

  // --- Software ----------------------------------------------------------
  PLTR: {
    cagr: 0.28,
    because:
      "Growing quickly in both government and commercial work, and already priced at a multiple that assumes most of it.",
    validated: "2026-09-14",
  },
  CRWD: {
    cagr: 0.22,
    because: "Security that customers add modules to over time, which keeps the growth going longer than most.",
    validated: "2026-09-14",
  },
  NOW: {
    cagr: 0.2,
    because: "Sits inside the workflows of very large companies, which is hard to grow quickly and harder to leave.",
    validated: "2026-09-14",
  },
  ORCL: {
    cagr: 0.2,
    because:
      "Late but real in AI computing, funding it with debt against a large database business that is not going anywhere.",
    validated: "2026-09-14",
  },
  AMZN: {
    cagr: 0.18,
    because: "Cloud is the part that matters here, and it is the biggest one, attached to a retailer growing slowly.",
    validated: "2026-09-14",
  },
  GOOGL: {
    cagr: 0.17,
    because: "Makes its own chips, owns a frontier lab and a cloud, against an advertising business AI could take from it.",
    validated: "2026-09-14",
  },
  META: {
    cagr: 0.17,
    because: "Spending enormously on AI to serve advertising that already works, so the return on that spending is the whole question.",
    validated: "2026-09-14",
  },
  MSFT: {
    cagr: 0.16,
    because: "The most complete position in AI of any large company, on a base so big that the percentage cannot be dramatic.",
    validated: "2026-09-14",
  },
  NFLX: {
    cagr: 0.15,
    because: "Has won its market and is now growing on price and advertising rather than on new subscribers.",
    validated: "2026-09-14",
  },
  AAPL: {
    cagr: 0.11,
    because: "Sells the most profitable hardware in the world and is visibly behind on AI, which is why it sits near the market rather than above it.",
    validated: "2026-09-14",
  },
  ADBE: {
    cagr: 0.09,
    because:
      "The clearest case in this table of a company whose own product could be replaced by what it is building on. Under the market on purpose.",
    validated: "2026-09-14",
  },
  IBM: {
    cagr: 0.08,
    because: "Consulting and mainframes with an AI label on them, growing at roughly the pace of the economy.",
    validated: "2026-09-14",
  },

  // --- Crypto adjacent ---------------------------------------------------
  BMNR: {
    cagr: 0.35,
    because: "A holding company for coins, so it moves further than the coins do in both directions.",
    validated: "2026-09-14",
  },
  MSTR: {
    cagr: 0.3,
    because: "Bitcoin bought with borrowed money, which is what makes it both faster than bitcoin and able to fail in a way bitcoin cannot.",
    validated: "2026-09-14",
  },
  COIN: {
    cagr: 0.28,
    because: "Earns fees on trading rather than owning the coins, so it needs activity rather than prices.",
    validated: "2026-09-14",
  },

  // --- Space -------------------------------------------------------------
  ASTS: {
    cagr: 0.35,
    because: "Phones talking to satellites directly, with the carriers signed up and most of the satellites not yet launched.",
    validated: "2026-09-14",
  },
  RKLB: {
    cagr: 0.3,
    because: "Launches regularly and is building a much larger rocket, which is where the case actually sits.",
    validated: "2026-09-14",
  },

  // --- Fintech -----------------------------------------------------------
  HOOD: {
    cagr: 0.26,
    because: "Earns on trading, interest and crypto at once, which is three ways to grow and three ways to be cyclical.",
    validated: "2026-09-14",
  },
  SOFI: {
    cagr: 0.24,
    because: "A bank licence and a young customer base, lending into a cycle that has not been tested yet.",
    validated: "2026-09-14",
  },
  V: {
    cagr: 0.12,
    because: "Takes a fraction of a very large number of payments, which grows steadily and is hard to disturb.",
    validated: "2026-09-14",
  },
  MA: {
    cagr: 0.12,
    because: "The same business as Visa, slightly smaller and slightly faster.",
    validated: "2026-09-14",
  },
  PYPL: {
    cagr: 0.07,
    because: "Losing checkout share to Apple, Shopify and the banks, and buying back stock rather than growing. Under the market.",
    validated: "2026-09-14",
  },

  // --- Healthcare --------------------------------------------------------
  HIMS: {
    cagr: 0.25,
    because: "Selling treatment directly to people who would not otherwise ask a doctor, which is growing quickly and is easy to copy.",
    validated: "2026-09-14",
  },
  LLY: {
    cagr: 0.15,
    because: "The weight treatments are the largest drug launch there has been, against manufacturing limits and what insurers will pay.",
    validated: "2026-09-14",
  },
  UNH: {
    cagr: 0.09,
    because: "Grows with healthcare spending and is squeezed whenever government decides that spending is too high.",
    validated: "2026-09-14",
  },
  PFE: {
    cagr: 0.03,
    because:
      "Patents running out on most of what it sells, with acquisitions bought at high prices to replace them. The lowest entry in this table, and it is here so the table has one.",
    validated: "2026-09-14",
  },

  // --- Defense -----------------------------------------------------------
  AVAV: {
    cagr: 0.22,
    because: "Small drones that are actually being used and actually being reordered.",
    validated: "2026-09-14",
  },
  RTX: {
    cagr: 0.1,
    because: "Missiles and engines against real budget growth, at the pace a prime contractor moves.",
    validated: "2026-09-14",
  },
  LMT: {
    cagr: 0.08,
    because: "Concentrated in one aircraft programme whose share of the budget is being argued about.",
    validated: "2026-09-14",
  },
  NOC: {
    cagr: 0.09,
    because: "The bomber and the nuclear rebuild, which is steady work priced as such.",
    validated: "2026-09-14",
  },
};

/**
 * Sector classification. Purely "what kind of company is this": no rate
 * attaches to membership here, the rate is `SECTOR_GROWTH` above.
 */
const THEME_TICKERS: [ForecastTheme, string[]][] = [
  // GPU clouds, AI datacenter build and the hardware inside it.
  ["ai_infra", ["NBIS", "CRWV", "SMCI", "VRT", "ANET", "DELL", "IREN", "APLD", "CIFR"]],
  // Generation and grid feeding those datacenters.
  ["ai_power", ["VST", "PWR", "CEG", "NRG", "TLN", "GEV", "ETN", "OKLO", "SMR", "BWXT"]],
  ["crypto", ["BMNR", "MSTR", "COIN", "MARA", "RIOT", "CLSK", "HUT", "BITF", "GLXY"]],
  ["space", ["RKLB", "ASTS", "LUNR", "RDW", "PL", "SPCE", "NASA", "UFO"]],
  [
    "semi",
    ["NVDA", "AVGO", "TSM", "ASML", "AMD", "INTC", "MU", "QCOM", "TXN", "ADI",
     "LRCX", "AMAT", "KLAC", "ARM", "MRVL", "NXPI", "ON", "MCHP", "SWKS", "TER",
     "SMH", "SOXX", "XSD", "PSI", "DRAM", "QTUM"],
  ],
  ["fintech", ["SOFI", "HOOD", "AFRM", "UPST", "PYPL", "SQ", "XYZ", "NU", "TOST", "MELI", "V", "MA"]],
  [
    "software",
    ["PLTR", "NOW", "GOOGL", "GOOG", "CRM", "DDOG", "SNOW", "MSFT", "ORCL",
     "ADBE", "TEAM", "WDAY", "ZS", "CRWD", "PANW", "NET", "MDB", "HUBS",
     "SHOP", "TTD", "APP", "U", "RBLX", "META", "AMZN", "IBM", "SAP",
     "AAPL", "NFLX", "QQQ", "QQQM", "XLK"],
  ],
  [
    "healthcare",
    ["UNH", "LLY", "ISRG", "HIMS", "NVO", "PFE", "MRK", "ABBV", "JNJ", "TMO",
     "DHR", "VRTX", "REGN", "AMGN", "MRNA"],
  ],
  ["drones", ["AVAV", "KTOS", "RCAT", "ONDS", "UMAC", "LMT", "RTX", "NOC", "GD", "LHX"]],
  [
    "index",
    ["SPY", "VOO", "IVV", "VTI", "VT", "CSPX", "VWCE", "VUSA", "EX13",
     "SCHD", "DIA", "EEM", "VXUS"],
  ],
];

const THEME_BY_TICKER: Map<string, ForecastTheme> = new Map(
  THEME_TICKERS.flatMap(([theme, tickers]) =>
    tickers.map((t) => [t, theme] as [string, ForecastTheme])
  )
);

export function normalizeGrowthTicker(ticker: string): string {
  return (ticker.split(".")[0] ?? "").toUpperCase();
}

export function forecastThemeForTicker(ticker: string): ForecastTheme {
  const base = normalizeGrowthTicker(ticker);

  const known = THEME_BY_TICKER.get(base);
  if (known) return known;
  if (isCoinSymbol(ticker)) return "crypto";

  // FX pairs and anything else with an `=` are index-like for our purposes.
  if (ticker.includes("=")) return "index";

  // Name-shaped guesses for tickers not on the list above.
  if (/BTC|ETH|CRYPTO|MINE/.test(base)) return "crypto";
  if (/SEMI|SOXX|SMH|DRAM|QTUM/.test(base)) return "semi";
  if (/NASA|SPACE|UFO/.test(base)) return "space";
  if (/QQQ|XLK/.test(base)) return "software";
  if (/CLOUD|GPU|AI/.test(base)) return "ai_infra";
  if (/HEALTH|PHARMA|BIO/.test(base)) return "healthcare";
  if (/DRONE|UAV|DEFENSE/.test(base)) return "drones";
  if (/SAAS|SOFT/.test(base)) return "software";
  if (/SOLAR|ENERGY|POWER|ELEC/.test(base)) return "ai_power";
  return "other";
}

export type GrowthAnchor = {
  ticker: string;
  sector: ForecastTheme;
  /** Compound annual rate this app assumes, as a fraction. */
  cagr: number;
  /** What today's price is multiplied by at the end of the path. */
  terminalMultiple: number;
  /** Whether a per-name view was on file, or the sector answered. */
  basis: GrowthBasis;
  because: string;
  validated: string;
};

export type GrowthBasis = "ticker" | "sector";

function clampCagr(n: number): number {
  if (!Number.isFinite(n)) return SECTOR_GROWTH.other.cagr;
  return Math.min(MAX_CAGR, Math.max(MIN_CAGR, n));
}

/**
 * The one answer to "how fast does this app assume this name compounds".
 *
 * Deterministic: ticker in, rate out, with no model, no clock and no
 * request behind it. That is the whole point of the file, so do not make
 * this depend on anything that varies between two calls.
 */
export function growthAnchorFor(ticker: string): GrowthAnchor {
  const base = normalizeGrowthTicker(ticker);
  const sector = forecastThemeForTicker(ticker);
  const own = TICKER_GROWTH[base];
  const entry = own ?? SECTOR_GROWTH[sector];
  const cagr = clampCagr(entry.cagr);
  return {
    ticker: base,
    sector,
    cagr,
    terminalMultiple: Math.pow(1 + cagr, growthYears()),
    basis: own ? "ticker" : "sector",
    because: entry.because,
    validated: entry.validated,
  };
}

/** What this app assumes the last year of the path comes to. */
export function growthTerminalPrice(ticker: string, spot: number): number {
  if (!(spot > 0)) return 0;
  return Math.round(spot * growthAnchorFor(ticker).terminalMultiple * 100) / 100;
}

/** The sector's own terminal multiple, with no per-name view applied. */
export function sectorTerminalMultiple(theme: ForecastTheme): number {
  return Math.pow(1 + clampCagr(SECTOR_GROWTH[theme].cagr), growthYears());
}
