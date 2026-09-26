import { describe, expect, it } from "vitest";
import {
  HOME_ALERTS_SHOWN,
  buildDecisionAlerts,
  buildEarningsAlerts,
  buildLadderAlerts,
  buildStrikeAlerts,
  homeAlertGroups,
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
    expect(row.what).toBe("A little below");
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

describe("Home's list is one row per company, measured against fair value", () => {
  const zone = (ticker: string, spot: number, anchor: number, bandId: string, bandLabel: string) =>
    buildLadderAlerts([{ ticker, spot, anchor, bandId, bandLabel, edge: spot * 1.07, edited: false }])[0]!;

  it("measures a zone against fair value itself, so it cannot contradict its own words", () => {
    // Measured on a real account: "A little above fair value" printed
    // beside "6.9% under $310.30", because the note read the band's own
    // upper edge rather than fair value.
    const row = zone("BE", 289, 270.1, "trim-some", "A little above").digest!;
    expect(row.note).toBe("7% above $270");
    expect(row.fairGap).toBeCloseTo(289 / 270.1 - 1, 6);
    const below = zone("MU", 1085.02, 2752.08, "full-aggressive", "A long way below").digest!;
    expect(below.note).toMatch(/below \$2,752$/);
  });

  it("puts a company's results date on its zone row rather than a second row", () => {
    const alerts = [
      ...buildEarningsAlerts([{ ticker: "MU", date: "2026-09-30", days: 4 }]),
      zone("MU", 1085.02, 2752.08, "full-aggressive", "A long way below"),
      zone("NVDA", 225, 369.22, "full-aggressive", "A long way below"),
    ];
    const { groups, total } = homeAlertGroups(alerts);
    expect(total).toBe(3);
    expect(groups.map((g) => g.lead.alert.ticker)).toEqual(["MU", "NVDA"]);
    expect(groups[0]!.lead.alert.kind).toBe("ladder");
    expect(groups[0]!.extras.map((e) => e.alert.kind)).toEqual(["results"]);
  });

  it("leads with the name furthest from fair value, in either direction", () => {
    const { groups } = homeAlertGroups([
      zone("BE", 289, 270.1, "trim-some", "A little above"),
      zone("CRWV", 87.51, 129.67, "full-aggressive", "A long way below"),
      zone("MU", 1085.02, 2752.08, "full-aggressive", "A long way below"),
    ]);
    expect(groups.map((g) => g.lead.alert.ticker)).toEqual(["MU", "CRWV", "BE"]);
  });

  it("counts what the grouped rows leave out", () => {
    const many = Array.from({ length: 9 }, (_, i) =>
      zone(`T${i}`, 90 - i, 100, "starter", "A little below")
    );
    const { groups, more, total } = homeAlertGroups(many);
    expect(groups).toHaveLength(HOME_ALERTS_SHOWN);
    expect(total).toBe(9);
    expect(more).toBe(9 - HOME_ALERTS_SHOWN);
  });
});
