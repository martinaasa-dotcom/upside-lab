/**
 * The cache tags a company page is filed under, in a file of their own.
 *
 * The builder (`page-build.ts`) clears a company's public page the moment
 * it writes a new brief, and the loader (`page-data.ts`) is the file that
 * files the page under these tags and imports the builder. Keeping the
 * names here is what lets both of them use one spelling without the two
 * files importing each other.
 */
import { normalizeResearchTicker } from "@/lib/research/universe";

/** Cleared when a new brief is written for this company. */
export function researchPageTag(ticker: string): string {
  return `research-page:${normalizeResearchTicker(ticker)}`;
}

/** Cleared when something changes for every page at once. */
export const RESEARCH_ALL_TAG = "research-pages";
