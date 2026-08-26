import { forecastThemeForTicker } from "@/lib/forecast-conviction";
import { finiteNumber, roundMoney, safeDiv, sumMoney } from "@/lib/money";

/**
 * Macro shock scenarios with per-ticker thematic and factor sensitivities.
 * Betas and factor sensitivities reflect asset-specific drivers (valuation duration,
 * AI capital expenditure, crypto cycles, energy demand, and FX exposure).
 */

export type ShockId =
  | "none"
  | "rates_up"
  | "tech_pullback10"
  | "oil_shock25"
  | "ai_down20"
  | "btc_winter35"
  | "broad_down15"
  | "usd_surge7"
  | "china_supply_shock"
  | "soft_landing_rally";

export type MacroShockCategory =
  | "Interest rates"
  | "Tech prices"
  | "Oil and energy"
  | "AI computer builders"
  | "Crypto"
  | "Everyone selling"
  | "The dollar"
  | "Factories"
  | "People buying"
  | "Baseline";

export type ShockDefinition = {
  id: ShockId;
  label: string;
  shortLabel: string;
  tagline: string;
  driver: MacroShockCategory;
  /** Headline move applied to the core driver (e.g. -0.20 for -20%) */
  headlinePct: number;
  /** Concise PM context on what triggers the shock and why */
  mechanism: string;
  /** Actionable checklist / tactical takeaway (dash-free) */
  tacticalAction: string;
};

export const SHOCKS: ShockDefinition[] = [
  {
    id: "none",
    label: "No shock",
    shortLabel: "Live",
    tagline: "Today's prices, no what-if.",
    driver: "Baseline",
    headlinePct: 0,
    mechanism: "Today's prices, with no made-up shock applied.",
    tacticalAction: "What your portfolio is worth right now.",
  },
  {
    id: "rates_up",
    label: "Rates +75 bps",
    shortLabel: "Rates +75bps",
    tagline: "Borrowing gets more expensive. Growth companies usually get hit.",
    driver: "Interest rates",
    headlinePct: -0.12,
    mechanism: "When interest rates jump, pricey growth companies usually fall. Power companies and cash tend to hold up better.",
    tacticalAction: "Borrowed money gets more expensive. The priciest growth names usually fall most.",
  },
  {
    id: "tech_pullback10",
    label: "Tech pullback −10%",
    shortLabel: "Tech −10%",
    tagline: "Big tech, AI cloud, and chip names all get cheaper together.",
    driver: "Tech prices",
    headlinePct: -0.10,
    mechanism: "Software, cloud, and chip companies fall together. Calmer businesses, energy, and cash usually hold up better.",
    tacticalAction: "Cash sitting ready keeps its value in this picture.",
  },
  {
    id: "oil_shock25",
    label: "Oil shock +25%",
    shortLabel: "Oil +25%",
    tagline: "Oil jumps. Power companies often gain. Consumer tech often pays more for energy.",
    driver: "Oil and energy",
    headlinePct: 0.25,
    mechanism: "Oil and energy go up. Power companies often follow. Tech and shopping names often eat the extra cost.",
    tacticalAction: "Energy and power often cushion this. Consumer tech often eats the extra cost.",
  },
  {
    id: "ai_down20",
    label: "AI −20%",
    shortLabel: "AI −20%",
    tagline: "Chip makers and AI computer companies take the hit. A chip fund is not the whole market. That group is the part of the mix that moves most in this picture.",
    driver: "AI computer builders",
    headlinePct: -0.20,
    mechanism: "Companies pause spending on AI computers. Cloud, chip makers, AI software, and data-center power all feel it.",
    tacticalAction: "Chip makers and AI computer builders are the group that moves most in this picture.",
  },
  {
    id: "btc_winter35",
    label: "Crypto winter −35%",
    shortLabel: "Crypto −35%",
    tagline: "Crypto-linked names take the first hit. Payment and growth names often follow.",
    driver: "Crypto",
    headlinePct: -0.35,
    mechanism: "Bitcoin falls hard. Companies that hold crypto, mine it, or trade it get hit first. Payment and growth names often follow.",
    tacticalAction: "Crypto-linked names take the first hit. If they are a large slice, a winter is a portfolio-wide problem.",
  },
  {
    id: "broad_down15",
    label: "Broad −15%",
    shortLabel: "Flash −15%",
    tagline: "People sell. Chips and crypto usually fall harder than the broad market. Food and bonds usually less.",
    driver: "Everyone selling",
    headlinePct: -0.15,
    mechanism: "Almost everything falls together. Jumpy names still fall further than calmer ones and the broad market.",
    tacticalAction: "Cash keeps its value in this picture.",
  },
  {
    id: "usd_surge7",
    label: "Dollar surge +7%",
    shortLabel: "DXY +7%",
    tagline: "The dollar jumps. European stocks and US companies that sell abroad often feel it.",
    driver: "The dollar",
    headlinePct: 0.07,
    mechanism: "A stronger US dollar makes European stocks and US companies that earn money abroad look weaker in dollars.",
    tacticalAction: "US-only businesses usually hold up better when the dollar jumps.",
  },
  {
    id: "china_supply_shock",
    label: "Semi supply drag",
    shortLabel: "Supply drag",
    tagline: "Chip factories in Asia get stuck. US cloud software is usually safer.",
    driver: "Factories",
    headlinePct: -0.15,
    mechanism: "Trouble making chips in Asia hits chip factories and the machines that make them. US software and energy usually hold up.",
    tacticalAction: "Software and US power companies are the usual cushion when factories stall.",
  },
  {
    id: "soft_landing_rally",
    label: "Risk rally +12%",
    shortLabel: "Rally +12%",
    tagline: "Growth, payments, space, and crypto usually lead. Names that already ran far from what you paid tend to move most.",
    driver: "People buying",
    headlinePct: 0.12,
    mechanism: "Prices stop rising so fast and the economy stays ok. Money often flows into growth, tech, and the names that swing hardest.",
    tacticalAction: "Names that swing hard usually lead. Those that already ran a long way from what you paid tend to move most.",
  },
];

