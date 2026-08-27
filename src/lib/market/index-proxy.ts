/**
 * Is this ticker the S&P 500 itself?
 *
 * Trends measures every name against the S&P 500, and a reader whose
 * portfolio holds a European listing of an S&P 500 tracker watched the app
 * rank that tracker against the S&P 500 and print 0.0%. They wrote back
 * asking why the S&P was being compared with the S&P, which is the correct
 * question: a bar that can only ever read zero is not a reading, and next
 * to nine real ones it looks like a broken row rather than a tautology.
 *
 * A tracker is not a competitor to its own index, it is the baseline. So
 * these are named, taken out of the ranking, and used to label the middle
 * line instead. A holding like this is also the single most common thing a
 * person outside this family owns, so getting it wrong is not an edge case.
 *
 * Deliberately a list rather than a rule. The suffix tells you the venue,
 * never what the fund tracks, so `.DE` cannot be reasoned about: `SXR8.DE`
 * is the S&P 500 and `SPY5.DE` is too, while any number of other `.DE`
 * lines are not. Anything not on the list is treated as a normal holding,
 * which is the safe way round: an unrecognised tracker reads as a name
 * hugging the index, and that is roughly true.
 */

const SP500: Record<string, string> = {
  // The index and its futures.
  "^GSPC": "S&P 500",
  SPX: "S&P 500",
  "ES=F": "S&P 500 futures",
  // US listings.
  SPY: "S&P 500",
  VOO: "S&P 500",
  IVV: "S&P 500",
  SPLG: "S&P 500",
  SPYG: "S&P 500 growth half",
  // Europe, which is where a reader found this.
  "SXR8.DE": "S&P 500",
  "SPY5.DE": "S&P 500",
  "VUAA.DE": "S&P 500",
  "SPYL.DE": "S&P 500",
  "IUSA.DE": "S&P 500",
  "CSPX.L": "S&P 500",
  "VUSA.L": "S&P 500",
  "VUAA.L": "S&P 500",
  "IUSA.L": "S&P 500",
  "SPY5.L": "S&P 500",
  "IUSA.AS": "S&P 500",
  "VUSA.AS": "S&P 500",
};

/** What this ticker tracks, in words, or null for an ordinary holding. */
export function indexProxyName(ticker: string): string | null {
  return SP500[ticker.trim().toUpperCase()] ?? null;
}

/** True when ranking this ticker against the S&P would compare it to itself. */
export function isIndexProxy(ticker: string): boolean {
  return indexProxyName(ticker) !== null;
}

/**
 * The sentence that replaces a proxy's row in the ranking.
 *
 * Returns null when there is nothing to explain, so the caller renders
 * nothing rather than an empty aside.
 */
export function indexProxyNote(tickers: readonly string[]): string | null {
  const found = tickers.filter(isIndexProxy);
  if (found.length === 0) return null;
  const names = found.map((t) => `$${t.toUpperCase()}`);
  const list =
    names.length === 1
      ? names[0]!
      : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  const verb = names.length === 1 ? "is" : "are";
  return `${list} ${verb} the S&P 500, so ${names.length === 1 ? "it" : "they"} ${names.length === 1 ? "is" : "are"} the middle line here rather than a name in the ranking.`;
}
