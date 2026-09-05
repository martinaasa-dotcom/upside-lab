import { BOOK_ROOM_PATHS } from "@/lib/seo-routes";

function normalizePath(pathname: string): string {
  const noQuery = pathname.split("?")[0] ?? pathname;
  if (!noQuery || noQuery === "/") return "/";
  return noQuery.replace(/\/+$/, "") || "/";
}

/**
 * One id per keep-alive pane. Join flows and legal pages return null so
 * they are not cached. Kept free of localStorage so crash telemetry can
 * import it without pulling the community cache into every page chunk.
 */
export function workspaceRoomId(pathname: string): string | null {
  const path = normalizePath(pathname);
  if (path.startsWith("/communities/join")) return null;
  if (path.startsWith("/account/join")) return null;
  if ((BOOK_ROOM_PATHS as readonly string[]).includes(path)) return "book";
  /*
    Before `/portfolio`, and anchored on the slash. `/upside-portfolio` is
    the Fund, a different room entirely, and a prefix test loose enough to
    claim it would move the Fund into the book without anything failing.
  */
  if (path.startsWith("/upside-portfolio")) return "fund";
  if (path.startsWith("/portfolio/")) return "book";
  /*
    One room per company, not one room for all of them.

    Two companies are two different pages with two different fetches, and
    the shell keys its keep-alive panes on this id: a shared "stock" id
    would show the reader the last company they looked at while the new one
    loaded, which is worse than a spinner because it is wrong rather than
    empty. `pruneStockRooms` in the shell keeps the count down.
  */
  const stock = /^\/stock\/([^/]+)$/.exec(path);
  if (stock?.[1]) {
    try {
      return `stock:${decodeURIComponent(stock[1]).toUpperCase()}`;
    } catch {
      return `stock:${stock[1].toUpperCase()}`;
    }
  }
  if (path === "/communities") return "communities";
  const community = /^\/communities\/([^/]+)$/.exec(path);
  if (community?.[1]) return `community:${community[1]}`;
  if (path.startsWith("/account")) return "account";
  if (path.startsWith("/admin")) return "admin";
  return null;
}
