/**
 * A Pulse stamp's "above"/"below its recent range" claim is a snapshot from
 * whenever it was written, and the Sunday letter can run days later against
 * a price that has moved back inside the range it once broke. The letter
 * states its numbers as fact, so the claim must be re-checked against a
 * fresh, measured range before it reaches an inbox, and dropped rather than
 * printed once the market has stopped agreeing with it.
 */
import { describe, expect, it } from "vitest";
import { buildWeeklyLetter, type WeeklyLetterInput } from "@/lib/weekly-letter";

const NOW = new Date("2026-09-14T05:00:00Z");

/** Ten dated closes running from 100 up to 120, oldest first. */
function closes(values: number[]): { date: string; close: number }[] {
  return values.map((close, i) => ({
    date: `2026-09-${String(i + 1).padStart(2, "0")}`,
    close,
  }));
}

const RANGE_100_TO_120 = closes([100, 105, 110, 108, 112, 115, 118, 116, 119, 120]);

/** Only the pulse-sourced suggestion is under test here; a lone holding is
 * automatically 100% of the book and also trips the unrelated size alert,
 * so tests must look at `source`, not just presence, to tell the two apart. */
function hasPulseSuggestion(letter: ReturnType<typeof buildWeeklyLetter>, ticker: string) {
  return letter.suggestions.some((s) => s.source === "pulse" && s.ticker === ticker);
}

function baseInput(overrides: Partial<WeeklyLetterInput>): WeeklyLetterInput {
  return {
    name: "Martin",
    cash: 0,
    holdings: [{ ticker: "CRWV", shares: 10, buy_price: 90 }],
    quotes: { CRWV: { price: 125, dailyCloses: RANGE_100_TO_120 } as never },
    conviction: {
      CRWV: {
        updatedAt: "2026-09-10T00:00:00Z",
        stamps: [
          {
            at: "2026-09-10T00:00:00Z",
            verdict: "Ran hard on a strong quarter.",
            line: "Ran hard.",
            action: "trim",
            thesisStatus: "intact",
          },
        ],
      },
    },
    now: NOW,
    ...overrides,
  };
}

describe("a stale trim stamp is checked against today's own price", () => {
  it("keeps the suggestion when the price really is above the measured high", () => {
    const letter = buildWeeklyLetter(baseInput({}));
    expect(hasPulseSuggestion(letter, "CRWV")).toBe(true);
  });

  it("drops the suggestion once the price has fallen back inside the range", () => {
    const letter = buildWeeklyLetter(
      baseInput({
        quotes: { CRWV: { price: 110, dailyCloses: RANGE_100_TO_120 } as never },
      })
    );
    expect(hasPulseSuggestion(letter, "CRWV")).toBe(false);
  });

  it("drops the suggestion when the price has fallen below the whole range", () => {
    // A stale "above its range" stamp beside a price that has since crashed
    // below the range entirely is the worst version of the same lie.
    const letter = buildWeeklyLetter(
      baseInput({
        quotes: { CRWV: { price: 80, dailyCloses: RANGE_100_TO_120 } as never },
      })
    );
    expect(hasPulseSuggestion(letter, "CRWV")).toBe(false);
  });

  it("keeps the suggestion when the price sits exactly on the measured high", () => {
    // The boundary itself is still outside the open range between the low
    // and the high, so it must not be treated as "inside".
    const letter = buildWeeklyLetter(
      baseInput({
        quotes: { CRWV: { price: 120, dailyCloses: RANGE_100_TO_120 } as never },
      })
    );
    expect(hasPulseSuggestion(letter, "CRWV")).toBe(true);
  });

  it("drops the suggestion when there is no history to measure a range from", () => {
    const letter = buildWeeklyLetter(
      baseInput({ quotes: { CRWV: { price: 125 } as never } })
    );
    expect(hasPulseSuggestion(letter, "CRWV")).toBe(false);
  });
});

describe("a stale add stamp is checked the same way", () => {
  function addInput(price: number): WeeklyLetterInput {
    return baseInput({
      quotes: { BMNR: { price, dailyCloses: RANGE_100_TO_120 } as never },
      holdings: [{ ticker: "BMNR", shares: 10, buy_price: 130 }],
      conviction: {
        BMNR: {
          updatedAt: "2026-09-10T00:00:00Z",
          stamps: [
            {
              at: "2026-09-10T00:00:00Z",
              verdict: "Sold off on nothing new.",
              line: "Sold off.",
              action: "add",
              thesisStatus: "intact",
            },
          ],
        },
      },
    });
  }

  it("keeps the suggestion when the price really is below the measured low", () => {
    const letter = buildWeeklyLetter(addInput(90));
    expect(hasPulseSuggestion(letter, "BMNR")).toBe(true);
  });

  it("drops the suggestion once the price has recovered back into the range", () => {
    const letter = buildWeeklyLetter(addInput(110));
    expect(hasPulseSuggestion(letter, "BMNR")).toBe(false);
  });
});