export type TickerShockProfile = {
  /** Short theme label shown in the shock table */
  label: string;
  /** Sensitivity to AI digester (−20% at beta 1) */
  ai: number;
  /** Sensitivity to crypto winter (−35% at beta 1); includes risk-off correlation */
  crypto: number;
  /** Sensitivity to rates bite (negative = hurt when rates up) */
  rates: number;
  /** Sensitivity to energy & commodity prices (positive = energy / power producers benefit) */
  energy?: number;
  /** Sensitivity to strong USD / foreign revenue (negative = hurt by rising dollar) */
  fx?: number;
  /** Broad market beta (SPY = 1.0) */
  beta?: number;
  /** Sensitivity to Asia hardware / foundry supply chain friction */
  supplyChain?: number;
};

/**
 * Canonical profiles for Upside book names + common adjacents.
 * Unknown tickers fall back to a dynamic classifier.
 */
const PROFILES: Record<string, TickerShockProfile> = {
  // AI infra / neo-cloud
  NBIS: { label: "AI infra / GPU cloud", ai: 1, crypto: 0.5, rates: -1, energy: -0.35, fx: -0.2, beta: 1.7, supplyChain: 0.5 },
  CRWV: { label: "AI infra / neo-cloud", ai: 1, crypto: 0.48, rates: -0.95, energy: -0.35, fx: -0.2, beta: 1.65, supplyChain: 0.5 },

  // Semis / AI chips
  NVDA: { label: "Semis / AI chips", ai: 1, crypto: 0.38, rates: -0.9, energy: -0.3, fx: -0.5, beta: 1.6, supplyChain: 0.85 },
  AVGO: { label: "Semis / AI interconnect", ai: 0.95, crypto: 0.32, rates: -0.85, energy: -0.25, fx: -0.5, beta: 1.4, supplyChain: 0.8 },
  TSM: { label: "Semis / foundry", ai: 0.9, crypto: 0.3, rates: -0.8, energy: -0.25, fx: -0.65, beta: 1.35, supplyChain: 1.0 },
  ASML: { label: "Semis / lithography", ai: 0.85, crypto: 0.28, rates: -0.75, energy: -0.2, fx: -0.9, beta: 1.3, supplyChain: 0.95 },
  "ASML.AS": { label: "Semis / lithography", ai: 0.85, crypto: 0.28, rates: -0.75, energy: -0.2, fx: -0.9, beta: 1.3, supplyChain: 0.95 },
  "SMH.L": { label: "Semis ETF", ai: 0.9, crypto: 0.3, rates: -0.8, energy: -0.25, fx: -0.8, beta: 1.45, supplyChain: 0.85 },
  AMD: { label: "Semis / AI compute", ai: 0.9, crypto: 0.35, rates: -0.85, energy: -0.3, fx: -0.45, beta: 1.55, supplyChain: 0.8 },
  INTC: { label: "Semis / foundry turnaround", ai: 0.6, crypto: 0.2, rates: -0.65, energy: -0.2, fx: -0.4, beta: 1.1, supplyChain: 0.7 },

  // AI software / platforms
  PLTR: { label: "AI software / data", ai: 0.9, crypto: 0.35, rates: -0.85, energy: -0.15, fx: -0.25, beta: 1.4, supplyChain: 0.15 },
  NOW: { label: "Enterprise / AI software", ai: 0.75, crypto: 0.28, rates: -0.7, energy: -0.15, fx: -0.35, beta: 1.25, supplyChain: 0.15 },
  GOOGL: { label: "Big tech / AI spend", ai: 0.55, crypto: 0.28, rates: -0.55, energy: -0.2, fx: -0.5, beta: 1.15, supplyChain: 0.3 },
  "ABEA.DE": { label: "Big tech / AI spend", ai: 0.55, crypto: 0.28, rates: -0.55, energy: -0.2, fx: -0.85, beta: 1.15, supplyChain: 0.3 },
  MSFT: { label: "Enterprise cloud / AI", ai: 0.7, crypto: 0.22, rates: -0.6, energy: -0.2, fx: -0.45, beta: 1.1, supplyChain: 0.3 },
  AAPL: { label: "Consumer tech / hardware", ai: 0.5, crypto: 0.18, rates: -0.5, energy: -0.25, fx: -0.55, beta: 1.05, supplyChain: 0.75 },
  AMZN: { label: "Cloud infra / ecommerce", ai: 0.65, crypto: 0.25, rates: -0.65, energy: -0.4, fx: -0.4, beta: 1.2, supplyChain: 0.4 },
  META: { label: "AI social / advertising", ai: 0.75, crypto: 0.25, rates: -0.6, energy: -0.2, fx: -0.45, beta: 1.3, supplyChain: 0.2 },

  // AI power stack (data center electricity + buildout)
  VST: { label: "AI power / generation", ai: 0.85, crypto: 0.3, rates: -0.25, energy: 0.7, fx: -0.1, beta: 1.2, supplyChain: 0.2 },
  PWR: { label: "AI power / grid infra", ai: 0.8, crypto: 0.28, rates: -0.3, energy: 0.6, fx: -0.1, beta: 1.15, supplyChain: 0.35 },

  // Crypto complex
  BMNR: { label: "Crypto / BTC treasury", ai: 0.2, crypto: 1, rates: -0.75, energy: -0.3, fx: -0.2, beta: 2.2, supplyChain: 0.2 },
  MSTR: { label: "Crypto / BTC treasury", ai: 0.15, crypto: 1, rates: -0.8, energy: -0.3, fx: -0.2, beta: 2.3, supplyChain: 0.2 },
  COIN: { label: "Crypto exchange", ai: 0.25, crypto: 0.95, rates: -0.7, energy: -0.25, fx: -0.3, beta: 2.1, supplyChain: 0.15 },
  MARA: { label: "Crypto miner", ai: 0.15, crypto: 0.95, rates: -0.75, energy: -0.45, fx: -0.15, beta: 2.4, supplyChain: 0.3 },
  RIOT: { label: "Crypto miner", ai: 0.15, crypto: 0.95, rates: -0.75, energy: -0.45, fx: -0.15, beta: 2.4, supplyChain: 0.3 },

  // Speculative growth / space / mobility
  RKLB: { label: "Space / aerospace", ai: 0.2, crypto: 0.42, rates: -0.85, energy: -0.3, fx: -0.2, beta: 1.8, supplyChain: 0.5 },
  TSLA: { label: "EV / robotics / autonomy", ai: 0.7, crypto: 0.55, rates: -0.8, energy: -0.35, fx: -0.5, beta: 1.9, supplyChain: 0.65 },

  // Fintech
  HOOD: { label: "Fintech / brokerage", ai: 0.25, crypto: 0.55, rates: -0.65, energy: -0.2, fx: -0.2, beta: 1.5, supplyChain: 0.1 },
  SOFI: { label: "Fintech / consumer lending", ai: 0.2, crypto: 0.4, rates: -0.6, energy: -0.2, fx: -0.1, beta: 1.45, supplyChain: 0.1 },

  // Consumer internet & media
  RDDT: { label: "Consumer internet", ai: 0.3, crypto: 0.3, rates: -0.55, energy: -0.15, fx: -0.2, beta: 1.3, supplyChain: 0.1 },
  NFLX: { label: "Streaming / entertainment", ai: 0.35, crypto: 0.15, rates: -0.5, energy: -0.15, fx: -0.5, beta: 1.1, supplyChain: 0.1 },
  UBER: { label: "Mobility / platform", ai: 0.4, crypto: 0.2, rates: -0.55, energy: -0.6, fx: -0.4, beta: 1.25, supplyChain: 0.1 },

  // Defence
  "RHM.DE": { label: "European defence", ai: 0.15, crypto: 0.15, rates: -0.25, energy: 0.3, fx: -0.85, beta: 0.85, supplyChain: 0.4 },

  // Energy & Industrials
  XLE: { label: "Energy sector ETF", ai: 0.05, crypto: 0.1, rates: 0.1, energy: 1.0, fx: -0.3, beta: 0.8, supplyChain: 0.2 },
  XOM: { label: "Energy / oil major", ai: 0.05, crypto: 0.1, rates: 0.1, energy: 0.95, fx: -0.4, beta: 0.75, supplyChain: 0.2 },
  CVX: { label: "Energy / oil major", ai: 0.05, crypto: 0.1, rates: 0.1, energy: 0.95, fx: -0.4, beta: 0.75, supplyChain: 0.2 },

  // Healthcare / Quality Value
  LLY: { label: "Pharma / GLP-1 healthcare", ai: 0.2, crypto: 0.05, rates: -0.3, energy: -0.1, fx: -0.45, beta: 0.65, supplyChain: 0.3 },
  UNH: { label: "Healthcare / insurance", ai: 0.1, crypto: 0.05, rates: -0.2, energy: -0.1, fx: -0.1, beta: 0.55, supplyChain: 0.1 },
  JNJ: { label: "Healthcare / defensive", ai: 0.05, crypto: 0.05, rates: -0.15, energy: -0.1, fx: -0.4, beta: 0.45, supplyChain: 0.2 },
  JPM: { label: "Diversified banking", ai: 0.25, crypto: 0.15, rates: 0.15, energy: 0.1, fx: -0.3, beta: 0.95, supplyChain: 0.1 },
  V: { label: "Payment network", ai: 0.3, crypto: 0.2, rates: -0.45, energy: -0.15, fx: -0.5, beta: 0.9, supplyChain: 0.1 },
  MA: { label: "Payment network", ai: 0.3, crypto: 0.2, rates: -0.45, energy: -0.15, fx: -0.5, beta: 0.9, supplyChain: 0.1 },
  "BRK.B": { label: "Conglomerate / value", ai: 0.15, crypto: 0.05, rates: 0.1, energy: 0.3, fx: -0.2, beta: 0.65, supplyChain: 0.15 },

  // Indexes / broad
  SPY: { label: "US large-cap index", ai: 0.28, crypto: 0.18, rates: -0.4, energy: -0.15, fx: -0.35, beta: 1.0, supplyChain: 0.28 },
  QQQ: { label: "US tech index", ai: 0.65, crypto: 0.28, rates: -0.65, energy: -0.25, fx: -0.45, beta: 1.2, supplyChain: 0.45 },
  IWM: { label: "US small-cap index", ai: 0.2, crypto: 0.35, rates: -0.85, energy: -0.35, fx: -0.1, beta: 1.25, supplyChain: 0.25 },
  TLT: { label: "US 20Y treasury ETF", ai: 0.0, crypto: 0.0, rates: -1.2, energy: -0.1, fx: 0.0, beta: 0.3, supplyChain: 0.0 },
  "CSPX.L": { label: "US large-cap index", ai: 0.25, crypto: 0.22, rates: -0.4, energy: -0.2, fx: -0.8, beta: 1.0, supplyChain: 0.3 },
  "VWCE.DE": { label: "Global equity ETF", ai: 0.2, crypto: 0.2, rates: -0.35, energy: -0.2, fx: -0.85, beta: 0.95, supplyChain: 0.35 },
  "JEDI.L": { label: "Thematic ETF", ai: 0.45, crypto: 0.3, rates: -0.55, energy: -0.25, fx: -0.8, beta: 1.2, supplyChain: 0.4 },
  "ANX.PA": { label: "European equity", ai: 0.15, crypto: 0.18, rates: -0.35, energy: -0.2, fx: -0.85, beta: 0.9, supplyChain: 0.3 },
  "EX13.VI": { label: "European equity ETF", ai: 0.15, crypto: 0.18, rates: -0.35, energy: -0.2, fx: -0.85, beta: 0.9, supplyChain: 0.3 },
};

