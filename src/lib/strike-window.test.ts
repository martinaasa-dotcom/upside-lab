import { describe, expect, it } from "vitest";
import { buildStrikeAlerts } from "@/lib/alerts";

/*
  "Closing in" has to mean approaching.

  The gate was `spot >= nextStrike * 0.98`, which is true two per cent below
  the level and equally true eighty per cent above it. `nextStrike` is
  derived from the reader's own stock target when they have set one, so any
  hand-set target the price has since run past produced a daily card saying
  "The price is within about 2% of $X" about a level the price was nowhere
  near. A figure this app states as fact is never rounded up into existence,
  and this one was not rounded at all.
*/

function row(spot: number, nextStrike: number) {
  return [{ ticker: "AAPL", spot, nextStrike, stockTarget: null }];
}

function ids(alerts: { id: string }[]) {
  return alerts.map((a) => a.id);
}

describe("the strike window", () => {
  it("says closing in only while the price is still below the level", () => {
    const alerts = buildStrikeAlerts(row(99, 100));
    expect(ids(alerts)).toContain("strike-near-$AAPL");
  });

  it("says nothing at all while the price is far below", () => {
    expect(buildStrikeAlerts(row(80, 100))).toEqual([]);
  });

  it("does not claim within about 2% of a level the price has run past", () => {
    const alerts = buildStrikeAlerts(row(180, 100));
    const detail = alerts.map((a) => a.detail).join(" ");
    expect(
      detail.includes("within about 2%"),
      `The price is 80% above the level and the card said it was within ` +
        `about 2% of it.`
    ).toBe(false);
    expect(ids(alerts)).toContain("strike-past-$AAPL");
  });

  it("names the real distance once the price is past", () => {
    const alerts = buildStrikeAlerts(row(150, 100));
    expect(alerts[0]!.detail).toContain("50.0%");
  });

  it("treats exactly at the level as past rather than approaching", () => {
    expect(ids(buildStrikeAlerts(row(100, 100)))).toContain("strike-past-$AAPL");
  });
});
