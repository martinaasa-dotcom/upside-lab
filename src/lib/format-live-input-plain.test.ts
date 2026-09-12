/**
 * A field being edited shows a bare number, and the symbol is chrome.
 *
 * Money and percent inputs used to keep their currency symbol / percent
 * sign in the text while a reader was typing, so replacing "$1,000" or
 * "7.5%" meant deleting around the symbol first rather than typing over
 * the selection. `{ plain: true }` on `formatMoneyFromRaw` and
 * `formatPercentFromRaw` produces the symbol-free text a field shows while
 * focused; the two things this file pins are that the symbol is genuinely
 * gone from that text and that stripping it never changes the parsed
 * value, which is the one thing `onChange` is allowed to see.
 */
import { describe, expect, it } from "vitest";
import {
  formatLiveMoney,
  formatLivePercent,
  formatMoneyFromRaw,
  formatPercentFromRaw,
  formatPlainNumber,
  type CurrencyCode,
} from "@/lib/format-live-input";
import { MAX_SAFE_MONEY } from "@/lib/money";

const CODES: CurrencyCode[] = ["USD", "EUR", "GBP", "CHF", "SEK", "CAD"];

describe("a field's editing text carries no symbol and no sign", () => {
  for (const code of CODES) {
    it(`${code} strips the currency symbol while keeping the digits`, () => {
      const normal = formatMoneyFromRaw("1234567", code, 0);
      const plain = formatMoneyFromRaw("1234567", code, 0, { plain: true });
      expect(plain.display).toMatch(/^[\d,.]+$/);
      expect(normal.display).not.toBe(plain.display);
      // The symbol is the only thing the flag may remove.
      expect(normal.display.replace(/[^\d,.]/g, "")).toBe(plain.display);
    });
  }

  it("strips the percent sign the same way", () => {
    const normal = formatPercentFromRaw("7.5", 1);
    const plain = formatPercentFromRaw("7.5", 1, { plain: true });
    expect(plain.display).toBe("7.5");
    expect(normal.display).toBe("7.5%");
  });

  it("never changes the parsed value, only the text", () => {
    const cases: Array<[string, number]> = [
      ["0", 0],
      ["5", 0],
      ["1234.5", 1],
      ["1234.", 1],
      ["1,234,567", 0],
    ];
    for (const [raw, digits] of cases) {
      expect(formatMoneyFromRaw(raw, "USD", digits, { plain: true }).value).toBe(
        formatMoneyFromRaw(raw, "USD", digits).value
      );
      expect(formatPercentFromRaw(raw, digits, { plain: true }).value).toBe(
        formatPercentFromRaw(raw, digits).value
      );
    }
  });

  it("caps at the same ceiling with no symbol left behind", () => {
    const huge = String(MAX_SAFE_MONEY * 10);
    const plain = formatMoneyFromRaw(huge, "USD", 0, { plain: true });
    expect(plain.value).toBe(MAX_SAFE_MONEY);
    expect(plain.display).toMatch(/^[\d,]+$/);

    const hugePct = "50000000";
    const plainPct = formatPercentFromRaw(hugePct, 0, { plain: true });
    expect(plainPct.display).toMatch(/^[\d,]+$/);
    expect(plainPct.value).toBe(
      formatPercentFromRaw(hugePct, 0).value
    );
  });

  it("formats a settled value the same way a field shows it on focus", () => {
    // What `editFormat` in FormattedNumberInput seeds the box with: the
    // committed value, read straight rather than round-tripped through a
    // raw keystroke string.
    expect(formatPlainNumber(1234, 0)).toBe("1,234");
    expect(formatPlainNumber(7.5, 1)).toBe("7.5");
    expect(formatPlainNumber(7, 1)).toBe("7");
    expect(formatPlainNumber(0, 0)).toBe("0");
  });

  it("the plain and symboled readings agree on every digit", () => {
    expect(formatLiveMoney(1234, "USD", 0).replace(/[^\d,.]/g, "")).toBe(
      formatPlainNumber(1234, 0)
    );
    expect(formatLivePercent(7.5, 1).replace("%", "")).toBe(
      formatPlainNumber(7.5, 1)
    );
  });
});
