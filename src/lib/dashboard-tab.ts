/*
  What an old `?tab=` / `?sheet=` token meant, and nothing else.

  This file held the reader that turned those tokens into the open room,
  back when the query was the app's idea of where you were. The path is
  that now; see `book-routes.ts`. What is left is the one question a token
  can still raise, which is which room to retire it onto, asked by
  `legacy-urls.ts` on its way to a 308.
*/
import {
  ALERTS_TAB_ID,
  COMPOUND_TAB_ID,
  LAB_TAB_ID,
  OVERVIEW_TAB_ID,
  PULSE_TAB_ID,
  SEASONALITY_TAB_ID,
} from "@/lib/overview";

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

/*
  `resolveSheetIdFromSearch` / `resolveSheetIdFromUrl` and
  `normalizeMetaTabId` stood here and read the whole `?tab=` / `?portfolio=`
  / `?sheet=` grammar into a tab id, because the query was the app's idea of
  which room was open. `tabIdFromPath` reads the path instead, and the only
  thing still asking what an old token meant is the redirect that retires
  it, which needs `metaTabFromToken` above and nothing else. Do not wire a
  second reader of the query back up: two of them disagreeing about the open
  room is what the dock and the page used to do.
*/
