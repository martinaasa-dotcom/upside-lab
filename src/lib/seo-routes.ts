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

/**
 * Authenticated rooms. Crawlers get noindex. Share cards still show the
 * generic product image, never a user's book.
 */
export const PRIVATE_NOINDEX_PATHS = [
  "/dashboard",
  "/lab",
  "/forecast",
  "/margus",
  "/account",
  "/admin",
  "/upside-portfolio",
] as const;

/** Same keep-alive book shell as `/`. */
export const BOOK_ROOM_PATHS = [
  "/",
  "/login",
  "/dashboard",
  "/lab",
  "/forecast",
  "/margus",
] as const;

export const OG_IMAGE_PATH = "/og.png?v=5";
export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;
