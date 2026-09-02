import {
  ALERTS_PATH,
  GROWTH_PATH,
  LAB_PATH,
  PORTFOLIO_PATH,
  PULSE_PATH,
} from "@/lib/book-routes";
import { metaTabFromToken } from "@/lib/dashboard-tab";
import {
  ALERTS_TAB_ID,
  COMPOUND_TAB_ID,
  LAB_TAB_ID,
  OVERVIEW_TAB_ID,
  PULSE_TAB_ID,
} from "@/lib/overview";

/*
  EVERY URL THIS APP EVER PUT IN SOMEBODY'S BOOKMARKS STILL OPENS THE ROOM
  IT NAMED.

  Home, Pulse, Lab, Growth, Alerts and each portfolio were `?tab=` on the
  root for the whole life of the app so far, so those URLs are in browser
  histories, in bookmarks, and in mail already delivered. They are answered
  permanently, and they are answered by dropping the query rather than
  carrying it: a redirect that keeps `?tab=` leaves two spellings of one
  room in circulation, and `?tab=overview`, whose room is the root the
  query is already on, would redirect to itself forever.

  That last one is why this is middleware and not `redirects()` in
  `next.config.ts`. A config redirect appends the source's query to its
  destination and there is no setting that says otherwise, so the one rule
  that has to end at a bare `/` cannot be written there at all.

  Kept pure and separate from the middleware that calls it so the whole
  table can be run in tests without a request.
*/

/** The meta tabs, by the id `metaTabFromToken` answers with. */
const PATH_FOR_META: Record<string, string> = {
  [OVERVIEW_TAB_ID]: "/",
  [PULSE_TAB_ID]: PULSE_PATH,
  [LAB_TAB_ID]: LAB_PATH,
  [COMPOUND_TAB_ID]: GROWTH_PATH,
  [ALERTS_TAB_ID]: ALERTS_PATH,
};

/** `?tab=` spellings that meant the holdings table rather than a meta tab. */
const PORTFOLIO_TOKENS = new Set(["portfolio", "book", "forecast"]);

/**
 * Paths that only ever showed Overview, and the one renamed room.
 *
 * None of these has a page file. This table answers them before any page
 * could run, so a page for one would be code nothing reaches.
 */
const PATH_ALIASES: Record<string, string> = {
  "/dashboard": "/",
  "/forecast": "/",
  "/compound": GROWTH_PATH,
};

/**
 * Where a legacy URL should land, or null if it is already canonical.
 *
 * Reads `metaTabFromToken` rather than restating its spellings, so a token
 * the app understands cannot end up with no redirect behind it. Order
 * matters and its failure is silent: `?sheet=lab` is the Lab tab, not a
 * portfolio somebody called "lab", so the meta reading comes first.
 */
export function legacyRedirectPath(
  pathname: string,
  params: URLSearchParams
): string | null {
  const alias = PATH_ALIASES[pathname];
  if (alias) return alias;
  if (pathname !== "/") return null;

  const tab = params.get("tab")?.trim().toLowerCase() || "";
  const portfolio = params.get("portfolio")?.trim() || "";
  const sheet = params.get("sheet")?.trim() || "";

  if (tab && PORTFOLIO_TOKENS.has(tab)) {
    const token = portfolio || sheet;
    return token
      ? `${PORTFOLIO_PATH}/${encodeURIComponent(token)}`
      : PORTFOLIO_PATH;
  }

  if (tab) {
    const meta = metaTabFromToken(tab);
    // An unknown token asked for nothing this app has. Overview is where
    // it landed before, and dropping the query is the whole point.
    return meta ? (PATH_FOR_META[meta] ?? "/") : "/";
  }

  if (sheet) {
    const meta = metaTabFromToken(sheet.toLowerCase());
    if (meta) return PATH_FOR_META[meta] ?? "/";
    return `${PORTFOLIO_PATH}/${encodeURIComponent(sheet)}`;
  }

  if (portfolio) {
    return `${PORTFOLIO_PATH}/${encodeURIComponent(portfolio)}`;
  }

  return null;
}
