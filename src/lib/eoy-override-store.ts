/**
 * Pushes the reader's own end-of-year price targets to the account.
 *
 * The editing surfaces (the Growth room, Margus) still read and write
 * `forecast-overrides.ts`'s per-portfolio localStorage copy exactly as
 * before, since that scoping is what a portfolio-open Growth room wants.
 * This is the mirror onto the account: every save also pushes the whole
 * book's targets, merged across portfolios the same way `bookEoyOverrides`
 * already merges them for the book-wide surfaces, onto `portfell_lab_state`
 * (per owner, beside the ladders), so a target survives a new device and,
 * for the house account, republishes as the site's own default via
 * `mirrorHouseForecast`.
 */
import type {
  PortfolioEoyOverrides,
  PortfolioEoySources,
} from "@/lib/forecast-overrides";

/**
 * The sources ride along with the figures, in the same request, because
 * they are two halves of one fact. The account keeps them so a second
 * device knows which figures the reader chose, and the house account's
 * mirror keeps them so the site default can say whether a published
 * price was typed or worked out rather than claiming the flattering one.
 */
export async function pushEoyOverrides(
  overrides: PortfolioEoyOverrides,
  sources: PortfolioEoySources
) {
  try {
    const { fetchOrQueue } = await import("@/lib/offline/queued-fetch");
    await fetchOrQueue(
      "/api/lab",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eoyOverrides: overrides,
          eoySources: sources,
        }),
      },
      { kind: "preference" }
    );
  } catch {
    /* the local copy is still saved, and the next save retries */
  }
}
