import { describe, expect, it } from "vitest";
import {
  listingAmountToUsd,
  listingCanConvert,
} from "@/lib/listing-currency";

/*
  A price this app cannot convert is a hole, not a dollar figure.

  `listingAmountToUsd` hands the amount back unchanged when it has no rate.
  That is the right shape for a field somebody is typing into: the number
  they see stays the number they typed. It is the wrong shape for a quote,
  where the amount is stored and printed as dollars from that point on. A
  Stockholm listing at 1,050 SEK became a holding worth $1,050, about ten
  times the truth, in the portfolio total, in Pulse, in the forecast, and in
  the Sunday letter, which states its figures as fact in an inbox.

  And the gap is not rare. `fetchFxRates` builds its table only from the
  pairs that answered, and the memo keeps a partial table for as long as
  anything is in it, so one bad minute on SEKUSD leaves EUR and GBP working
  and SEK quietly wrong for the life of the memo. Every has-any-rates check
  passes the whole time.

  This is the same choice the rest of the app already makes: fallbackQuotes
  is deliberately not wired into the live path, and weeklyNumbersAreSound
  refuses to send a letter rather than state a total it is unsure of.
*/

describe("listingCanConvert", () => {
  it("says yes for dollars with no table at all", () => {
    expect(listingCanConvert("USD", {})).toBe(true);
  });

  it("says no for a currency the table is missing", () => {
    // The exact shape a partial FX round leaves behind.
    const partial = { EUR: 1.08, GBP: 1.27 };
    expect(listingCanConvert("SEK", partial)).toBe(false);
    expect(listingCanConvert("EUR", partial)).toBe(true);
  });

  it("says no for a rate that is zero or negative", () => {
    expect(listingCanConvert("SEK", { SEK: 0 })).toBe(false);
    expect(listingCanConvert("SEK", { SEK: -1 })).toBe(false);
  });

  it("is case-insensitive, as the codes on quotes are not consistent", () => {
    expect(listingCanConvert("sek", { SEK: 0.095 })).toBe(true);
  });
});

describe("the conversion itself is unchanged for the paths that want it", () => {
  it("still returns the amount for a form field with no rate", () => {
    /*
      Deliberate: the reader typed 1050 into a field labelled SEK and the
      figure they are shown must not silently become something else while
      they are still typing. The quote path asks listingCanConvert first
      instead of relying on this.
    */
    expect(listingAmountToUsd(1050, "SEK", { EUR: 1.08 })).toBe(1050);
  });

  it("converts when it can", () => {
    expect(listingAmountToUsd(1050, "SEK", { SEK: 0.095 })).toBeCloseTo(99.75, 2);
  });
});
