import { resolveLastPortfolioId } from "@/lib/active-sheet";
import { PORTFOLIO_TAB_PENDING } from "@/lib/mobile-tab";
import {
  ALERTS_TAB_ID,
  COMPOUND_TAB_ID,
  LAB_TAB_ID,
  OVERVIEW_TAB_ID,
  PULSE_TAB_ID,
} from "@/lib/overview";
import { BOOK_ROOM_PATHS } from "@/lib/seo-routes";
import type { Portfolio } from "@/lib/types";

/*
  THE PATH IS THE ROOM, AND THIS FILE IS THE ONLY PLACE THAT KNOWS WHICH.

  Home, Pulse, Lab, Growth, Alerts and each portfolio used to be one piece
  of component state with `?tab=` written after it by hand, so the address
  bar was a report on the app rather than the thing the app read. Both docks
  already rendered real links; both cancelled them. Now the link is the
  navigation, `usePathname` is the state, and Back is the browser's again.

  Every href in the app is built here and every path is read here, so the
  two cannot drift. `next.config.ts` redirects the old query URLs onto
  these paths, and `redirect-coverage.test.ts` fails if a token this file
  understands has no redirect standing behind it.
*/

/** A path with no query, no trailing slash. `/` stays `/`. */
function normalizePath(pathname: string): string {
  const noQuery = pathname.split("?")[0] ?? pathname;
  if (!noQuery || noQuery === "/") return "/";
  return noQuery.replace(/\/+$/, "") || "/";
}

export const PULSE_PATH = "/pulse";
export const LAB_PATH = "/lab";
export const GROWTH_PATH = "/growth";
export const ALERTS_PATH = "/alerts";
export const PORTFOLIO_PATH = "/portfolio";
/** Home with Margus open. See `isMargusPath`. */
export const MARGUS_PATH = "/margus";

/**
 * Whether a path is `/margus`, which is Home with the Margus panel open.
 *
 * There is no Margus room. The chat floats over whichever page is showing,
 * so the address names the page underneath (Overview) and adds that the
 * panel should be open on arrival. Nothing in the app links here; it is
 * for a bookmark or a link somebody was sent, and until it meant this a
 * reader following one landed on Home with the panel shut, which is the
 * one thing the address plainly did not say. Closing the panel puts the
 * address back to `/`, because a URL saying Margus is open over a panel
 * that is shut is the address bar reporting on the app rather than
 * driving it, which is the thing this file exists to end.
 */
export function isMargusPath(pathname: string): boolean {
  return normalizePath(pathname) === MARGUS_PATH;
}

/** Book paths that are a meta-tab in their own right. */
const META_PATHS: ReadonlyArray<readonly [string, string]> = [
  [PULSE_PATH, PULSE_TAB_ID],
  [LAB_PATH, LAB_TAB_ID],
  [GROWTH_PATH, COMPOUND_TAB_ID],
  [ALERTS_PATH, ALERTS_TAB_ID],
];

/**
 * The URL for a tab id. `/` for Home, since Overview is the book's front
 * door and a query-free root is the one book URL that may be indexed.
 *
 * A portfolio is named by its slug where it has one, because a slug is
 * somebody's own words and a UUID is not, and the slug is the same token
 * `?portfolio=` carried, so an old link and a new one name the same thing.
 */
export function hrefForTabId(
  id: string,
  portfolios: Pick<Portfolio, "id" | "slug">[]
): string {
  if (id === OVERVIEW_TAB_ID) return "/";
  for (const [path, tabId] of META_PATHS) {
    if (id === tabId) return path;
  }
  if (id === PORTFOLIO_TAB_PENDING) return PORTFOLIO_PATH;
  const sheet = portfolios.find((p) => p.id === id);
  const token = sheet?.slug || id;
  return `${PORTFOLIO_PATH}/${encodeURIComponent(token)}`;
}

/**
 * The tab id for a path, against the portfolios the reader actually has.
 *
 * `undefined` means the path names a portfolio this account does not own,
 * which is the one case a caller has to answer for (it sends them to
 * `/portfolio`, never a 404, since the dynamic segment always matches and
 * the book room always paints). `null` means the path is not in the book.
 *
 * A slug that arrives before the list does is handed back as itself rather
 * than refused: the same thing `resolveSheetIdFromSearch` did with
 * `?portfolio=`, and what lets a deep link survive a cold cache.
 */
export function tabIdFromPath(
  pathname: string,
  portfolios: Portfolio[]
): string | null | undefined {
  const path = normalizePath(pathname);
  for (const [metaPath, tabId] of META_PATHS) {
    if (path === metaPath) return tabId;
  }
  if (path === PORTFOLIO_PATH) {
    return resolveLastPortfolioId(portfolios) ?? PORTFOLIO_TAB_PENDING;
  }
  const named = new RegExp(`^${PORTFOLIO_PATH}/(.+)$`).exec(path);
  if (named?.[1]) {
    let raw = named[1];
    try {
      raw = decodeURIComponent(raw);
    } catch {
      /* a half-typed escape is just a token that matches nothing */
    }
    const token = raw.trim().toLowerCase();
    if (!token) return PORTFOLIO_TAB_PENDING;
    const found = portfolios.find(
      (p) =>
        p.id === token ||
        p.slug?.toLowerCase() === token ||
        p.name.toLowerCase() === token
    );
    if (found) return found.id;
    // No book yet: keep the token so the deep link survives the wait.
    if (portfolios.length === 0) return token;
    return undefined;
  }
  // Home, with the panel's opening left to whoever reads `isMargusPath`.
  if (path === MARGUS_PATH) return OVERVIEW_TAB_ID;
  if ((BOOK_ROOM_PATHS as readonly string[]).includes(path)) {
    return OVERVIEW_TAB_ID;
  }
  return null;
}
