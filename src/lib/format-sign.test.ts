import { describe, expect, it } from "vitest";
import { signedCurrency, signedPercent } from "@/lib/format";

/*
 * A minus in front of a zero is the one thing these two must never print.
 *
 * Both used to read the sign off the raw number and round afterwards, so a
 * day move of thirty cents down reached a Movers tile as "-$0". This app
 * states its figures as fact, and "-$0" states nothing at all while looking
 * like it does.
 */
describe("a signed figure takes its sign from the figure that is shown", () => {
  it("does not put a minus in front of a rounded-away amount", () => {
    expect(signedCurrency(-0.3, 0)).toBe("$0");
    expect(signedCurrency(0.3, 0)).toBe("$0");
    expect(signedCurrency(-0.004)).toBe("$0.00");
  });

  it("does not put a minus in front of a rounded-away percentage", () => {
    expect(signedPercent(-0.0001)).toBe("0.0%");
    expect(signedPercent(0.0001)).toBe("0.0%");
  });

  it("still signs anything that survives the rounding", () => {
    expect(signedCurrency(-0.6, 0)).toBe("-$1");
    expect(signedCurrency(-58, 0)).toBe("-$58");
    expect(signedCurrency(4791, 0)).toBe("+$4,791");
    expect(signedPercent(-0.024)).toBe("-2.4%");
    expect(signedPercent(0.024)).toBe("+2.4%");
  });
});
