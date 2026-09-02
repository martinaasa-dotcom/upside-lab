import {
  ALERTS_TAB_ID,
  COMPOUND_TAB_ID,
  LAB_TAB_ID,
  OVERVIEW_TAB_ID,
  PULSE_TAB_ID,
} from "@/lib/overview";

/**
 * `/portfolio` before there is a portfolio to open.
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
 * Which phone-dock cell is on, from the Dashboard tab id.
 *
 * A portfolio id (UUID, slug, or the pending-holdings sentinel) is Holdings,
 * whether that portfolio has rows or not. The marker follows the room you
 * asked for, never the size of the table inside it.
 *
 * This is the only reader of the room on the phone. There used to be a
 * second one that read `?tab=` off the URL, and it read nothing: the proxy
 * retires that query with a 308 before any page sees it, so the path is
 * the room and `tabIdFromPath` (`book-routes.ts`) is what reads it.
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
