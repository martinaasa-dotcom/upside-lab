import { percent, signedPercent } from "@/lib/format";
import { allSectorWords } from "@/lib/sector-words";

/**
 * What the rest of a company's sector did today, from a fund anybody can
 * look up.
 *
 * Pulse's whole claim is that a fall was the market rather than the
 * company, and until now the sector half of that was said by the model:
 * cards carried sentences like "every similar business fell about as
 * much" with nothing behind them. That is the one shape this product does
 * not allow, a statement of fact the reader cannot check, and it was
 * sitting on the room the product is built around.
 *
 * So the comparison group is a real instrument. Each sector maps to the
 * sector fund that tracks it, the fund is named on screen, and the reader
 * can look up the same figure anywhere. Eleven symbols, all of them among
 * the most heavily traded funds there are, so the quote is CDN-cached and
 * shared by every reader rather than bought per portfolio.
 *
 * What it deliberately does not do is draw the conclusion.
 * `market-or-you.ts` already settled this for the portfolio-level version
 * and the argument is the same: saying "so this was the sector, not the
 * company" assumes a holding moves one for one with its sector, which is
 * wrong for every company that is not the average of its peers, invisible
 * to the reader, and exactly the hidden arithmetic this repo refuses. Both
 * figures, side by side, and the reader draws it.
 */

/**
 * Sector words to the fund that tracks that sector.
 *
 * The SPDR Select Sector funds, because they are the set with one fund per
 * sector, the same taxonomy the provider is answering with, and enough
 * volume that the price is never stale. `XLC` and `XLRE` are the two newer
 * ones and cover exactly the two sectors that had no fund before them.
 */
const SECTOR_FUND: Record<string, string> = {
  "Technology and software": "XLK",
  "Media, telecoms and internet": "XLC",
  "Shops, brands and travel": "XLY",
  "Everyday household goods": "XLP",
  "Oil, gas and energy": "XLE",
  "Banks and finance": "XLF",
  "Healthcare and medicines": "XLV",
  "Factories, machines and transport": "XLI",
  Property: "XLRE",
  "Metals, chemicals and materials": "XLB",
  "Electricity, water and gas": "XLU",
};

export function sectorFund(words: string | null | undefined): string | null {
  if (!words) return null;
  return SECTOR_FUND[words] ?? null;
}

/** Every fund this module can ask about, for the fetch. */
export function sectorFundsFor(sectorWords: (string | null | undefined)[]): string[] {
  const out = new Set<string>();
  for (const words of sectorWords) {
    const fund = sectorFund(words);
    if (fund) out.add(fund);
  }
  return [...out].sort();
}

/** Belt and braces: every sector this app can print has a fund behind it. */
export function everySectorHasAFund(): boolean {
  return allSectorWords().every((words) => sectorFund(words) != null);
}

/**
 * Below this the day is too quiet for the comparison to teach anything,
 * and printing two figures that both round to nothing is noise on a card.
 */
const QUIET_PCT = 0.002;

/**
 * Under a point apart, the two moved together and the difference is not
 * worth a clause: a tenth of a point between a company and its sector is
 * the ordinary wobble of one name against a hundred.
 */
const TOGETHER_PCT = 0.01;

export type SectorPeerRead = {
  /** The fund the figure came from, named on screen so it can be checked. */
  fund: string;
  sectorWords: string;
  sectorPct: number;
  ownPct: number;
  /** How far this company went beyond its own sector, signed. */
  gap: number;
};

export function sectorPeerRead(input: {
  sectorWords: string | null | undefined;
  ownPct: number | null | undefined;
  sectorPct: number | null | undefined;
}): SectorPeerRead | null {
  const fund = sectorFund(input.sectorWords);
  if (!fund || !input.sectorWords) return null;
  const { ownPct, sectorPct } = input;
  if (
    ownPct == null ||
    sectorPct == null ||
    !Number.isFinite(ownPct) ||
    !Number.isFinite(sectorPct)
  ) {
    return null;
  }
  // Both sides flat is a sentence about nothing.
  if (Math.abs(ownPct) < QUIET_PCT && Math.abs(sectorPct) < QUIET_PCT) {
    return null;
  }
  return {
    fund,
    sectorWords: input.sectorWords,
    sectorPct,
    ownPct,
    gap: ownPct - sectorPct,
  };
}

/**
 * The sentence. Two figures and no conclusion.
 *
 * The sector leads, because it is the new fact: the reader already knows
 * what their own holding did, and what they cannot see anywhere else is
 * whether the rest of that sector did the same. The fund is named in the
 * same breath rather than in a footnote, so the claim and the way to check
 * it arrive together.
 */
export function sectorPeerLine(read: SectorPeerRead): string {
  const sector = read.sectorWords.toLowerCase();
  const sectorMoved = signedPercent(read.sectorPct);
  const ownMoved = signedPercent(read.ownPct);
  const opening = `The rest of ${sector} moved ${sectorMoved} today, measured on the ${read.fund} fund. This one moved ${ownMoved}`;

  // Close enough that the difference is not the story.
  if (Math.abs(read.gap) < TOGETHER_PCT) return `${opening}.`;

  /*
    "Above" and "below", never "further".

    The first version said "further" for any gap, which is wrong in the
    commonest case there is: a company up 0.1% on a day its sector is up
    1.4% has not moved further than anything. Rendered on the real page it
    read "This one moved 0.0%, which is 1.4% further", under a card whose
    own figures contradicted it.

    Above and below are right whichever way both numbers point, because
    they describe where one sits against the other on the same scale: a
    5% fall against the sector's 1% is below it, and so is a 0.1% rise
    against the sector's 1.4%. Both are what the reader means.
  */
  const side = read.gap > 0 ? "above" : "below";
  return `${opening}, which is ${percent(Math.abs(read.gap))} ${side} that.`;
}