const KIND_PROFILES: Record<string, TickerShockProfile> = {
  ai_infra: { label: "AI infra / GPU cloud", ai: 1, crypto: 0.5, rates: -1, energy: -0.35, fx: -0.2, beta: 1.7, supplyChain: 0.5 },
  semi_stock: { label: "Semis", ai: 0.92, crypto: 0.34, rates: -0.85, energy: -0.28, fx: -0.5, beta: 1.5, supplyChain: 0.85 },
  semi_etf: { label: "Semis ETF", ai: 0.9, crypto: 0.3, rates: -0.8, energy: -0.25, fx: -0.35, beta: 1.45, supplyChain: 0.85 },
  quantum: { label: "Quantum / AI compute", ai: 0.82, crypto: 0.32, rates: -0.85, energy: -0.2, fx: -0.3, beta: 1.5, supplyChain: 0.55 },
  ai_power: { label: "AI power / generation", ai: 0.85, crypto: 0.3, rates: -0.25, energy: 0.7, fx: -0.1, beta: 1.2, supplyChain: 0.2 },
  nasdaq: { label: "US tech index", ai: 0.65, crypto: 0.28, rates: -0.65, energy: -0.25, fx: -0.45, beta: 1.2, supplyChain: 0.45 },
  software: { label: "Software / platforms", ai: 0.62, crypto: 0.24, rates: -0.62, energy: -0.18, fx: -0.4, beta: 1.15, supplyChain: 0.22 },
  broad_us: { label: "US large-cap index", ai: 0.28, crypto: 0.18, rates: -0.4, energy: -0.15, fx: -0.3, beta: 1.0, supplyChain: 0.28 },
  small_cap: { label: "US small-cap index", ai: 0.2, crypto: 0.35, rates: -0.85, energy: -0.35, fx: -0.1, beta: 1.25, supplyChain: 0.25 },
  intl: { label: "International equity", ai: 0.18, crypto: 0.18, rates: -0.35, energy: -0.2, fx: -0.85, beta: 0.95, supplyChain: 0.35 },
  em: { label: "Emerging markets", ai: 0.22, crypto: 0.22, rates: -0.45, energy: -0.15, fx: -0.7, beta: 1.05, supplyChain: 0.45 },
  thematic: { label: "Thematic growth ETF", ai: 0.55, crypto: 0.35, rates: -0.75, energy: -0.25, fx: -0.35, beta: 1.35, supplyChain: 0.4 },
  crypto: { label: "Crypto proxy", ai: 0.2, crypto: 1, rates: -0.75, energy: -0.3, fx: -0.2, beta: 2.2, supplyChain: 0.2 },
  space: { label: "Space / aerospace", ai: 0.22, crypto: 0.42, rates: -0.85, energy: -0.3, fx: -0.2, beta: 1.8, supplyChain: 0.5 },
  fintech: { label: "Fintech", ai: 0.25, crypto: 0.5, rates: -0.65, energy: -0.2, fx: -0.2, beta: 1.5, supplyChain: 0.1 },
  consumer: { label: "Consumer internet", ai: 0.3, crypto: 0.28, rates: -0.55, energy: -0.15, fx: -0.25, beta: 1.25, supplyChain: 0.1 },
  ev: { label: "EV / autonomy", ai: 0.7, crypto: 0.5, rates: -0.8, energy: -0.35, fx: -0.5, beta: 1.85, supplyChain: 0.65 },
  energy: { label: "Energy", ai: 0.05, crypto: 0.1, rates: 0.1, energy: 1.0, fx: -0.3, beta: 0.8, supplyChain: 0.2 },
  healthcare: { label: "Healthcare", ai: 0.1, crypto: 0.05, rates: -0.22, energy: -0.1, fx: -0.3, beta: 0.55, supplyChain: 0.2 },
  defense: { label: "Defense", ai: 0.15, crypto: 0.12, rates: -0.25, energy: 0.25, fx: -0.4, beta: 0.85, supplyChain: 0.4 },
  banks: { label: "Banks", ai: 0.22, crypto: 0.15, rates: 0.2, energy: 0.1, fx: -0.25, beta: 1.05, supplyChain: 0.1 },
  payments: { label: "Payments", ai: 0.3, crypto: 0.2, rates: -0.45, energy: -0.15, fx: -0.5, beta: 0.9, supplyChain: 0.1 },
  staples: { label: "Consumer staples", ai: 0.08, crypto: 0.05, rates: -0.15, energy: -0.25, fx: -0.25, beta: 0.55, supplyChain: 0.15 },
  industrials: { label: "Industrials", ai: 0.2, crypto: 0.12, rates: -0.35, energy: -0.15, fx: -0.35, beta: 1.05, supplyChain: 0.4 },
  utilities: { label: "Utilities", ai: 0.25, crypto: 0.08, rates: -0.2, energy: 0.35, fx: -0.1, beta: 0.6, supplyChain: 0.15 },
  reit: { label: "REITs", ai: 0.12, crypto: 0.1, rates: -0.85, energy: -0.15, fx: -0.1, beta: 0.85, supplyChain: 0.1 },
  bond: { label: "Bonds", ai: 0, crypto: 0, rates: -1.15, energy: -0.08, fx: 0, beta: 0.25, supplyChain: 0 },
  gold: { label: "Gold / metals", ai: 0.05, crypto: 0.15, rates: -0.35, energy: 0.1, fx: 0.2, beta: 0.2, supplyChain: 0.1 },
  cyber: { label: "Cybersecurity", ai: 0.45, crypto: 0.2, rates: -0.6, energy: -0.12, fx: -0.3, beta: 1.2, supplyChain: 0.15 },
  solar: { label: "Clean energy", ai: 0.35, crypto: 0.25, rates: -0.7, energy: 0.2, fx: -0.35, beta: 1.35, supplyChain: 0.45 },
  levered_growth: { label: "Levered growth ETF", ai: 1.55, crypto: 0.7, rates: -1.2, energy: -0.4, fx: -0.5, beta: 2.6, supplyChain: 0.9 },
  inverse: { label: "Inverse equity ETF", ai: -0.45, crypto: -0.25, rates: 0.25, energy: 0.05, fx: 0.1, beta: -1.0, supplyChain: -0.3 },
  other: { label: "Single-stock equity", ai: 0.22, crypto: 0.2, rates: -0.45, energy: -0.18, fx: -0.3, beta: 1.05, supplyChain: 0.25 },
};

