import { describe, expect, it } from "vitest";

import {
  everySectorHasAFund,
  sectorFund,
  sectorFundsFor,
  sectorPeerLine,
  sectorPeerRead,
} from "@/lib/sector-peers";
import { allSectorWords } from "@/lib/sector-words";

describe("what the rest of the sector did", () => {
  it("has a fund behind every sector this app can print", () => {
    /*
      A sector with no fund is a card that can never make the comparison,
      and the reader cannot tell that from one that simply had a quiet day.
    */
    expect(everySectorHasAFund()).toBe(true);
    for (const words of allSectorWords()) {
      expect(sectorFund(words), words).toMatch(/^XL[A-Z]{1,2}$/);
    }
  });

  it("asks for each fund once, whatever the portfolio holds", () => {
    const funds = sectorFundsFor([
      "Everyday household goods",
      "Everyday household goods",
      "Technology and software",
      null,
      "not a sector",
    ]);
    expect(funds).toEqual(["XLK", "XLP"]);
  });

  it("says nothing when there is nothing to compare", () => {
    const base = { sectorWords: "Everyday household goods" };
    expect(sectorPeerRead({ ...base, ownPct: null, sectorPct: -0.02 })).toBeNull();
    expect(sectorPeerRead({ ...base, ownPct: -0.02, sectorPct: null })).toBeNull();
    // A sector with no fund, and a holding with no sector.
    expect(
      sectorPeerRead({ sectorWords: null, ownPct: -0.02, sectorPct: -0.02 })
    ).toBeNull();
    // Both sides flat is a sentence about nothing.
    expect(sectorPeerRead({ ...base, ownPct: 0.0005, sectorPct: -0.0004 })).toBeNull();
  });

  it("names the fund, so the figure can be checked", () => {
    const read = sectorPeerRead({
      sectorWords: "Everyday household goods",
      ownPct: -0.005,
      sectorPct: -0.004,
    })!;
    const line = sectorPeerLine(read);
    expect(line).toContain("XLP");
    expect(line).toContain("everyday household goods");
  });

  it("draws no conclusion from the two figures", () => {
    /*
      The rule `market-or-you.ts` already settled. Saying "so this was the
      sector rather than the company" assumes a holding moves one for one
      with its peers, which is wrong for any company that is not the
      average of them, invisible to the reader, and the hidden arithmetic
      this repo refuses elsewhere.
    */
    const cases = [
      { ownPct: -0.05, sectorPct: -0.048 },
      { ownPct: -0.05, sectorPct: 0.002 },
      { ownPct: 0.09, sectorPct: -0.01 },
    ];
    for (const c of cases) {
      const line = sectorPeerLine(
        sectorPeerRead({ sectorWords: "Technology and software", ...c })!
      );
      for (const banned of [
        "so this was",
        "because",
        "means the",
        "rather than the company",
        "nothing to worry",
        "news",
      ]) {
        expect(line.toLowerCase()).not.toContain(banned);
      }
    }
  });

  it("says how far a company went beyond its own sector, only when it did", () => {
    const together = sectorPeerLine(
      sectorPeerRead({
        sectorWords: "Technology and software",
        ownPct: -0.021,
        sectorPct: -0.019,
      })!
    );
    expect(together).not.toContain("further");

    const apart = sectorPeerLine(
      sectorPeerRead({
        sectorWords: "Technology and software",
        ownPct: -0.09,
        sectorPct: -0.01,
      })!
    );
    expect(apart).toContain("8.0% below that");
  });

  it("says above or below, never 'further'", () => {
    /*
      "Further" is wrong in the commonest case there is. A company up 0.1%
      on a day its sector is up 1.4% has not moved further than anything,
      and the first version said so on the real page, under figures that
      contradicted it.
    */
    const behind = sectorPeerLine(
      sectorPeerRead({
        sectorWords: "Technology and software",
        ownPct: 0.001,
        sectorPct: 0.014,
      })!
    );
    expect(behind).not.toContain("further");
    expect(behind).toContain("below that");

    const ahead = sectorPeerLine(
      sectorPeerRead({
        sectorWords: "Technology and software",
        ownPct: 0.05,
        sectorPct: 0.01,
      })!
    );
    expect(ahead).toContain("above that");

    // A bigger fall than the sector's is below it, not above.
    const worse = sectorPeerLine(
      sectorPeerRead({
        sectorWords: "Technology and software",
        ownPct: -0.05,
        sectorPct: -0.01,
      })!
    );
    expect(worse).toContain("below that");
  });
});
