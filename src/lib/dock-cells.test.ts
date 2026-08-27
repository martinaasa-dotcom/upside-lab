/**
 * The dock's whole point is that it costs one cell per portfolio you
 * actually own, so these cases are the shape of the bar for real books:
 * nobody, one sheet, a household's four, and the long book that has to
 * fold. The thresholds are allowed to move; what must not come back is a
 * row that keeps space open for sheets that are not there, or one that
 * squeezes its labels into stubs when they are.
 */
import { describe, expect, it } from "vitest";

import {
  ADD_CELL_PX,
  dockFoldsSheets,
  GAP_PX,
  MAX_DOCK_CELLS,
  MIN_CELL_PX,
  PAD_PX,
} from "@/lib/dock-cells";

/** The everyday book in the row: Home, Pulse, Lab, Growth. */
const ALL_MODES = 4;
/** Novice hides Lab. Pulse and Growth stay. */
const TIER_MODES = 3;
/** The page column at 1280px and up: 1200 max, less `px-6` either side. */
const WIDE = 1152;

describe("dockFoldsSheets", () => {
  it("keeps the everyday book in the row", () => {
    // No sheets, one sheet, and Martin's four-sheet household.
    for (const sheets of [0, 1, 2, 3, 4]) {
      expect(dockFoldsSheets(ALL_MODES, sheets, WIDE, true), `${sheets}`).toBe(
        false
      );
    }
  });

  it("folds once the row would outgrow the cell budget", () => {
    expect(dockFoldsSheets(ALL_MODES, 5, WIDE, true)).toBe(true);
    expect(dockFoldsSheets(ALL_MODES, 12, WIDE, true)).toBe(true);
  });

  it("counts Circle, so the last inline sheet fills the row exactly", () => {
    const lastInline = MAX_DOCK_CELLS - ALL_MODES - 1;
    expect(dockFoldsSheets(ALL_MODES, lastInline, WIDE, true)).toBe(false);
    expect(dockFoldsSheets(ALL_MODES, lastInline + 1, WIDE, true)).toBe(true);
  });

  it("gives a hidden section's cell back to the sheets", () => {
    const lastInline = MAX_DOCK_CELLS - ALL_MODES - 1;
    expect(dockFoldsSheets(TIER_MODES, lastInline + 1, WIDE, true)).toBe(false);
  });

  it("folds a row that fits the count but not the width", () => {
    // A small laptop at the `md` boundary: 768 viewport, less `px-6`.
    const narrow = 720;
    expect(dockFoldsSheets(ALL_MODES, 4, narrow, true)).toBe(true);
    expect(dockFoldsSheets(ALL_MODES, 4, WIDE, true)).toBe(false);
  });

  it("folds at exactly one pixel under the room it needs", () => {
    const cells = ALL_MODES + 1 + 3;
    // The pill's own padding and the gaps between tracks count too: the dock
    // floats over the page rather than filling a bar, so that chrome is width
    // the cells never get.
    const tracks = cells + 1; // the add cell
    const exact =
      cells * MIN_CELL_PX + ADD_CELL_PX + PAD_PX + (tracks - 1) * GAP_PX;
    expect(dockFoldsSheets(ALL_MODES, 3, exact, true)).toBe(false);
    expect(dockFoldsSheets(ALL_MODES, 3, exact - 1, true)).toBe(true);
  });

  it("assumes the row fits until it has been measured", () => {
    expect(dockFoldsSheets(ALL_MODES, 4, null, true)).toBe(false);
    expect(dockFoldsSheets(ALL_MODES, 0, 0, true)).toBe(false);
  });
});
