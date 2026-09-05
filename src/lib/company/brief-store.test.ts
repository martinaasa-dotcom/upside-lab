import { describe, expect, it } from "vitest";
import {
  BRIEF_MAX_AGE_MS,
  BRIEF_MAX_DRIFT,
  isReusableBrief,
  type StoredBrief,
} from "@/lib/company/brief-store";
import type { CompanyBrief } from "@/lib/ai/company-brief";

/**
 * A row in this table is read by every reader in the product, so getting
 * these three bounds wrong means one bad run is served to everybody looking
 * that company up, under the provenance mark, as a considered answer. The
 * forecast cache learned each of them the hard way; these are the same
 * rules on a page that also has to age against the company's own figures.
 */

const BRIEF = { whatTheyDo: "x" } as unknown as CompanyBrief;
const NOW = new Date("2026-09-05T12:00:00.000Z");

function row(over: Partial<StoredBrief> = {}): StoredBrief {
  return {
    brief: BRIEF,
    generatedAt: "2026-09-05T09:00:00.000Z",
    factsKey: "TEST|500|50",
    anchorPrice: 100,
    ...over,
  };
}

describe("a shared page ages out", () => {
  it("reuses one written this morning", () => {
    expect(isReusableBrief(row(), { now: NOW })).toBe(true);
  });

  it("refuses one older than the bound", () => {
    const old = new Date(NOW.getTime() - BRIEF_MAX_AGE_MS - 1000).toISOString();
    expect(isReusableBrief(row({ generatedAt: old }), { now: NOW })).toBe(false);
  });

  it("refuses a row whose date cannot be read", () => {
    /*
      "Cannot show it is inside the bound" is the same answer as "too old"
      for a row every reader drinks from.
    */
    expect(isReusableBrief(row({ generatedAt: "not a date" }), { now: NOW })).toBe(
      false
    );
  });
});

describe("a shared page is tied to what it was written from", () => {
  it("refuses one written before the company reported", () => {
    expect(
      isReusableBrief(row(), { factsKey: "TEST|600|70", now: NOW })
    ).toBe(false);
  });

  it("reuses one whose figures still match", () => {
    expect(
      isReusableBrief(row(), { factsKey: "TEST|500|50", now: NOW })
    ).toBe(true);
  });

  it("judges a row written before facts keys existed on age and price alone", () => {
    expect(
      isReusableBrief(row({ factsKey: "" }), { factsKey: "TEST|900|90", now: NOW })
    ).toBe(true);
  });

  it("refuses one whose share price has run away from its anchor", () => {
    const beyond = 100 * (1 + BRIEF_MAX_DRIFT) + 1;
    expect(isReusableBrief(row(), { spot: beyond, now: NOW })).toBe(false);
    expect(isReusableBrief(row(), { spot: 110, now: NOW })).toBe(true);
  });

  it("still reuses one when today's price is unknown", () => {
    // No price is not the same as a wrong price, and refusing here would
    // cost a cache hit for nothing.
    expect(isReusableBrief(row(), { spot: null, now: NOW })).toBe(true);
  });
});

describe("nothing about reuse extends a page's life", () => {
  it("keeps the age bound reachable for a company people look up daily", () => {
    /*
      The failure this names: bumping `generated_at` when a row is handed
      out makes a popular company's page immortal, which is the bug the
      forecast cache shipped with. Nothing in `isReusableBrief` writes, so
      the property holds by construction, and this test says so out loud
      because the temptation is in the writer, not the reader.
    */
    const written = row();
    const before = written.generatedAt;
    isReusableBrief(written, { now: NOW });
    isReusableBrief(written, { now: NOW });
    expect(written.generatedAt).toBe(before);
  });
});
