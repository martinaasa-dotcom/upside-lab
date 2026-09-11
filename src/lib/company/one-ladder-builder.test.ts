import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { holdingLadders } from "@/lib/company/holding-ladders";

/**
 * ONE BUILDER IS NOT ENOUGH ON ITS OWN: IT HAS TO BE FED THE SAME THING.
 *
 * `holdingLadders` exists so the map, the list on Home, the alerts and
 * the Research room cannot draw three different ladders for one name.
 * That guarantee is only as good as its inputs, and the input that
 * decides the most is `closes`: it sets the step, and on a holding whose
 * target nobody has set it also sets the ANCHOR, because
 * `anchorForHolding` takes the middle of the range in that case.
 *
 * The circle's map shipped reading `dailyCloses`, which reads as the
 * better source (real consecutive closes, not a curve) and is about
 * three weeks of them, against the ninety day `sparkline` every other
 * caller passes. The cost is measured below and it is not subtle.
 */
describe("every surface builds a ladder from the same closes", () => {
  const read = (p: string) => readFileSync(p, "utf8");
  const CALLERS = [
    "src/components/Dashboard.tsx",
    "src/components/CommunityView.tsx",
  ];

  it("nobody feeds a ladder the fifteen day window", () => {
    for (const file of CALLERS) {
      const src = read(file);
      /*
        Read the `closes:` line of every `holdingLadders` call in the
        file. `dailyCloses` there is the bug this test is named after;
        it stays perfectly legal everywhere else, which is why this
        looks at the argument rather than at the whole file.
      */
      for (const call of src.matchAll(/holdingLadders\(\{[\s\S]*?\n {4}\}\)/g)) {
        const closes = [...call[0].matchAll(/closes:\s*([^\n]+)/g)].map(
          (m) => m[1]
        );
        expect(
          closes.length,
          `${file}: every holdingLadders call states its closes`
        ).toBeGreaterThan(0);
        for (const line of closes) {
          expect(
            line,
            `${file}: a ladder built from dailyCloses is built from about three weeks, and every other surface uses the ninety day sparkline`
          ).not.toMatch(/dailyCloses/);
          expect(line, `${file}: closes come from the sparkline`).toMatch(
            /sparkline/
          );
        }
      }
    }
  });

  it("the window is why, measured rather than asserted", () => {
    // A name that ran 100 to 150 over a quarter, read at 150.
    const ninety = Array.from({ length: 90 }, (_, i) => 100 + (50 * i) / 89);
    const fifteen = ninety.slice(-15);
    const spot = ninety[ninety.length - 1];
    const bandFor = (closes: number[]) =>
      holdingLadders({ rows: [{ ticker: "TEST", spot, closes, value: 1000 }] })[0]
        .ladder;

    const long = bandFor(ninety);
    const short = bandFor(fifteen);
    expect(long?.atId).toBe("trim-most");
    /*
      The short window does not nudge the reading, it inverts it: the
      anchor lands near the price, so a name a long way above its own
      estimate reads as sitting on it. If this ever stops differing,
      the two windows have converged and the rule above is free rather
      than load-bearing.
    */
    expect(short?.atId).toBe("hold");
    expect(long!.anchor).toBeLessThan(short!.anchor);
  });
});
