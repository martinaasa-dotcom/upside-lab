/** Persist which portfolio tab is active across reloads. */

export const ACTIVE_SHEET_KEY = "upside-active-sheet-id";
/** One-shot: Circle dock clicked Pulse, Next dropped ?tab=, still land there. */
export const OPEN_TAB_KEY = "upside-open-tab";

export function stashOpenTab(tab: string) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(OPEN_TAB_KEY, tab);
  } catch {
    /* ignore */
  }
}

export function takeOpenTab(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = sessionStorage.getItem(OPEN_TAB_KEY);
    if (value) sessionStorage.removeItem(OPEN_TAB_KEY);
    return value;
  } catch {
    return null;
  }
}

export function loadActiveSheetId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(ACTIVE_SHEET_KEY);
  } catch {
    return null;
  }
}

export function saveActiveSheetId(id: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ACTIVE_SHEET_KEY, id);
  } catch {
    /* ignore */
  }
}

/**
 * The last portfolio you actually opened, as opposed to the last tab.
 *
 * `ACTIVE_SHEET_KEY` above stores whichever tab you were on, meta-tabs
 * included, so most of the time it is holding `__overview__` and cannot
 * answer "which portfolio was I in". The phone dock's Holdings cell needs
 * that answer and nothing else: it is one cell that has to land somewhere
 * sensible from any room in the app, including the rooms that never load a
 * portfolio (Account, Circle, Admin).
 *
 * It stores an id rather than a slug. A slug moves when somebody renames a
 * portfolio and a stale one resolves to nothing, which would drop the reader
 * on Overview from the one cell whose whole job is not doing that.
 */
export const LAST_PORTFOLIO_KEY = "upside-last-portfolio-id";

/** Fired on save so a dock already on screen re-points without a reload. */
export const LAST_PORTFOLIO_EVENT = "upside:last-portfolio";

export function saveLastPortfolioId(id: string) {
  if (typeof window === "undefined" || !id) return;
  try {
    if (localStorage.getItem(LAST_PORTFOLIO_KEY) === id) return;
    localStorage.setItem(LAST_PORTFOLIO_KEY, id);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(LAST_PORTFOLIO_EVENT));
}

export function loadLastPortfolioId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(LAST_PORTFOLIO_KEY);
  } catch {
    return null;
  }
}

/**
 * Which portfolio the Holdings cell should open, given the portfolios this
 * account actually has.
 *
 * Both fallbacks are load-bearing. A remembered id that is no longer in the
 * list is a portfolio somebody deleted, and a reader who has never opened one
 * has no memory at all; in either case the first portfolio is a real answer
 * and Overview is not, because Overview is the room they are trying to leave.
 */
export function resolveLastPortfolioId<T extends { id: string }>(
  list: T[]
): string | null {
  if (list.length === 0) return null;
  const remembered = loadLastPortfolioId();
  const match = remembered
    ? list.find((p) => p.id === remembered)
    : undefined;
  return (match ?? list[0]).id;
}

/**
 * A dock cell and the open tab are the same portfolio.
 *
 * The URL may hold a slug while `activeId` is the id (or the other way
 * around). Matching only on id left the laptop cell dark after a slug
 * write-back.
 */
export function sheetMatchesActive(
  sheet: { id: string; slug?: string | null },
  activeId: string | null | undefined
): boolean {
  if (!activeId) return false;
  return (
    sheet.id === activeId ||
    sheet.slug?.toLowerCase() === activeId.toLowerCase()
  );
}

/**
 * The one portfolio Margus (and any other write that must not ask) talks to.
 *
 * The open tab wins. On Home / Pulse / Lab there is no open tab, so this is
 * the same last-opened answer the phone's Holdings cell uses. Never Overview.
 */
export function pickChatPortfolio<T extends { id: string }>(
  list: T[],
  active: T | null
): T | null {
  if (active) return active;
  const id = resolveLastPortfolioId(list);
  if (!id) return null;
  return list.find((p) => p.id === id) ?? null;
}
