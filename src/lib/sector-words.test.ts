import { describe, expect, it } from "vitest";

import { allSectorWords, sectorWords } from "@/lib/sector-words";
import { kindFromProviderSector } from "@/lib/book-shock";

describe("the provider's sector, in this app's words", () => {
  it("covers every sector the provider actually answers with", () => {
    /*
      Yahoo's `assetProfile.sector` is a fixed eleven-value taxonomy. A gap
      here is a hole in the middle of an ordinary portfolio, so the list is
      asserted rather than left to be discovered by a reader holding a
      utility.
    */
    const providerSectors = [
      "Technology",
      "Communication Services",
      "Consumer Cyclical",
      "Consumer Defensive",
      "Energy",
      "Financial Services",
      "Healthcare",
      "Industrials",
      "Real Estate",
      "Basic Materials",
      "Utilities",
    ];
    for (const sector of providerSectors) {
      expect(sectorWords(sector), sector).toBeTruthy();
    }
  });

  it("reads the shape rather than the spelling", () => {
    // Yahoo has shipped more than one spelling of several of these.
    expect(sectorWords("Financial")).toBe(sectorWords("Financial Services"));
    expect(sectorWords("real estate")).toBe(sectorWords("Real Estate"));
    expect(sectorWords("consumer_defensive")).toBe(
      sectorWords("Consumer Defensive")
    );
    expect(sectorWords("  TECHNOLOGY  ")).toBe(sectorWords("Technology"));
  });

  it("says nothing about a sector it has never seen", () => {
    /*
      Not tidied into title case and printed. An unrecognised value means
      the provider's taxonomy moved, and the honest answer is to say
      nothing until somebody has looked.
    */
    expect(sectorWords("Frobnication")).toBeNull();
    expect(sectorWords("")).toBeNull();
    expect(sectorWords(null)).toBeNull();
    expect(sectorWords(undefined)).toBeNull();
  });

  it("keeps the finance-desk register off the screen", () => {
    // The provider's own labels are the words this module exists to replace.
    const deskWords = [
      "Consumer Defensive",
      "Consumer Cyclical",
      "Basic Materials",
      "Financial Services",
      "Communication Services",
    ];
    for (const words of allSectorWords()) {
      for (const desk of deskWords) {
        expect(words).not.toBe(desk);
      }
    }
  });

  it("routes every sector to a profile the shock table already has", () => {
    /*
      The point of the whole change: these profiles were written and were
      only reachable through a hand-typed ticker list, so a staple not on
      the list got a plain large company's beta. Every sector must land on
      one, or an ordinary holding is back on the catch-all.
    */
    for (const words of allSectorWords()) {
      expect(kindFromProviderSector(words), words).toBeTruthy();
    }
    expect(kindFromProviderSector(null)).toBeNull();
    expect(kindFromProviderSector("something else")).toBeNull();
  });
});
