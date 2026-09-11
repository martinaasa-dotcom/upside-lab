import { getShockProfile } from "@/lib/book-shock";
import { coinFromSymbol } from "@/lib/coins";
import { indexProxyName } from "@/lib/market/index-proxy";
import { sectorForTicker } from "@/lib/thesis-pulse";
import { normalizeYahooTicker } from "@/lib/ticker";

/**
 * What a company does, in the words a beginner needs, from whichever of
 * this app's tables knows.
 *
 * There were three per-ticker label tables in here and they answered
 * differently, so one product gave one company several descriptions
 * depending on which room you were standing in. `TICKER_SECTORS` is about
 * thirty names written for the forecast prompt; `PROFILES` in
 * `book-shock.ts` is about ninety, written for the Risk room, and is both
 * the broadest and the plainest of them; the theme lists group rather than
 * describe. Pulse read only the first, so on this app's own sample
 * portfolio it printed a line under $NVDA and $AAPL and nothing at all
 * under $VOO, $KO, $MSFT, $AMZN, $NKE and $DIS, while the Risk room, one
 * tap away, was calling those same names "A fund of large US companies",
 * "Everyday household goods", "Cloud computing for businesses" and "Online
 * shopping and cloud computing". The words already existed and were
 * already shipping; Pulse was the room that could not see them.
 *
 * Order is finest first. The hand-written entry wins where there is one,
 * because it was written about that company; the Risk table answers for
 * everybody else.
 *
 * Nothing is guessed, which is the rule already written over Pulse's own
 * version of this and is kept here: `getShockProfile` always answers, so a
 * name none of the tables recognise comes back as its catch-all, and a
 * catch-all is not a description. Those are dropped and the caller prints
 * nothing, because a bare cashtag is better than a sentence that is wrong
 * about somebody's money.
 */

/**
 * The label the Risk table falls back to when it has recognised nothing.
 *
 * Read off the table by asking it about a symbol nothing can match, rather
 * than retyped here, so the day somebody rewords that bucket this keeps
 * suppressing it instead of quietly starting to print it.
 */
const NOT_A_DESCRIPTION: ReadonlySet<string> = new Set([
  getShockProfile("ZZZZZZZZ").label,
]);

export function describeCompany(
  ticker: string,
  /**
   * The provider's sector in this app's words, where one was fetched.
   * Absent is the ordinary case, not a fault: a fund and a coin file no
   * `assetProfile`, and a room that has not asked yet passes nothing.
   */
  providerSector?: string | null
): string {
  const symbol = ticker.trim();
  if (!symbol) return "";

  // Both spellings, because a holding is stored as "BTC" and the coin list
  // is keyed on the symbol the provider uses. Missing that put "Coins" on
  // the card, which is the bucket rather than the thing.
  const coin =
    coinFromSymbol(symbol) ?? coinFromSymbol(normalizeYahooTicker(symbol));
  if (coin) return coin.name;

  const index = indexProxyName(symbol);
  if (index) return `A fund that tracks the ${index}`;

  const written = sectorForTicker(symbol);
  if (written && written !== "Coins") return written;

  /*
    The sector reaches the answer through here rather than being printed
    itself, because this table is finer wherever it knows the company:
    Microsoft reads "Cloud computing for businesses" rather than
    "Technology and software". Where it does not, the sector routes the
    holding to the profile for its kind of business, so Nike arrives as
    "Shops, brands and travel" instead of nothing at all.
  */
  const shock = getShockProfile(symbol, providerSector).label;
  return NOT_A_DESCRIPTION.has(shock) ? "" : shock;
}
