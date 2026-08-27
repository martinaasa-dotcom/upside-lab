/**
 * Single source of truth for "not financial advice" framing shown across
 * the surfaces that still print it in the open: the Sunday letter, the
 * welcome walkthrough, sign-in, the terms, and Margus's strategy-rules
 * drawer. Forecast, Pulse, the bad-day simulator and the paper fund carry
 * the same meaning behind the eye on those numbers, so the line does not
 * also sit on the page as wallpaper.
 *
 * **Everything defined here is displayed somewhere.** An unused variant in
 * a file like this is a hazard rather than spare capacity: the next person
 * reading it reasonably assumes each constant means some surface is
 * covered. `ADVICE_DISCLAIMER_LONG` sat here unused and was removed for
 * exactly that reason. `FORECAST_DISCLAIMER` and `UPSIDE_PORTFOLIO_DISCLAIMER`
 * went the same way when the eye replaced them. If a surface ever needs
 * the old forecast line back, it was: "Modeled prices, not a prediction."
 * plus the short advice line. The fund line was: "Paper money, run by
 * Margus. Not a real fund, not a track record, not a signal to copy."
 *
 * `PROJECTION_DISCLAIMER` left on 2026-08-21 when Martin asked for it off
 * the growth calculator header. If the calculator ever needs the framing
 * back, the wording was: "This is arithmetic on the numbers you typed, not
 * a prediction. Real investments go up and down, and no rate of return is
 * guaranteed."
 */

/** Compact, always-visible line for tight spaces (letter, terms, sign-in). */
export const ADVICE_DISCLAIMER_SHORT =
  "Not personalized investment advice. Not a recommendation to buy, sell, or hold.";
