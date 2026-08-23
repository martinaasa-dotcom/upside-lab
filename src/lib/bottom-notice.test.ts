/**
 * A notice pinned to the bottom of the window must not carry its own
 * height off that bottom.
 *
 * The measurement question did, as
 * `bottom-[max(5.75rem,calc(var(--dock-pad,5.5rem)+5.5rem))]`, which is two
 * guesses about other components stacked on each other: a dock's worth of
 * clearance, then Margus's button on top of it. `--dock-pad` is only
 * written once a dock renders, so on the sign-in screen, /privacy and
 * /terms the fallback stood in for a dock that is not there, and the
 * question floated 176px up an otherwise empty page, nowhere near the
 * corner a reader looks in.
 *
 * `.bottom-notice` reads what is really drawn down there instead, from the
 * `data-dock` and `data-bottom-corner` flags that `use-dock-pad.ts`
 * publishes on <html>. Asserted against the source, because the bug is a
 * number typed at a call site rather than anything a render would show.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const CSS = readFileSync("src/app/globals.css", "utf8");
const DOCK_PAD = readFileSync("src/lib/use-dock-pad.ts", "utf8");

/** Every notice that pins itself to the bottom of the window. */
const NOTICES = [
  "src/components/AnalyticsConsentBanner.tsx",
  "src/components/OfflineBanner.tsx",
  "src/components/ScrollCue.tsx",
];

describe("bottom notices", () => {
  for (const path of NOTICES) {
    const source = readFileSync(path, "utf8");

    it(`${path} takes its height from .bottom-notice`, () => {
      expect(source).toContain("bottom-notice");
    });

    it(`${path} hardcodes no bottom offset`, () => {
      expect(source, "a bottom-* utility on the notice itself").not.toMatch(
        /className="[^"]*\bbottom-\[/
      );
      expect(source, "--dock-pad read at the call site").not.toContain(
        "var(--dock-pad"
      );
    });
  }

  it("places a notice from what is drawn, not from a fallback", () => {
    expect(CSS).toMatch(/\.bottom-notice\s*\{/);
    expect(CSS, "lifted over a dock").toContain(
      ":root[data-dock] .bottom-notice"
    );
    expect(CSS, "lifted over Margus in the same corner").toContain(
      ":root[data-bottom-corner] .bottom-notice.bottom-notice-corner"
    );
  });

  it("publishes both flags from a measurement", () => {
    for (const flag of ["data-dock", "data-bottom-corner"]) {
      expect(DOCK_PAD, `${flag} is set`).toContain(
        `root.setAttribute("${flag}"`
      );
      expect(DOCK_PAD, `${flag} is removed again`).toContain(
        `root.removeAttribute("${flag}")`
      );
    }
    expect(DOCK_PAD, "the flags come off a measured rect").toContain(
      "getBoundingClientRect"
    );
  });

  it("hands the hooks a node, so a portal move re-registers", () => {
    for (const path of [
      "src/components/PortfolioTabs.tsx",
      "src/components/mobile/MobileTabBar.tsx",
    ]) {
      const source = readFileSync(path, "utf8");
      expect(source, `${path} uses a callback ref`).toContain("ref={setDockEl}");
      expect(source, `${path} passes the node`).toContain("useDockPad(dockEl)");
    }
  });
});
