import { resolveLastPortfolioId } from "@/lib/active-sheet";
import { PORTFOLIO_TAB_PENDING } from "@/lib/mobile-tab";
import {
  ALERTS_TAB_ID,
  COMPOUND_TAB_ID,
  LAB_TAB_ID,
  OVERVIEW_TAB_ID,
  PULSE_TAB_ID,
  SEASONALITY_TAB_ID,
} from "@/lib/overview";
import type { Portfolio } from "@/lib/types";

/**
 * Meta-tab ids that are still real top-level tabs. Seasonality moved
 * inside Lab, so anything persisted from before that move folds onto Lab
 * rather than resolving to a tab that no longer renders.
 */
export function normalizeMetaTabId(id: string): string | null {
  if (
    id === OVERVIEW_TAB_ID ||
    id === COMPOUND_TAB_ID ||
    id === LAB_TAB_ID ||
    id === PULSE_TAB_ID
  ) {
    return id;
  }
  if (id === ALERTS_TAB_ID) return ALERTS_TAB_ID;
  if (id === SEASONALITY_TAB_ID) return LAB_TAB_ID;
  return null;
}

export function metaTabFromToken(raw: string): string | null {
  if (raw === "compound" || raw === COMPOUND_TAB_ID) return COMPOUND_TAB_ID;
  if (raw === "lab" || raw === LAB_TAB_ID) return LAB_TAB_ID;
  if (raw === "pulse" || raw === PULSE_TAB_ID) return PULSE_TAB_ID;
  if (raw === "alerts" || raw === ALERTS_TAB_ID) return ALERTS_TAB_ID;
  if (raw === "overview" || raw === OVERVIEW_TAB_ID) return OVERVIEW_TAB_ID;
  if (
    raw === "statistics" ||
    raw === "stats" ||
    raw === "seasonality" ||
    raw === SEASONALITY_TAB_ID
  ) {
    return LAB_TAB_ID;
  }
  return null;
}

/**
 * Resolves `?tab=` / `?portfolio=` / legacy `?sheet=` to an active id.
 * Pure so it can run in the first paint and later when the list arrives.
 * Returns null when there is no param or it matches nothing.
 */
export function resolveSheetIdFromSearch(
  list: Portfolio[],
  params: URLSearchParams
): string | null {
  const tabParam = params.get("tab")?.trim().toLowerCase() || "";
  const portfolioParam = params.get("portfolio")?.trim().toLowerCase() || "";
  const sheetParam = params.get("sheet")?.trim().toLowerCase() || "";
  const tabToken =
    tabParam &&
    tabParam !== "portfolio" &&
    tabParam !== "book" &&
    tabParam !== "forecast"
      ? tabParam
      : "";
  if (tabToken) {
    const meta = metaTabFromToken(tabToken);
    if (meta) return meta;
  }
  if (!tabToken && !portfolioParam && sheetParam) {
    const meta = metaTabFromToken(sheetParam);
    if (meta) return meta;
  }
  const raw = portfolioParam || sheetParam;
  if (!raw) {
    if (tabParam === "portfolio" || tabParam === "book") {
      return resolveLastPortfolioId(list) ?? PORTFOLIO_TAB_PENDING;
    }
    return null;
  }
  const bySlugOrId = list.find(
    (p) =>
      p.id === raw ||
      p.slug?.toLowerCase() === raw ||
      p.name.toLowerCase() === raw
  );
  if (bySlugOrId) return bySlugOrId.id;
  if (list.length === 0) return raw;
  return null;
}

export function resolveSheetIdFromUrl(
  list: Portfolio[],
  pendingTab?: string | null
): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const pending = pendingTab?.trim();
  if (pending) params.set("tab", pending);
  return resolveSheetIdFromSearch(list, params);
}
