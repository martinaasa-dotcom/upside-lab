import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { daySize, typicalMoveFromCloses } from "@/lib/typical-move";
import { isBigPulseMove } from "@/lib/thesis-pulse";

const page = readFileSync(
  join(process.cwd(), "src/components/PulsePage.tsx"),
  "utf8"
);

/**
 * A steady name and a jumpy one, each having the same kind of day relative
 * to itself. Built rather than typed so the two series genuinely differ in
 * how far they usually travel.
 */
function closes(startPrice: number, dailyMovePct: number, days = 40): number[] {
  const out: number[] = [];
  let price = startPrice;
  for (let i = 0; i < days; i++) {
    // Alternating, so the median absolute move is exactly dailyMovePct.
    price = price * (1 + (i % 2 === 0 ? dailyMovePct : -dailyMovePct));
    out.push(price);
  }
  return out;
}

describe("Pulse means one thing by an unusual day", () => {
  /*
   * The room's summary sentence (`unusualDayLine`) measures every holding
   * against its own ordinary day. The grouping under it used to split on
   * `isBigPulseMove`, a flat 5% for every name, so the page could say "2 of
   * your 8 holdings moved more than usual today" and then show no "Needs a
   * look" section at all -- a reader told two names did something and never
   * shown which two. These two cases are why one threshold cannot stand in
   * for the other.
   */
  it("disagrees with a flat threshold in both directions", () => {
    const steady = typicalMoveFromCloses(closes(100, 0.003));
    const jumpy = typicalMoveFromCloses(closes(100, 0.06));
    expect(steady).not.toBeNull();
    expect(jumpy).not.toBeNull();

    // A steady name having a genuinely big day for itself, well under 5%.
    const steadyDay = 0.025;
    expect(daySize(steadyDay, steady!)).not.toBe("ordinary");
    expect(isBigPulseMove(steadyDay)).toBe(false);

    // A jumpy name having an ordinary day for itself, well over 5%.
    const jumpyDay = 0.06;
    expect(daySize(jumpyDay, jumpy!)).toBe("ordinary");
    expect(isBigPulseMove(jumpyDay)).toBe(true);
  });

  it("splits the room on the per-name reading, not the flat one", () => {
    // The set the grouping is built from is measured with `daySize` against
    // each name's own typical move, which is what the summary sentence uses.
    const block = page.slice(
      page.indexOf("const unusualTickers"),
      page.indexOf("const attention")
    );
    expect(block.length).toBeGreaterThan(0);
    expect(block).toMatch(/daySize\(/);
    expect(block).toMatch(/typicalByTicker/);

    /*
     * And the predicate the split actually runs consults that set. Checking
     * only that the set is computed is not enough: the fault this test
     * exists for is a grouping that judges on the flat threshold alone,
     * which a file can still do with a perfectly correct per-name set sitting
     * unused a few lines above it.
     */
    const setAside = page.slice(
      page.indexOf("const isSetAside"),
      page.indexOf("const attention")
    );
    expect(setAside.length).toBeGreaterThan(0);
    expect(setAside).toMatch(/unusualTickers\.has\(/);

    // And both halves of the split are the same predicate, so a name cannot
    // fall into neither or into both.
    expect(page).toMatch(/const isSetAside = useCallback\(/);
    expect(page).toMatch(/\(c\) => c\.ticker\.toUpperCase\(\) !== pinnedTicker && isSetAside\(c\)/);
    expect(page).toMatch(/\(c\) => c\.ticker\.toUpperCase\(\) !== pinnedTicker && !isSetAside\(c\)/);
  });

  it("keeps the flat threshold as a floor for names with no ordinary day", () => {
    /*
     * A provider that gave too short a series leaves a name with no
     * per-name answer at all. `isBigMove` stays in the predicate so a 5%
     * day on one of those is still surfaced rather than silently filed
     * under everything else.
     */
    expect(typicalMoveFromCloses([100, 101])).toBeNull();
    const setAside = page.slice(
      page.indexOf("const isSetAside"),
      page.indexOf("const attention")
    );
    expect(setAside).toMatch(/c\.isBigMove/);
  });
});
