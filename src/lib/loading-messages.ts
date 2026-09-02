/**
 * Witty loading-screen lines — genuinely random (Math.random, not seeded)
 * so repeat visits feel fresh rather than "today's line." Keep each one
 * short enough to sit on one line under the logo, and keep the mix wide
 * (money jokes, everyday-delay jokes, self-aware app jokes) so it doesn't
 * read as one repetitive bit. A space before the trailing ellipsis reads
 * cleaner than jamming it right against the last word.
 *
 * A line here is read by somebody opening their savings, sometimes on the
 * evening those savings fell, so two kinds went out and must not come back.
 * Nothing that mocks how the reader has done ("unlike your portfolio, this
 * won't take forever"), and nothing that promises fortune-telling ("the
 * financial oracles", "your financial destiny"), which argues with the
 * landing page's own promise of facts. Market slang goes too: this is the
 * one file `humanizeMargusText` never passes over.
 */
const LOADING_MESSAGES = [
  "Opening your portfolio …",
  "Finding your keys …",
  "Looking under the couch cushions …",
  "Checking your pockets one more time …",
  "It was juuust here a second ago …",
  "Retracing your steps …",
  "Turning the house upside down …",
  "Asking the dog if he's seen it …",
  "Counting your money (again) …",
  "Convincing your stocks to cooperate …",
  "Waking up your portfolio …",
  "Making sure your cash didn't wander off …",
  "Polishing your gains …",
  "Reassuring your losses …",
  "Untangling your holdings …",
  "Summoning your portfolio from the cloud …",
  "Dusting off the spreadsheet …",
  "Warming up the calculator …",
  "Doing math so you don't have to …",
  "Pretending this is instant …",
  "Shuffling numbers into place …",
  "Making it look easy …",
  "Fetching the good stuff …",
  "Herding your tickers into one place …",
  "Reading the fine print (there isn't any) …",
  "Asking Margus to hurry up …",
  "Giving your cash a pep talk …",
  "Waiting for the numbers to feel ready …",
  "Tidying up before you walk in …",
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
