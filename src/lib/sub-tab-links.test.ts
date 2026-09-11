/**
 * A sub-tab writes the address from the press, never from an effect.
 *
 * Both rooms with sub-tabs had the same bug and it silently broke every
 * deep link into either of them. The read happens in a layout effect
 * (`useHydratedCache`) and the mirror was a passive effect, and nothing
 * orders the re-render from the first ahead of the second: the mirror
 * fired while the tab was still the server's fallback and wrote that
 * fallback over whatever parameter the reader had arrived on. React's
 * development double-invoke then re-read the clobbered address and made
 * the wrong tab permanent.
 *
 * Measured against the running app before the fix: `?labtab=risk`,
 * `?labtab=trends` and `?labtab=seasonality` all landed on The mix with
 * the address rewritten to `alloc`, and `?growthtab=retirement` landed on
 * the compound calculator with the address rewritten to `compound`.
 *
 * These read text, so they are a floor rather than a proof: a mirror moved
 * into a helper is beyond them. What they catch is the shape somebody
 * reaches for first, which is the shape that was there.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const ROOMS = [
  { file: "src/components/LabSheet.tsx", param: "labtab" },
  { file: "src/components/GrowthRoom.tsx", param: "growthtab" },
] as const;

/** The body of every `useEffect(...)` call in a file, roughly. */
function effectBodies(src: string): string[] {
  const out: string[] = [];
  let from = 0;
  for (;;) {
    const start = src.indexOf("useEffect(", from);
    if (start < 0) break;
    let depth = 0;
    let i = src.indexOf("(", start);
    const open = i;
    for (; i < src.length; i++) {
      if (src[i] === "(") depth++;
      else if (src[i] === ")") {
        depth--;
        if (depth === 0) break;
      }
    }
    out.push(src.slice(open, i));
    from = i;
  }
  return out;
}

describe("a sub-tab writes its own address", () => {
  for (const { file, param } of ROOMS) {
    const src = readFileSync(file, "utf8");

    it(`${file} still mirrors ${param} somewhere`, () => {
      expect(src).toContain(`searchParams.set("${param}"`);
    });

    it(`${file} does not write ${param} from an effect`, () => {
      const guilty = effectBodies(src).filter((body) =>
        body.includes(`searchParams.set("${param}"`)
      );
      expect(guilty).toEqual([]);
    });

    it(`${file} keeps the router's own history state`, () => {
      /*
        The App Router stores its routing state in `history.state`, so
        replacing it with `null` leaves Back and Forward working from an
        entry the router no longer recognises.
      */
      /*
        The rule, not today's indentation. An earlier version of this
        assertion pinned the exact whitespace of one call site and failed
        the moment the other room wrapped its copy in a callback, which is
        the kind of test this repository already records as costing more
        than it protects.
      */
      expect(src).toMatch(/replaceState\(\s*window\.history\.state\s*,/);
      expect(src).not.toMatch(/replaceState\(\s*null/);
    });
  }
});