function kindEntries(kind: string, tickers: string[]): [string, string][] {
  return tickers.map((t) => [t, kind]);
}

const TICKER_KIND: Record<string, string> = Object.fromEntries([
  ...kindEntries("broad_us", ["SPY", "VOO", "IVV", "VTI", "ITOT", "SPTM", "CSPX", "VUSA", "VUAA", "DIA", "SCHD", "VIG", "OEF"]),
  ...kindEntries("nasdaq", ["QQQ", "QQQM", "XLK", "VGT", "IYW", "FTEC"]),
  ...kindEntries("semi_etf", ["SMH", "SOXX", "XSD", "PSI", "SHOC", "SOXQ"]),
  ...kindEntries("quantum", ["QTUM", "BOTZ", "ROBO", "IRBO", "ARKQ"]),
  ...kindEntries("small_cap", ["IWM", "IJR", "VB", "SCHA", "IWO"]),
  ...kindEntries("intl", ["EFA", "VEA", "VXUS", "IEFA", "VWCE", "VT", "ANX", "EX13"]),
  ...kindEntries("em", ["EEM", "VWO", "IEMG", "SCHE"]),
  ...kindEntries("thematic", ["ARKK", "ARKW", "ARKF", "JEDI", "WCLD"]),
  ...kindEntries("energy", ["XLE", "VDE", "XOP", "OIH", "USO", "XOM", "CVX", "COP"]),
  ...kindEntries("healthcare", ["XLV", "VHT", "IHI"]),
  ...kindEntries("banks", ["XLF", "KRE", "KBE", "BAC", "WFC", "GS", "MS", "C"]),
  ...kindEntries("utilities", ["XLU", "VPU"]),
  ...kindEntries("reit", ["VNQ", "XLRE", "IYR"]),
  ...kindEntries("bond", ["TLT", "IEF", "BND", "AGG", "LQD", "TIP", "SHY", "GOVT", "BNDX", "HYG", "JNK"]),
  ...kindEntries("gold", ["GLD", "IAU", "SLV", "GDX", "GDXJ"]),
  ...kindEntries("crypto", ["IBIT", "FBTC", "BITO", "BITX", "GBTC", "ETHE", "ETHA"]),
  ...kindEntries("space", ["UFO", "ARKX", "NASA"]),
  ...kindEntries("cyber", ["HACK", "CIBR", "BUG", "IHAK"]),
  ...kindEntries("solar", ["TAN", "ICLN", "PBW", "QCLN"]),
  ...kindEntries("staples", ["KO", "PG", "PEP", "WMT", "COST", "MCD", "TGT", "CL", "MDLZ", "XLP"]),
  ...kindEntries("industrials", ["CAT", "BA", "GE", "HON", "UNP", "DE", "XLI"]),
  ...kindEntries("levered_growth", ["SOXL", "TQQQ", "UPRO", "TNA", "UDOW", "FAS", "TECL"]),
  ...kindEntries("inverse", ["SQQQ", "SPXU", "SDOW", "SH", "PSQ", "SDS", "SPXS"]),
  ...kindEntries("semi_stock", ["DRAM"]),
]);

