/**
 * Public vs private URL lists. robots.txt, sitemap, X-Robots-Tag, and
 * the book-room aliases all import this so a new authenticated path
 * cannot be indexed by accident.
 */

/** URLs that may be indexed and used as share cards. */
export const PUBLIC_INDEX_PATHS = [
  "/",
  "/login",
  "/communities",
  "/terms",
  "/privacy",
] as const;

export type PublicIndexPath = (typeof PUBLIC_INDEX_PATHS)[number];

/**
 * Authenticated rooms. Crawlers get noindex. Share cards still show the
 * generic product image, never a user's book.
 */
export const PRIVATE_NOINDEX_PATHS = [
  "/dashboard",
  "/lab",
  "/pulse",
  "/growth",
  "/alerts",
  "/portfolio",
  "/forecast",
  "/margus",
  "/account",
  "/admin",
  "/upside-portfolio",
] as const;

/**
 * Same keep-alive book shell as `/`.
 *
 * Home, Pulse, Lab, Growth, Alerts and every portfolio are separate paths
 * and one room: the book's pollers live in the Dashboard instance this
 * shell mounts, so they have to survive a walk between them. Giving each
 * page its own room would give each its own poller, which is more traffic
 * for the same screen. See `src/lib/book-routes.ts`.
 */
export const BOOK_ROOM_PATHS = [
  "/",
  "/login",
  "/dashboard",
  "/lab",
  "/pulse",
  "/growth",
  "/alerts",
  "/portfolio",
  "/forecast",
  "/margus",
] as const;

export const OG_IMAGE_PATH = "/og.png?v=8";
export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;
