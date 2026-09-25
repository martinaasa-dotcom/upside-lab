import { describe, expect, it } from "vitest";
import { callDelta, impliedVol } from "@/lib/options/black-scholes";

/*
  Real contracts, read off a broker's own options screen on 2026-09-25
  after the close, with the share price and the option's bid and ask Yahoo
  was quoting at the same moment. The broker's delta is the reference; this
  app solves the volatility from the mid and works delta out itself, and
  the two have to agree to within a hundredth. They did, all nine, to within
  0.006: this test exists because a card describing the wrong contract
  looked exactly like a wrong delta, and the arithmetic deserved a baseline
  that is not the arithmetic itself.

  Years are the time to the 16:00 New York bell on expiry from that
  evening, which is what `yearsToExpiry` would have answered.
*/
const CASES: {
  name: string;
  spot: number;
  strike: number;
  bid: number;
  ask: number;
  years: number;
  broker: number;
}[] = [
  { name: "NBIS Nov 20 '26 250", spot: 237.33, strike: 250, bid: 26.2, ask: 27.1, years: 0.154, broker: 0.512 },
  { name: "BMNR Nov 20 '26 29", spot: 27.54, strike: 29, bid: 2.72, ask: 2.81, years: 0.154, broker: 0.501 },
  { name: "CRWV Nov 20 '26 95", spot: 87.59, strike: 95, bid: 7.85, ask: 8.1, years: 0.154, broker: 0.464 },
  { name: "RKLB Nov 20 '26 75", spot: 73.95, strike: 75, bid: 8.3, ask: 8.65, years: 0.154, broker: 0.548 },
  { name: "MU Jan 15 '27 1110", spot: 1082.28, strike: 1110, bid: 134.1, ask: 139.95, years: 0.307, broker: 0.552 },
  { name: "BE Jun 16 '28 180", spot: 288.65, strike: 180, bid: 168, ask: 172, years: 1.726, broker: 0.855 },
  { name: "BMNR Jun 16 '28 13", spot: 27.54, strike: 13, bid: 17.6, ask: 18.75, years: 1.726, broker: 0.906 },
  { name: "RKLB Jun 16 '28 50", spot: 73.95, strike: 50, bid: 37, ask: 41.5, years: 1.726, broker: 0.836 },
  { name: "MU Jun 16 '28 1000", spot: 1082.28, strike: 1000, bid: 392, ask: 405.2, years: 1.726, broker: 0.727 },
];

describe("delta against a broker's own figures", () => {
  for (const c of CASES) {
    it(`${c.name} lands within 0.01 of the broker's ${c.broker}`, () => {
      const vol = impliedVol((c.bid + c.ask) / 2, c.spot, c.strike, c.years);
      expect(vol).not.toBeNull();
      const delta = callDelta(c.spot, c.strike, c.years, vol!);
      expect(delta).not.toBeNull();
      expect(Math.abs(delta! - c.broker)).toBeLessThan(0.01);
    });
  }
});
