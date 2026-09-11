/**
 * The two money formatters in `format-live-input.ts` must agree.
 *
 * One runs on every keystroke and one on blur, and while the only
 * currencies were the dollar and the euro both spellings matched, so a
 * hand-written symbol map beside `Intl` was harmless. Widening the type for
 * the retirement module broke that silently: `Intl` in en-US prints
 * `SEK 411,000` and the map said `kr `, so a krona field read one way while
 * the reader typed and another the moment they tabbed out. The Canadian and
 * Australian dollars were worse than cosmetic, typing as a bare `$` and
 * settling as `CA$` and `A$`, so mid-edit the field could not be told apart
 * from US dollars.
 *
 * The map is gone and the prefix is taken from `Intl`, so the drift cannot
 * come back for a currency added later. This holds that.
 */
import { describe, expect, it } from "vitest";
import { currency } from "@/lib/format";
import {
  formatLiveMoney,
  formatMoneyFromRaw,
  type CurrencyCode,
} from "@/lib/format-live-input";

const CODES: CurrencyCode[] = [
  "USD",
  "EUR",
  "GBP",
  "CHF",
  "SEK",
  "NOK",
  "DKK",
  "PLN",
  "CZK",
  "CAD",
  "AUD",
];

describe("a money field is labelled the same while typing and after", () => {
  for (const code of CODES) {
    it(`${code} reads the same in both`, () => {
      const typing = formatMoneyFromRaw("411000", code, 0).display;
      const settled = formatLiveMoney(411_000, code, 0);
      expect(typing).toBe(settled);
    });

    it(`${code} matches what the rest of the app prints`, () => {
      /*
        The third formatter: `currency()` draws every figure that is read
        rather than typed. A field that disagrees with the table under it
        is the same fault one step further out.
      */
      expect(formatLiveMoney(411_000, code, 0)).toBe(
        currency(411_000, 0, code)
      );
    });
  }

  it("keeps the gap a code needs and adds none to a symbol", () => {
    /*
      `CHF 0` has a gap and `$0` has none, so the prefix is taken as
      everything before the digits rather than as the currency part alone,
      which would print `SEK411,000` for the length of a keystroke.

      The gap is a NON-BREAKING space, which is Intl's own choice and the
      right one: it stops a three letter code wrapping away from the number
      it belongs to. Asserting a plain space here failed against a string
      that looked identical in the diff, which is the whole reason this
      test pins the character rather than the appearance.
    */
    const chf = formatMoneyFromRaw("411000", "CHF", 0).display;
    expect(chf.startsWith("CHF\u00a0")).toBe(true);
    expect(/\s/.test(chf.replace(/\u00a0/g, " "))).toBe(true);
    expect(formatMoneyFromRaw("411000", "USD", 0).display).toBe("$411,000");
  });

  it("never leaves two currencies sharing a prefix", () => {
    /*
      A bare dollar sign on three of them is how a reader in Toronto ends
      up reading US figures.
    */
    const prefixes = CODES.map(
      (code) => formatMoneyFromRaw("1", code, 0).display.replace(/[\d,.]/g, "")
    );
    const dollars = prefixes.filter((p) => p.trim() === "$");
    expect(dollars.length).toBeLessThanOrEqual(1);
  });
});
