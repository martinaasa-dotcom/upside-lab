/**
 * `quotes.test.ts` mocks the market layer whole, so it has to restate the
 * two ceilings as literals. This is the file that stops those literals
 * drifting away from the real ones and leaving that suite asserting a
 * bound the product no longer has.
 */
import { describe, expect, it } from "vitest";
import {
  MAX_TICKERS_PER_REQUEST,
  MAX_UNKNOWN_NAMES_PER_REQUEST,
} from "@/lib/market/quotes";
import { UNRESOLVED_LIMIT } from "@/lib/market/unresolved-budget";

describe("quote request ceilings", () => {
  it("are the numbers the route test mocks", () => {
    expect(MAX_TICKERS_PER_REQUEST).toBe(120);
    expect(MAX_UNKNOWN_NAMES_PER_REQUEST).toBe(25);
  });

  it("leave an address a couple of full requests per window", () => {
    // A ceiling at or above the whole budget would let one request spend
    // the window, which is the burst this bound exists to break up.
    expect(MAX_UNKNOWN_NAMES_PER_REQUEST).toBeLessThan(UNRESOLVED_LIMIT);
    expect(MAX_UNKNOWN_NAMES_PER_REQUEST).toBeLessThan(MAX_TICKERS_PER_REQUEST);
  });
});