function kindFromName(base: string): string | null {
  if (/SOXL|TQQQ|UPRO|TNA|UDOW|^FAS$|TECL/.test(base)) return "levered_growth";
  if (/SQQQ|SPXU|SDOW|^SH$|^PSQ$|^SDS$|SPXS/.test(base)) return "inverse";
  if (/TLT|IEF|^BND$|^AGG$|^LQD$|^TIP$|^SHY$|GOVT|BNDX|^HYG$/.test(base)) return "bond";
  if (/^GLD$|^IAU$|^SLV$|^GDX/.test(base)) return "gold";
  if (/IBIT|FBTC|BITO|BITX|GBTC|ETHE|ETHA/.test(base)) return "crypto";
  if (/SMH|SOXX|^XSD$|SEMI/.test(base)) return "semi_etf";
  if (/DRAM|NAND/.test(base)) return "semi_stock";
  if (/QTUM|BOTZ|ROBO|IRBO/.test(base)) return "quantum";
  if (/QQQ|XLK|^VGT$|^IYW$/.test(base)) return "nasdaq";
  if (/XLE|VDE|XOP|^USO$|^OIH$/.test(base)) return "energy";
  if (/UFO|ARKX|NASA|SPACE/.test(base)) return "space";
  if (/HACK|CIBR|^BUG$/.test(base)) return "cyber";
  if (/TAN|ICLN|^PBW$/.test(base)) return "solar";
  if (/XLF|^KRE$|^KBE$/.test(base)) return "banks";
  if (/XLV|^VHT$/.test(base)) return "healthcare";
  if (/XLU|^VPU$/.test(base)) return "utilities";
  if (/VNQ|XLRE|^IYR$/.test(base)) return "reit";
  if (/IWM|^IJR$|^VB$/.test(base)) return "small_cap";
  if (/EEM|^VWO$|IEMG/.test(base)) return "em";
  if (/EFA|^VEA$|VXUS|IEFA|VWCE/.test(base)) return "intl";
  if (/VOO|^IVV$|^VTI$|^ITOT$|^DIA$|CSPX|VUSA/.test(base)) return "broad_us";
  if (/ARKK|ARKW|ARKF|JEDI/.test(base)) return "thematic";
  return null;
}

