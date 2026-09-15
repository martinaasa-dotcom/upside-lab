import { describe, expect, it } from "vitest";
import { quotesAgeLabel, quotesStuck } from "@/lib/market/quote-health";
import { quotePollMs, quoteStuckAfterMs } from "@/lib/market/session";

/** A Monday inside the regular session, 11:00 New York. */
const OPEN = Date.parse("2026-08-24T15:00:00Z");
/** Tuesday 02:00 New York, the overnight gap. */
const NIGHT = Date.parse("2026-08-25T06:00:00Z");

describe("quotesStuck", () => {
  it("is not stuck between two ordinary polls", () => {
    const cadence = quotePollMs(new Date(OPEN));
    for (const age of [0, 1_000, cadence - 1, cadence, cadence * 1.5]) {
      expect(
        quotesStuck({ fetchedAt: OPEN - age, failing: false, online: true, now: OPEN })
      ).toBe(false);
    }
  });

  it("is stuck once the poll has had two cycles and not replaced the figure", () => {
    const after = quoteStuckAfterMs(new Date(OPEN));
    expect(
      quotesStuck({ fetchedAt: OPEN - after + 1, failing: false, online: true, now: OPEN })
    ).toBe(false);
    expect(
      quotesStuck({ fetchedAt: OPEN - after, failing: false, online: true, now: OPEN })
    ).toBe(true);
  });

  it("gives the overnight cadence its own, longer, bar", () => {
    const openBar = quoteStuckAfterMs(new Date(OPEN));
    const nightBar = quoteStuckAfterMs(new Date(NIGHT));
    expect(nightBar).toBeGreaterThan(openBar);
    // Nine minutes old at 02:00 is the ordinary state of a ten minute poll.
    expect(
      quotesStuck({ fetchedAt: NIGHT - 9 * 60_000, failing: false, online: true, now: NIGHT })
    ).toBe(false);
  });

  it("a failed fetch greys the figure only past a short grace", () => {
    expect(
      quotesStuck({ fetchedAt: OPEN - 5_000, failing: true, online: true, now: OPEN })
    ).toBe(false);
    expect(
      quotesStuck({ fetchedAt: OPEN - 25_000, failing: true, online: true, now: OPEN })
    ).toBe(true);
  });

  it("offline is stuck whatever the age, and no fetch at all is stuck", () => {
    expect(
      quotesStuck({ fetchedAt: OPEN, failing: false, online: false, now: OPEN })
    ).toBe(true);
    expect(quotesStuck({ fetchedAt: null, failing: false, online: true, now: OPEN })).toBe(
      true
    );
  });
});

describe("quotesAgeLabel", () => {
  it("says updating while the gap is short, and the age once it is not", () => {
    expect(quotesAgeLabel(OPEN - 10_000, true, OPEN)).toBe("updating");
    expect(quotesAgeLabel(null, true, OPEN)).toBe("updating");
    expect(quotesAgeLabel(OPEN - 3 * 60_000, true, OPEN)).toBe("as of 3m ago");
    expect(quotesAgeLabel(OPEN - 5 * 3_600_000, true, OPEN)).toBe("as of 5h ago");
    expect(quotesAgeLabel(OPEN - 3 * 86_400_000, true, OPEN)).toBe("as of 3d ago");
    expect(quotesAgeLabel(OPEN, false, OPEN)).toBe("offline");
  });
});
