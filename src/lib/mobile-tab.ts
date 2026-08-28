import {
  ALERTS_TAB_ID,
  COMPOUND_TAB_ID,
  LAB_TAB_ID,
  OVERVIEW_TAB_ID,
  PULSE_TAB_ID,
} from "@/lib/overview";

/**
 * `?tab=portfolio` before there is a portfolio to open.
 *
 * Distinct from `null`, which means nothing was asked for. This asked for
 * the holdings table. It is a real room id: the Holdings cell stays lit
 * even when the table is empty or the list has not loaded yet.
 */
export const PORTFOLIO_TAB_PENDING = "__portfolio_pending__";

export type MobileTabId =
  | "home"
  | "holdings"
  | "pulse"
  | "lab"
  | "compound"
  | "circle";

/**
 * Which phone-dock cell is on, from the URL alone.
 *
 * Holdings is `?tab=portfolio` (and the old `book` / `forecast` spellings).
 * An empty table does not change the room: the query is the room.
 */
export function activeMobileTab(
  pathname: string,
  tabParam?: string | null
): MobileTabId | null {
  if (pathname.startsWith("/account") || pathname.startsWith("/admin")) {
    return null;
  }
  if (pathname.startsWith("/upside-portfolio")) {
    return null;
  }
  if (pathname.startsWith("/communities")) {
    return "circle";
  }
  const tab = (tabParam ?? "").toLowerCase();
  if (tab === "pulse") return "pulse";
  if (tab === "lab") return "lab";
  if (tab === "compound") return "compound";
  /*
    `book` is the old spelling of `portfolio` and `forecast` is a panel on a
    portfolio rather than a room of its own, so all three are the holdings
    table. Kept in step with `legacyRedirectPath`, which retires all three
    onto `/portfolio` and has to agree about what they meant.
  */
  if (tab === "portfolio" || tab === "book" || tab === "forecast") {
    return "holdings";
  }
  return "home";
}

/**
 * Which phone-dock cell is on, from the Dashboard tab id.
 *
 * A portfolio id (UUID, slug, or the pending-holdings sentinel) is Holdings,
 * whether that portfolio has rows or not. The marker follows the room you
 * asked for, never the size of the table inside it.
 */
export function mobileTabFromActiveId(
  activeId: string | null | undefined
): MobileTabId | null {
  if (!activeId) return null;
  if (activeId === PULSE_TAB_ID) return "pulse";
  if (activeId === LAB_TAB_ID) return "lab";
  if (activeId === COMPOUND_TAB_ID) return "compound";
  if (activeId === OVERVIEW_TAB_ID || activeId === ALERTS_TAB_ID) return "home";
  // Portfolio ids, slugs, and PORTFOLIO_TAB_PENDING. Rows do not matter.
  return "holdings";
}
