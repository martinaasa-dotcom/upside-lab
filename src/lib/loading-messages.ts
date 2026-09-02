/**
 * What a person reads while the portfolio opens.
 *
 * This used to be forty jokes, and the jokes were the problem. The screen
 * they sit on is the one somebody waits on to find out whether they lost
 * money today, and it opened with lines like "Checking if you're rich
 * yet", "Buffering your financial destiny" and one about not buying the
 * dip by accident, which is market slang in the one file the model-output
 * scrubber never touches. On the evening a portfolio falls, a gag about
 * the reader's returns is the wrong voice, and the run about lost keys and
 * looking under the couch cushions told somebody opening their savings
 * that it had been mislaid.
 *
 * So every line here is quiet, true, and something the app is actually
 * doing: it opens the portfolio, it fetches prices, it adds them up, it
 * reads the day on the companies. The first one is what
 * `SessionResumeShell` paints before any of this runs, so the app arrives
 * underneath a sentence that never moved. A space before the ellipsis
 * reads cleaner than jamming it against the last word.
 */
const LOADING_MESSAGES = [
  "Opening your portfolio …",
  "Getting today's prices …",
  "Adding it all up …",
  "Reading the day on your companies …",
  "Checking what moved since you last looked …",
  "Nearly there …",
];

/** Stable SSR + first paint. Random line swaps in after mount. */
export const DEFAULT_LOADING_MESSAGE = LOADING_MESSAGES[0]!;

export function pickLoadingMessage(): string {
  return LOADING_MESSAGES[Math.floor(Math.random() * LOADING_MESSAGES.length)]!;
}
