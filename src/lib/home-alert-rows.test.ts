import { describe, expect, it } from "vitest";
import {
  HOME_ALERTS_SHOWN,
  buildDecisionAlerts,
  buildEarningsAlerts,
  buildLadderAlerts,
  buildStrikeAlerts,
  homeAlertRows,
  type UpsideAlert,
} from "@/lib/alerts";

const ladder = (bandId: string, bandLabel: string, edited = false) =>
  buildLadderAlerts([
    { ticker: "NBIS", spot: 236.92, bandId, bandLabel, edge: 237.99, edited },
  ])[0]!;

describe("Home draws alerts as rows, each saying what kind of thing it is", () => {
  it("gives every builder's alert a digest with a kind, a phrase and a figure", () => {
    const all: UpsideAlert[] = [
      ...buildEarningsAlerts([{ ticker: "MU", date: "2026-09-30", days: 5 }]),
      ladder("starter", "A little below"),
      ...buildStrikeAlerts([
        { ticker: "AAPL", spot: 240, stockTarget: 220, nextStrike: 238 },
      ]),
      ...buildDecisionAlerts({
        cash: 0,
        equityValue: 1000,
        topTicker: { ticker: "NVDA", value: 600 },
      }),
    ];
    for (const a of all) {
      expect(a.digest, a.id).toBeDefined();
      expect(a.digest!.tag.length).toBeGreaterThan(0);
      expect(a.digest!.what).not.toMatch(/[.!?]$/);
      expect(a.digest!.figure).toBeTruthy();
      for (const t of [a.digest!.tag, a.digest!.what, a.digest!.note ?? ""]) {
        expect(t).not.toMatch(/[–—]/);
        expect(t).not.toMatch(/\b(you should|buy|sell|trim|add more)\b/i);
      }
    }
  });

  it("says a results day as when, with the date beside it", () => {
    const [a] = buildEarningsAlerts([{ ticker: "MU", date: "2026-09-30", days: 5 }]);
    expect(a!.digest!.figure).toBe("In 5 days");
    expect(a!.digest!.note).toMatch(/30/);
  });

  it("keeps a fair value zone row's note to the gap and the level, short enough for one line", () => {
    for (const edited of [false, true]) {
      const note = ladder("starter", "A little below", edited).digest!.note!;
      expect(note).toBe("0.4% under $237.99");
      expect(note.length).toBeLessThanOrEqual(24);
    }
    const row = ladder("starter", "A little below").digest!;
    expect(row.tag).toBe("Fair value zones");
    expect(row.what).toBe("A little below fair value");
  });

  it("titles a ladder moment by where the price is, never by an old instruction", () => {
    for (const [id, label] of [
      ["trim-most", "A long way above"],
      ["trim-some", "A little above"],
      ["starter", "A little below"],
      ["full-aggressive", "A long way below"],
    ] as const) {
      const title = ladder(id, label).title;
      expect(title).toMatch(/fair value/);
      expect(title).not.toMatch(/trim|full position|starter/i);
    }
  });

  it("leaves borrowed money out, puts louder rows first and counts the rest", () => {
    const quiet = Array.from({ length: 8 }, (_, i) =>
      buildEarningsAlerts([{ ticker: `T${i}`, date: "2026-09-30", days: 2 }])[0]!
    );
    const floor = ladder("exit", "Below its whole year");
    const margin = buildDecisionAlerts({ cash: -9000, equityValue: 10000 })[0]!;
    const { shown, more, total } = homeAlertRows([...quiet, margin, floor]);
    expect(shown).toHaveLength(HOME_ALERTS_SHOWN);
    expect(shown[0]!.alert.id).toBe(floor.id);
    expect(shown.some((s) => s.alert.kind === "margin")).toBe(false);
    expect(total).toBe(9);
    expect(more).toBe(9 - HOME_ALERTS_SHOWN);
  });

  it("fills a row for an alert that arrived without a digest", () => {
    const bare: UpsideAlert = {
      id: "x",
      kind: "results",
      title: "$X does something. More here.",
      detail: "",
      ticker: "X",
    };
    const { shown } = homeAlertRows([bare]);
    expect(shown[0]!.row).toMatchObject({ tag: "Results", what: "$X does something" });
  });
});
