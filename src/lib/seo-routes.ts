/**
 * Public vs private URL lists. robots.txt, sitemap, X-Robots-Tag, and
 * the book-room aliases all import this so a new authenticated path
 * cannot be indexed by accident.
 */
// Relative on purpose: next.config.ts imports this file, and the config
// transpiler follows relative imports only -- an `@/` alias here makes
// `next start` fail to load the config at boot.
import { OG_CARD_VERSION } from "./brand/og-version";

/** URLs that may be indexed and used as share cards. */
export const PUBLIC_INDEX_PATHS = [
  "/",
  "/login",
  "/communities",
  "/research",
  "/terms",
  "/privacy",
] as const;

export type PublicIndexPath = (typeof PUBLIC_INDEX_PATHS)[number];

/**
 * Sections whose CHILDREN are public and indexed while the section's own
 * address is not a page.
 *
 * `/stock/<ticker>` is every company page: public, server-rendered, in the
 * sitemap one by one, and the address the app shares. `/stock` on its own
 * has no page (the directory of companies is `/research`), so it cannot go
 * in the list above, which the sitemap prints as URLs, and it must not go
 * in the private list either. robots.txt allows the children by name
 * (`/stock/`) from this list.
 */
export const PUBLIC_CHILDREN_PATHS = ["/stock"] as const;

/**
 * Authenticated rooms. Crawlers get noindex. Share cards still show the
 * generic product image, never a user's book.
 *
 * `/auth` is here for its children: the email and linked-address pages and
 * the sign-in handlers under it. None of them is a room, and a crawler
 * that indexed one would be offering a sign-in button as a search result.
 * The `X-Robots-Tag` header in `next.config.ts` and the robots.txt line
 * both come from this list, so the prefix covers every handler under it.
 *
 * `/research` and `/stock` are deliberately NOT here. They are the one
 * section of this app written to be found by strangers: the index at
 * `/research` and every company page at `/stock/<ticker>` are public,
 * indexed, and named in the sitemap. A company page is the same address
 * for everybody; a signed-in reader gets their own holdings drawn beside
 * it in the browser, which is never part of what a crawler or a stranger
 * receives (see `src/app/stock/[ticker]/page.tsx`).
 *
 * `/dashboard` and `/forecast` are not here because they have no page:
 * `src/proxy.ts` answers both with a 308 to `/` before any page could
 * run, so a header or a robots line for them would describe a response
 * nobody ever receives.
 */
export const PRIVATE_NOINDEX_PATHS = [
  "/lab",
  "/pulse",
  "/growth",
  "/alerts",
  "/portfolio",
  "/margus",
  "/account",
  "/admin",
  "/upside-portfolio",
  "/auth",
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
  "/lab",
  "/pulse",
  "/growth",
  "/alerts",
  "/portfolio",
  "/margus",
] as const;

/* Versioned by the card's own bytes, so a new card is a new URL to every
   unfurler that cached the old one. See `src/lib/brand/og-version.ts`. */
export const OG_IMAGE_PATH = `/og.png?v=${OG_CARD_VERSION}`;
export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;
