/**
 * WHICH REAL PORTFOLIO A PLAN'S STARTING POT TRACKS.
 *
 * `openingPot` (`templates.ts`) already settled the argument for a first
 * visit: a fact beats a guess, so the reader's own holdings win over a
 * template's fictional pot whenever there is a real figure to use. This
 * module carries that same rule into every later template press, and adds
 * the one thing a single combined figure cannot answer, WHICH portfolio.
 *
 * A reader with more than one book has money that is not all going toward
 * the same retirement, so "your portfolio" here means whichever one they
 * pick, not automatically everything they hold. `POT_SOURCE_BOOK` is the
 * combined total across every portfolio, offered first because it is the
 * reasonable default; a specific sheet id names one portfolio and nothing
 * else; `POT_SOURCE_CUSTOM` means the reader typed a figure of their own
 * and neither should be second-guessed.
 */

export const POT_SOURCE_BOOK = "book";
export const POT_SOURCE_CUSTOM = "custom";

export type PortfolioPotOption = {
  id: string;
  name: string;
  value: number;
};

/**
 * The real figure a source names, or null when it names nothing.
 *
 * `book` answers with the combined total, a sheet id with that one
 * portfolio's value, and `custom` (or an id nothing recognises, which is
 * what a source becomes once its portfolio is renamed or removed) with
 * null, because the reader's own typed figure is theirs and this function
 * only ever speaks for a real portfolio.
 */
export function potSourceValue(
  source: string,
  bookValue: number | null,
  sheets: readonly PortfolioPotOption[]
): number | null {
  if (source === POT_SOURCE_CUSTOM) return null;
  if (source === POT_SOURCE_BOOK) {
    return bookValue != null && bookValue > 0 ? bookValue : null;
  }
  const sheet = sheets.find((s) => s.id === source);
  return sheet && sheet.value > 0 ? sheet.value : null;
}

/**
 * The figure a template press should start the pot on.
 *
 * The selected source wins when it names a real portfolio. A source of
 * `custom`, or one naming a portfolio that has since gone, still falls back
 * to the reader's combined total rather than to nothing: pressing a
 * template is asking for a whole new life, and the one thing that life
 * must never carry is a made-up pot when a real figure is sitting right
 * there. Only an account with nothing at all lets the template's own guess
 * through, which is `openingPot`'s call to make, not this one's.
 */
export function resolvedPotOverride(
  source: string,
  bookValue: number | null,
  sheets: readonly PortfolioPotOption[]
): number | null {
  const named = potSourceValue(source, bookValue, sheets);
  if (named != null) return named;
  return bookValue != null && bookValue > 0 ? bookValue : null;
}
