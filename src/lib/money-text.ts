/**
 * A figure a person reads always carries its thousands separator.
 *
 * Every formatter in the app groups (`format.ts`, and the letter's own
 * money helpers), but two kinds of string get past them: prose the model
 * wrote, which is free to type `$129709`, and any figure a future call
 * site interpolates by hand. Both reach an inbox. This is the last pass
 * before a reader sees the text, so a bare `$129709` cannot survive
 * whatever produced it.
 *
 * Deliberately narrow: only a currency mark followed by four or more
 * digits. Cashtags (`$NBIS`) have no digits, percentages have no currency
 * mark, and an amount that already has separators is left alone.
 */

const MONEY_RUN = /([$€£])(\s?)(\d{4,})(?=(?:\.\d+)?(?!\d))/g;

/** 129709 -> 129,709. */
export function groupDigits(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function groupMoneyInText(text: string): string {
  if (!text) return text;
  return text.replace(
    MONEY_RUN,
    (_m, mark: string, space: string, digits: string) =>
      `${mark}${space}${groupDigits(digits)}`
  );
}
