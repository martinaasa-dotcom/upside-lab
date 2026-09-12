/**
 * The dock is one centred, content-sized well: its width is the number of
 * cells times a fixed cell width. That makes the cell count the thing that
 * must not move, and the failure it causes is unmistakable — walk from the
 * book to Circle and the whole bar resizes and re-centres under the cursor,
 * every label sliding sideways mid-click.
 *
 * That is exactly what `hideAdd={!onBook}` did: the add cell vanished the
 * moment you left the book, so a nine-cell row became eight. The rule it
 * broke is the one worth holding: **whether a cell exists may depend on
 * your data, never on which page you are looking at.**
 *
 * Asserted against the source rather than a render, because the bug was in
 * the wiring, not in the dock. `BookModeDock` was right both times; it was
 * handed a different cell set on different routes.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const DASHBOARD = readFileSync("src/components/Dashboard.tsx", "utf8");

/** The `<PortfolioTabs ... />` call, which is where the props are wired. */
function dockProps(): string {
  const start = DASHBOARD.indexOf("<PortfolioTabs");
  expect(start, "Dashboard renders the dock").toBeGreaterThan(-1);
  const end = DASHBOARD.indexOf("/>", start);
  expect(end, "the dock call is self-closing").toBeGreaterThan(start);
  return DASHBOARD.slice(start, end);
}

/** Props that change how many cells the row draws. */
const WIDTH_PROPS = ["portfolios", "hiddenModeIds", "hideAdd", "guest"];

/*
  THE TWO DOCKS SAY THE SAME WORD FOR THE SAME ROOM.

  `BookModeDock` keeps its own `MODES` list, because the wide bar and the
  phone bar are different shapes: one carries a label and a cell per
  portfolio, the other is glyph-only and ends on Circle. What must not
  differ is the word. `BookModeDock`'s own comment says so -- "The labels
  are the phone bar's: Home, Pulse, Lab, Growth, Circle" -- and nothing
  held it, so a rename on either side would leave one dock calling a room
  something the other does not.

  The phone bar's `shortLabel` is the canonical word, since `DOCK_TABS`
  carries both a long `label` ("Overview") and the short one the bars
  actually print.
*/
describe("both docks call a room the same thing", () => {
  const wide = readFileSync("src/components/BookModeDock.tsx", "utf8");
  const phone = readFileSync("src/components/mobile/MobileTabBar.tsx", "utf8");

  it("uses the phone bar's short label for every section cell", () => {
    const modes = wide.slice(wide.indexOf("const MODES = ["));
    const labels = [
      ...modes
        .slice(0, modes.indexOf("] as const;"))
        .matchAll(/label:\s*"([^"]+)"/g),
    ].map((m) => m[1]!);
    expect(labels.length, "no section labels found in BookModeDock").toBe(4);
    const shortLabels = new Set(
      [...phone.matchAll(/shortLabel:\s*"([^"]+)"/g)].map((m) => m[1]!)
    );
    expect(shortLabels.size, "no shortLabels found in MobileTabBar").toBeGreaterThan(0);
    for (const label of labels) {
      expect(
        shortLabels.has(label),
        `the wide dock calls a room "${label}" and the phone bar has no ` +
          `cell by that name, so the two bars now disagree`
      ).toBe(true);
    }
  });
});

describe("bottom dock width", () => {
  it("takes no width-determining prop from the route", () => {
    const props = dockProps();
    for (const name of WIDTH_PROPS) {
      const match = props.match(new RegExp(`${name}=\\{([^}]*)\\}`));
      if (!match) continue;
      expect(match[1], `${name} is wired to a route check`).not.toMatch(
        /onBook|pathname|isMetaTab|isOverview|isCompound|isLab|isPulse|isAlerts/
      );
    }
  });

  it("still wires the add cell to something, so it is reachable", () => {
    const props = dockProps();
    expect(props).toMatch(/hideAdd=\{/);
    expect(props).toMatch(/onAdd=\{/);
  });

  it("leaves route-dependent props alone — only width is the invariant", () => {
    // `activeId` and the context-menu handlers may vary by page: neither
    // adds or removes a cell. Guarding them too would be a false rule.
    const props = dockProps();
    expect(props).toMatch(/activeId=\{onBook \? activeId : null\}/);
  });
});
