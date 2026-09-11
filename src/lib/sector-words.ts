/**
 * The provider's sector, said the way this app talks.
 *
 * Yahoo's `assetProfile.sector` is a GICS-shaped label written for people
 * who already work in finance: "Consumer Defensive", "Basic Materials",
 * "Financial Services". Printing those verbatim would put three words on
 * screen that a beginner cannot use, which is the one thing this product
 * is for.
 *
 * So every sector the provider can answer with has a sentence of its own
 * here, in the register the rest of the app already uses -- "Everyday
 * household goods", "Oil and gas" -- and two of these deliberately match
 * the wording `book-shock.ts` already ships for the same idea, so a reader
 * meeting Coca-Cola in two rooms meets one phrase.
 *
 * This is a fixed list because the provider's own taxonomy is a fixed
 * list. A sector that is not on it comes back null rather than being
 * tidied into title case and printed: an unrecognised value means the
 * provider changed its vocabulary, and the honest answer to that is to
 * say nothing until somebody has looked, not to print a word this app has
 * never seen.
 */

/**
 * The most names one sector lookup will answer about.
 *
 * It lives here rather than beside the fetch because both sides need it
 * and this is the only module in the pair that is safe on a client: the
 * fetch imports the provider SDK, and a hook reaching in for one number
 * pulled `node:module` into the browser bundle and took the whole Lab
 * route down with a Turbopack panic. A constant shared across that line
 * belongs in the module that has no dependencies.
 */
export const MAX_SECTOR_TICKERS = 60;

/**
 * Provider sector, normalised: lower case, single spaces, no punctuation.
 * Yahoo has shipped both "Financial Services" and "Financial", and both
 * "Real Estate" and "Realestate", so the key is the shape rather than the
 * spelling.
 */
function sectorKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z ]/g, "")
    .replace(/\s+/g, " ");
}

const SECTOR_WORDS: Record<string, string> = {
  technology: "Technology and software",
  "communication services": "Media, telecoms and internet",
  communications: "Media, telecoms and internet",
  "consumer cyclical": "Shops, brands and travel",
  "consumer discretionary": "Shops, brands and travel",
  "consumer defensive": "Everyday household goods",
  "consumer staples": "Everyday household goods",
  energy: "Oil, gas and energy",
  "financial services": "Banks and finance",
  financial: "Banks and finance",
  financials: "Banks and finance",
  healthcare: "Healthcare and medicines",
  "health care": "Healthcare and medicines",
  industrials: "Factories, machines and transport",
  "real estate": "Property",
  realestate: "Property",
  "basic materials": "Metals, chemicals and materials",
  materials: "Metals, chemicals and materials",
  utilities: "Electricity, water and gas",
};

/**
 * What a provider sector is called on screen, or null when this app has
 * never seen that sector before.
 */
export function sectorWords(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return SECTOR_WORDS[sectorKey(raw)] ?? null;
}

/** Every phrase this module can print, for tests and for the copy rules. */
export function allSectorWords(): string[] {
  return [...new Set(Object.values(SECTOR_WORDS))].sort();
}
