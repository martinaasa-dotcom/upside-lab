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

/** A grouped amount: $1,234 / €12,345.67. */
const MONEY_GROUPED = /([$€£])(\s?)(\d{1,3}(?:,\d{3})+)/g;

/**
 * The same figures, grouped with a no-break space instead of a comma.
 *
 * Gmail builds its inbox snippet from its own text pass, and that pass
 * drops the separators inside a number: the mail we send says
 * `-$27,357 this week` and the list under the subject reads `-$27357`.
 * (The subject line itself is left alone, which is why one line of the
 * same email showed the separator and the other did not.) A no-break
 * space survives that pass and still reads as a thousands separator in
 * both the English and the Estonian convention, so the figure a person
 * sees first is never a bare run of digits.
 *
 * Only for the preview string. Everything else keeps the comma.
 */
export function previewMoneySeparators(text: string): string {
  return groupMoneyInText(text).replace(MONEY_GROUPED, (m) =>
    m.replace(/,/g, "\u00a0")
  );
}