function kindFromTheme(ticker: string): string {
  const theme = forecastThemeForTicker(ticker);
  switch (theme) {
    case "ai_infra":
      return "ai_infra";
    case "ai_power":
      return "ai_power";
    case "crypto":
      return "crypto";
    case "space":
      return "space";
    case "semi":
      return "semi_stock";
    case "fintech":
      return "fintech";
    case "software":
      return "software";
    case "healthcare":
      return "healthcare";
    case "drones":
      return "defense";
    case "index":
      return "broad_us";
    default:
      return "other";
  }
}

function resolveKind(raw: string, base: string): string {
  return (
    TICKER_KIND[raw] ??
    TICKER_KIND[base] ??
    kindFromName(base) ??
    kindFromTheme(raw)
  );
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function tickerBase(ticker: string): string {
  return ticker.split(".")[0]!.toUpperCase();
}

export function getShockProfile(ticker: string): TickerShockProfile {
  const raw = ticker.trim();
  const upper = raw.toUpperCase();
  const base = tickerBase(upper);
  const found =
    PROFILES[upper] ??
    PROFILES[raw] ??
    PROFILES[base];
  if (found) return found;

  const kind = resolveKind(upper, base);
  const profile = KIND_PROFILES[kind] ?? KIND_PROFILES.other!;
  if (raw.includes(".") && kind === "other") {
    return KIND_PROFILES.intl!;
  }
  return profile;
}

/** Fraction of the headline move applied to this ticker (0–1+). */
export function shockBeta(ticker: string, shock: ShockId): number {
  if (shock === "none") return 0;
  const p = getShockProfile(ticker);
  switch (shock) {
    case "broad_down15":
      return clamp(p.beta ?? 1, -1.2, 2.6);
    case "ai_down20":
      return p.ai;
    case "btc_winter35":
      return p.crypto;
    case "rates_up":
      return Math.max(0, -p.rates);
    case "tech_pullback10":
      return Math.max(0.08, (p.ai * 0.75 + Math.max(0, -p.rates) * 0.25) * (p.beta ?? 1.0));
    case "oil_shock25": {
      const e = p.energy ?? -0.2;
      return e > 0 ? e * 0.48 : Math.abs(e) * 0.2 * (p.beta ?? 1.0);
    }
    case "usd_surge7":
      return Math.abs(p.fx ?? -0.3);
    case "china_supply_shock":
      return p.supplyChain ?? (p.ai > 0.7 ? 0.8 : 0.2);
    case "soft_landing_rally": {
      const beta = p.beta ?? 1.0;
      return Math.max(0.15, beta * 0.6 + p.ai * 0.25 + p.crypto * 0.15);
    }
    default:
      return 0;
  }
}

function boundedMove(pct: number): number {
  return clamp(pct, -0.55, 0.45);
}

export function shockedPct(ticker: string, shock: ShockId): number {
  if (shock === "none") return 0;
  const meta = SHOCKS.find((s) => s.id === shock);
  if (!meta) return 0;

  if (shock === "oil_shock25") {
    const p = getShockProfile(ticker);
    const energySens = p.energy ?? -0.2;
    if (energySens > 0) {
      return boundedMove(0.12 * energySens);
    }
    return boundedMove(-0.05 * Math.max(0.2, -energySens) * (p.beta ?? 1.0));
  }

  if (shock === "usd_surge7") {
    const p = getShockProfile(ticker);
    const fxSens = p.fx ?? (ticker.includes(".") ? -0.85 : -0.3);
    return boundedMove(-0.07 * Math.abs(fxSens));
  }

  return boundedMove(meta.headlinePct * shockBeta(ticker, shock));
}

export function shockedPrice(
  ticker: string,
  spot: number,
  shock: ShockId
): number {
  if (!(spot > 0) || !Number.isFinite(spot) || shock === "none") {
    return finiteNumber(spot);
  }
  const pct = shockedPct(ticker, shock);
  return roundMoney(spot * (1 + pct));
}

export type ShockHoldingImpact = {
  ticker: string;
  label: string;
  shares: number;
  livePx: number;
  shockPx: number;
  liveVal: number;
  shockVal: number;
  deltaVal: number;
  deltaPct: number;
  movePct: number;
  lossSharePct: number;
};

export type ShockMarginAnalysis = {
  isUsingMargin: boolean;
  marginDebt: number;
  liveEquity: number;
  shockedEquity: number;
  liveLeverage: number;
  shockedLeverage: number;
  liveDebtToEquityPct: number;
  shockedDebtToEquityPct: number;
  maintenanceRate: number;
  liveMaintenanceReq: number;
  shockedMaintenanceReq: number;
  liveEquityCushion: number;
  shockedEquityCushion: number;
  shockedCushionPct: number;
  marginCallRisk: "safe" | "caution" | "critical";
  statusBlurb: string;
  liveCashPct: number;
  shockedCashPct: number;
};

export type PortfolioShockAnalysis = {
  shock: ShockId;
  scenario: ShockDefinition;
  liveHoldingsVal: number;
  shockedHoldingsVal: number;
  liveTotalVal: number;
  shockedTotalVal: number;
  deltaVal: number;
  deltaPct: number;
  cash: number;
  margin: ShockMarginAnalysis;
  rows: ShockHoldingImpact[];
  topVulnerability: ShockHoldingImpact | null;
  topShockAbsorber: ShockHoldingImpact | null;
  themeBreakdown: { theme: string; deltaVal: number; liveVal: number; pctOfLoss: number }[];
  tacticalNotes: string[];
};

/**
 * Computes end-to-end portfolio impact, leverage ratios, and margin cushion
 * under any selected macro shock scenario.
 */
export function analyzePortfolioShock(
  holdings: { ticker: string; shares: number; price: number }[],
  cash: number,
  shockId: ShockId
): PortfolioShockAnalysis {
  const scenario = SHOCKS.find((s) => s.id === shockId) ?? SHOCKS[0]!;

  const rows: ShockHoldingImpact[] = holdings
    .filter((h) => h.shares > 0 && h.price > 0)
    .map((h) => {
      const livePx = finiteNumber(h.price);
      const shockPx = shockedPrice(h.ticker, livePx, shockId);
      const liveVal = roundMoney(finiteNumber(h.shares) * livePx);
      const shockVal = roundMoney(finiteNumber(h.shares) * shockPx);
      const deltaVal = roundMoney(shockVal - liveVal);
      const deltaPct = safeDiv(deltaVal, liveVal);
      const movePct = shockedPct(h.ticker, shockId);
      const profile = getShockProfile(h.ticker);

      return {
        ticker: h.ticker,
        label: profile.label,
        shares: h.shares,
        livePx,
        shockPx,
        liveVal,
        shockVal,
        deltaVal,
        deltaPct,
        movePct,
        lossSharePct: 0,
      };
    })
    .sort((a, b) => a.deltaVal - b.deltaVal);

  const liveHoldingsVal = sumMoney(rows.map((r) => r.liveVal));
  const shockedHoldingsVal = sumMoney(rows.map((r) => r.shockVal));
  const cashAmt = finiteNumber(cash);
  const liveTotalVal = roundMoney(liveHoldingsVal + cashAmt);
  const shockedTotalVal = roundMoney(shockedHoldingsVal + cashAmt);
  const deltaVal = roundMoney(shockedTotalVal - liveTotalVal);
  const deltaPct = safeDiv(deltaVal, liveTotalVal);

  // Calculate share of total dollar drop / gain
  if (Math.abs(deltaVal) > 0) {
    for (const r of rows) {
      r.lossSharePct = safeDiv(r.deltaVal, deltaVal);
    }
  }

  // Margin and leverage analysis
  const isUsingMargin = cash < -50;
  const marginDebt = isUsingMargin ? Math.abs(cash) : 0;
  const liveEquity = liveTotalVal;
  const shockedEquity = shockedTotalVal;

  const liveLeverage = liveEquity > 0 ? Math.min(99, liveHoldingsVal / liveEquity) : 1;
  const shockedLeverage =
    shockedEquity > 0
      ? Math.min(99, shockedHoldingsVal / shockedEquity)
      : marginDebt > 0
        ? 99
        : 1;
  const liveDebtToEquityPct = liveEquity > 0 ? (marginDebt / liveEquity) * 100 : 0;
  const shockedDebtToEquityPct = shockedEquity > 0 ? (marginDebt / shockedEquity) * 100 : (marginDebt > 0 ? 999 : 0);

  const maintenanceRate = 0.30; // standard 30% maintenance margin
  const liveMaintenanceReq = liveHoldingsVal * maintenanceRate;
  const shockedMaintenanceReq = shockedHoldingsVal * maintenanceRate;
  const liveEquityCushion = liveEquity - liveMaintenanceReq;
  const shockedEquityCushion = shockedEquity - shockedMaintenanceReq;
  const shockedCushionPct = shockedEquity > 0 ? (shockedEquityCushion / shockedEquity) * 100 : -100;

  let marginCallRisk: "safe" | "caution" | "critical" = "safe";
  let statusBlurb = "Cash covers your portfolio. Nothing borrowed.";

  if (isUsingMargin) {
    if (shockedEquityCushion <= 0) {
      marginCallRisk = "critical";
      statusBlurb = "What you own drops below the broker's 30% floor. They could force a sale.";
    } else if (shockedCushionPct < 20) {
      marginCallRisk = "caution";
      statusBlurb = "Room before a forced sale drops below 20%. Borrowed money gets heavier in this scenario.";
    } else {
      marginCallRisk = "safe";
      statusBlurb = "Still enough room above the broker's floor.";
    }
  } else if (cash > 0) {
    statusBlurb = `Cash does not fall with the stocks. The cash share goes from ${(liveTotalVal > 0 ? (cash / liveTotalVal) * 100 : 0).toFixed(1)}% to ${(shockedTotalVal > 0 ? (cash / shockedTotalVal) * 100 : 0).toFixed(1)}% of your portfolio.`;
  }

  const liveCashPct = liveTotalVal > 0 ? (cash / liveTotalVal) * 100 : 0;
  const shockedCashPct = shockedTotalVal > 0 ? (cash / shockedTotalVal) * 100 : 0;

  const margin: ShockMarginAnalysis = {
    isUsingMargin,
    marginDebt,
    liveEquity,
    shockedEquity,
    liveLeverage,
    shockedLeverage,
    liveDebtToEquityPct,
    shockedDebtToEquityPct,
    maintenanceRate,
    liveMaintenanceReq,
    shockedMaintenanceReq,
    liveEquityCushion,
    shockedEquityCushion,
    shockedCushionPct,
    marginCallRisk,
    statusBlurb,
    liveCashPct,
    shockedCashPct,
  };

  // Top vulnerability and absorber
  const topVulnerability = rows.length > 0 && rows[0]!.deltaVal < 0 ? rows[0]! : null;
  const topShockAbsorber =
    rows.length > 0
      ? [...rows].sort((a, b) => b.deltaVal - a.deltaVal)[0] ?? null
      : null;

  // Theme loss aggregation
  const themeMap = new Map<string, { deltaVal: number; liveVal: number }>();
  for (const r of rows) {
    const existing = themeMap.get(r.label) ?? { deltaVal: 0, liveVal: 0 };
    existing.deltaVal += r.deltaVal;
    existing.liveVal += r.liveVal;
    themeMap.set(r.label, existing);
  }

  const themeBreakdown = [...themeMap.entries()]
    .map(([theme, data]) => ({
      theme,
      deltaVal: data.deltaVal,
      liveVal: data.liveVal,
      pctOfLoss: safeDiv(data.deltaVal, deltaVal) * 100,
    }))
    .sort((a, b) => a.deltaVal - b.deltaVal);

  // Tactical observations (dash-free)
  const tacticalNotes: string[] = [];
  if (shockId !== "none") {
    tacticalNotes.push(scenario.tacticalAction);

    if (isUsingMargin) {
      if (marginCallRisk === "critical") {
        tacticalNotes.push("Borrowed-money warning: what you own drops below the broker's floor.");
      } else if (marginCallRisk === "caution") {
        tacticalNotes.push(`Borrowed money goes from ${liveLeverage.toFixed(2)}x to ${shockedLeverage.toFixed(2)}x. Keep the debt in check.`);
      } else {
        tacticalNotes.push(`Still comfortable, with $${Math.max(0, Math.round(shockedEquityCushion)).toLocaleString()} of room before a forced sale.`);
      }
    } else if (cash > 0) {
      tacticalNotes.push(`Cash cushions the drop. Cash sitting ready grows to ${shockedCashPct.toFixed(1)}% of your portfolio.`);
    }

    if (topVulnerability && Math.abs(topVulnerability.lossSharePct) >= 0.35) {
      tacticalNotes.push(`${topVulnerability.ticker} represents ${(topVulnerability.lossSharePct * 100).toFixed(0)}% of the modeled drop.`);
    }
  }

  return {
    shock: shockId,
    scenario,
    liveHoldingsVal,
    shockedHoldingsVal,
    liveTotalVal,
    shockedTotalVal,
    deltaVal,
    deltaPct,
    cash,
    margin,
    rows,
    topVulnerability,
    topShockAbsorber,
    themeBreakdown,
    tacticalNotes,
  };
}
