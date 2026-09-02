/**
 * Public vs private URL lists. robots.txt, sitemap, X-Robots-Tag, and
 * the book-room aliases all import this so a new authenticated path
 * cannot be indexed by accident.
 */
// Relative on purpose: next.config.ts imports this file, and the config
// transpiler follows relative imports only -- an `@/` alias here makes
// `next start` fail to load the config at boot.
import { MARK_ASSET_VERSION } from "./brand/mark-version";

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
 *
 * `/auth` is here for its children: the email and linked-address pages and
 * the sign-in handlers under it. None of them is a room, and a crawler
 * that indexed one would be offering a sign-in button as a search result.
 * The `X-Robots-Tag` header in `next.config.ts` and the robots.txt line
 * both come from this list, so the prefix covers every handler under it.
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

export const OG_IMAGE_PATH = `/og.png?v=${MARK_ASSET_VERSION}`;
export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;
