/**
 * Single source of truth for "not financial advice" framing shown across
 * every AI-generated surface (Margus chat, Thesis Pulse, Forecast) and
 * every surface that models money forward (the bad-day simulator). Keep
 * this consistent. If the wording needs to change for legal reasons, it
 * should only need to change here.
 *
 * **Everything defined here is displayed somewhere.** An unused variant in
 * a file like this is a hazard rather than spare capacity: the next person
 * reading it reasonably assumes each constant means some surface is
 * covered. `ADVICE_DISCLAIMER_LONG` sat here unused and was removed for
 * exactly that reason. It is one line to bring back the moment a surface
 * needs it. `PROJECTION_DISCLAIMER` went the same way on 2026-08-21 when
 * Martin asked for it off the growth calculator header, which was its only
 * call site. If the calculator ever needs the framing back, the wording
 * was: "This is arithmetic on the numbers you typed, not a prediction.
 * Real investments go up and down, and no rate of return is guaranteed."
 */

/** Compact, always-visible line for tight spaces (chat panel, cards, letter). */
export const ADVICE_DISCLAIMER_SHORT =
  "Not personalized investment advice. Not a recommendation to buy, sell, or hold.";

/** For forecast/scenario-modeling surfaces specifically. */
export const FORECAST_DISCLAIMER =
  `Modeled prices, not a prediction. ${ADVICE_DISCLAIMER_SHORT}`;

/** Upside Fund, a fully simulated, paper-money portfolio managed
 * autonomously by Margus. Leads with WHO runs it (a common question for a
 * followable daily feed like this), then the same "not real, not advice"
 * emphasis used everywhere else. */
export const UPSIDE_PORTFOLIO_DISCLAIMER =
  `Paper money, run by Margus. Not a real fund, not a track record, not a signal to copy. ${ADVICE_DISCLAIMER_SHORT}`;
