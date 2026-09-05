/**
 * Instant-load cache for Communities — same "show cached instantly, then
 * quietly refresh" pattern as Thesis Pulse. Stores the raw JSON from
 * /api/communities/[id] + /api/communities/[id]/book so CommunityView can
 * hydrate synchronously on mount instead of always showing a loading
 * state, and so CommunitiesList can prefetch a community's data in the
 * background the moment the list loads (before the user even clicks in).
 */

import { currentDuelSessionKey, type DuelPick } from "@/lib/daily-duel";

const CACHE_PREFIX = "upside-community-v1:";
const LIST_CACHE_KEY = "upside-communities-list-v1";
const DISCOVER_CACHE_KEY = "upside-communities-discover-v1";
const DUEL_CACHE_PREFIX = "upside-community-duel-v1:";
const DUEL_PICK_PREFIX = "upside-community-duel-pick-v1:";
const SHEETS_CACHE_PREFIX = "upside-community-sheets-v1:";
const CACHE_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes — communities update slowly
/** Alt-tab / room return: don't hit the API again inside this window. */
export const COMMUNITY_VISIBLE_REFRESH_MS = 30_000;

/**
 * The last closed session, resolved server-side.
 *
 * The live duel never carries a result, on purpose: a running percentage
 * beside two buttons is the prediction spoiled. This is the separate,
 * finished one, which is what the "Yesterday" strip on the card reads.
 */
export type ClosedDuel = {
  dayKey: string;
  pair: { a: string; b: string };
  counts: { a: number; b: number };
  pctA: number | null;
  pctB: number | null;
  winner: DuelPick | "tie" | null;
  myPick: DuelPick | null;
  /** Everybody who picked the side that won, by name. */
  calledIt: string[];
};

export type CommunityDuelCache = {
  dayKey: string;
  pair: { a: string; b: string } | null;
  myPick: DuelPick | null;
  counts: { a: number; b: number };
  names?: { a: string[]; b: string[] };
  settled: boolean;
  pickCount: number;
  previous?: ClosedDuel | null;
  /** Closed sessions in a row this reader has called right. */
  streak?: number;
};

const duelMemory = new Map<string, CommunityDuelCache>();

function duelCacheKey(communityId: string): string {
  return `${DUEL_CACHE_PREFIX}${communityId}`;
}

function isDuelShape(v: unknown): v is CommunityDuelCache {
  if (!v || typeof v !== "object") return false;
  const o = v as CommunityDuelCache;
  return (
    typeof o.dayKey === "string" &&
    (o.myPick === "a" || o.myPick === "b" || o.myPick == null) &&
    typeof o.pickCount === "number" &&
    typeof o.settled === "boolean" &&
    o.counts != null &&
    typeof o.counts.a === "number" &&
    typeof o.counts.b === "number"
  );
}

export function loadCommunityDuelCache(
  communityId: string,
  dayKey: string = currentDuelSessionKey()
): CommunityDuelCache | null {
  const mem = duelMemory.get(communityId);
  if (mem && mem.dayKey === dayKey) return mem;
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(duelCacheKey(communityId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CommunityDuelCache;
    if (!isDuelShape(parsed) || parsed.dayKey !== dayKey) return null;
    duelMemory.set(communityId, parsed);
    return parsed;
  } catch {
    return null;
  }
}

export function saveCommunityDuelCache(
  communityId: string,
  duel: CommunityDuelCache
) {
  duelMemory.set(communityId, duel);
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(duelCacheKey(communityId), JSON.stringify(duel));
    if (duel.myPick) saveStickyDuelPick(communityId, duel.dayKey, duel.myPick);
  } catch {
    /* quota / private mode */
  }
}

function duelPickKey(communityId: string): string {
  return `${DUEL_PICK_PREFIX}${communityId}`;
}

export function loadStickyDuelPick(
  communityId: string,
  sessionKey: string
): DuelPick | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(duelPickKey(communityId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { sessionKey?: string; pick?: DuelPick };
    if (parsed.sessionKey !== sessionKey) return null;
    return parsed.pick === "a" || parsed.pick === "b" ? parsed.pick : null;
  } catch {
    return null;
  }
}

export function saveStickyDuelPick(
  communityId: string,
  sessionKey: string,
  pick: DuelPick
) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      duelPickKey(communityId),
      JSON.stringify({ sessionKey, pick })
    );
  } catch {
    /* quota / private mode */
  }
}

export type CommunitySheetRow = { id: string; name: string; shared: boolean };

const sheetsMemory = new Map<string, CommunitySheetRow[]>();

function sheetsCacheKey(communityId: string): string {
  return `${SHEETS_CACHE_PREFIX}${communityId}`;
}

function isSheetsShape(v: unknown): v is CommunitySheetRow[] {
  if (!Array.isArray(v)) return false;
  return v.every(
    (row) =>
      row &&
      typeof row === "object" &&
      typeof (row as CommunitySheetRow).id === "string" &&
      typeof (row as CommunitySheetRow).name === "string" &&
      typeof (row as CommunitySheetRow).shared === "boolean"
  );
}

export function loadCommunitySheetsCache(
  communityId: string
): CommunitySheetRow[] | null {
  const mem = sheetsMemory.get(communityId);
  if (mem) return mem;
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(sheetsCacheKey(communityId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isSheetsShape(parsed)) return null;
    sheetsMemory.set(communityId, parsed);
    return parsed;
  } catch {
    return null;
  }
}

export function saveCommunitySheetsCache(
  communityId: string,
  sheets: CommunitySheetRow[]
) {
  sheetsMemory.set(communityId, sheets);
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      sheetsCacheKey(communityId),
      JSON.stringify(sheets)
    );
  } catch {
    /* quota / private mode */
  }
}

export type CommunityListRow = {
  id: string;
  name: string;
  role: string;
  visibility?: "public" | "private";
  kind?: "circle" | "classroom";
};

export type CommunityCacheEntry = {
  meta: unknown;
  book: unknown;
  cachedAt: string;
};

const detailMemory = new Map<string, CommunityCacheEntry>();
let listMemory: CommunityListRow[] | null = null;

function cacheKey(communityId: string): string {
  return `${CACHE_PREFIX}${communityId}`;
}

export function loadCommunityListCache(): CommunityListRow[] | null {
  if (listMemory) return listMemory;
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LIST_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    listMemory = parsed as CommunityListRow[];
    return listMemory;
  } catch {
    return null;
  }
}

export function saveCommunityListCache(rows: CommunityListRow[]) {
  listMemory = rows;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LIST_CACHE_KEY, JSON.stringify(rows));
  } catch {
    /* ignore quota / private mode */
  }
}

/** Stamp a just-redeemed invite into the list so Circle opens immediately. */
export function rememberJoinedCommunity(row: CommunityListRow) {
  const existing = loadCommunityListCache() ?? [];
  saveCommunityListCache([
    row,
    ...existing.filter((c) => c.id !== row.id),
  ]);
}

export type CommunityDiscoverRow = {
  id: string;
  name: string;
  houseNote?: string | null;
  memberCount: number;
  requestStatus: "pending" | "approved" | "rejected" | null;
  /** True when asking to join this circle is the same thing as joining. */
  autoApproveJoins?: boolean;
};

let discoverMemory: CommunityDiscoverRow[] | null = null;

function isDiscoverShape(v: unknown): v is CommunityDiscoverRow[] {
  if (!Array.isArray(v)) return false;
  return v.every(
    (row) =>
      row &&
      typeof row === "object" &&
      typeof (row as CommunityDiscoverRow).id === "string" &&
      typeof (row as CommunityDiscoverRow).name === "string"
  );
}

export function loadCommunityDiscoverCache(): CommunityDiscoverRow[] | null {
  if (discoverMemory) return discoverMemory;
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DISCOVER_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isDiscoverShape(parsed)) return null;
    discoverMemory = parsed;
    return parsed;
  } catch {
    return null;
  }
}

export function saveCommunityDiscoverCache(rows: CommunityDiscoverRow[]) {
  discoverMemory = rows;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DISCOVER_CACHE_KEY, JSON.stringify(rows));
  } catch {
    /* ignore quota / private mode */
  }
}

export function loadCommunityCache(
  communityId: string
): CommunityCacheEntry | null {
  const mem = detailMemory.get(communityId);
  if (mem) return mem;
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(cacheKey(communityId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CommunityCacheEntry | null;
    if (!parsed?.meta || !parsed?.book || !parsed?.cachedAt) return null;
    detailMemory.set(communityId, parsed);
    return parsed;
  } catch {
    return null;
  }
}

export function saveCommunityCache(
  communityId: string,
  entry: { meta: unknown; book: unknown }
) {
  const next: CommunityCacheEntry = {
    ...entry,
    cachedAt: new Date().toISOString(),
  };
  detailMemory.set(communityId, next);
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(cacheKey(communityId), JSON.stringify(next));
  } catch {
    /* ignore quota / private mode */
  }
}

export function isCommunityCacheFresh(
  entry: CommunityCacheEntry | null,
  maxAgeMs: number = CACHE_MAX_AGE_MS
): boolean {
  if (!entry?.cachedAt) return false;
  const ts = new Date(entry.cachedAt).getTime();
  return Number.isFinite(ts) && Date.now() - ts < maxAgeMs;
}

/** Drop a community's cached entry — call after deleting/leaving one so a
 * stale copy doesn't linger in localStorage forever. */
export function clearCommunityCache(communityId: string) {
  detailMemory.delete(communityId);
  sheetsMemory.delete(communityId);
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(cacheKey(communityId));
    window.localStorage.removeItem(sheetsCacheKey(communityId));
  } catch {
    /* ignore */
  }
}

export function prefetchCommunityList(rows: CommunityListRow[]) {
  for (const row of rows) void prefetchCommunity(row.id);
}

/** Fetch + cache one community's meta, book, duel, and share toggles
 * in the background. CommunitiesList warms every row as soon as the
 * list is known, so clicking in (and then Members) already has data
 * instead of starting those fetches from zero. */
export async function prefetchCommunity(communityId: string): Promise<void> {
  try {
    const cached = loadCommunityCache(communityId);
    const needBook = !isCommunityCacheFresh(cached);
    const needDuel = loadCommunityDuelCache(communityId) == null;
    const needSheets = loadCommunitySheetsCache(communityId) == null;
    if (!needBook && !needDuel && !needSheets) return;
    const [metaRes, bookRes, duelRes, sheetsRes] = await Promise.all([
      needBook
        ? fetch(`/api/communities/${communityId}`, { cache: "no-store" })
        : null,
      needBook
        ? fetch(`/api/communities/${communityId}/book`, { cache: "no-store" })
        : null,
      needDuel
        ? fetch(`/api/communities/${communityId}/duel`, { cache: "no-store" })
        : null,
      needSheets
        ? fetch(`/api/communities/${communityId}/sheets`, { cache: "no-store" })
        : null,
    ]);
    if (needBook && metaRes && bookRes && metaRes.ok && bookRes.ok) {
      const [meta, book] = await Promise.all([metaRes.json(), bookRes.json()]);
      saveCommunityCache(communityId, { meta, book });
    }
    if (needDuel && duelRes?.ok) {
      const duel = (await duelRes.json()) as CommunityDuelCache;
      if (isDuelShape(duel)) saveCommunityDuelCache(communityId, duel);
    }
    if (needSheets && sheetsRes?.ok) {
      const data = (await sheetsRes.json()) as { sheets?: unknown };
      if (isSheetsShape(data.sheets)) {
        saveCommunitySheetsCache(communityId, data.sheets);
      }
    }
  } catch {
    /* best-effort prefetch — CommunityView's own fetch is the source of truth */
  }
}

/**
 * What the button on a discover row says.
 *
 * A public circle that lets people straight in must not offer a button
 * reading "Request to join": the reader presses it, is in the circle, and
 * the word promised a wait that never happened. The circle says which
 * kind it is (`autoApproveJoins`), and the button says the same thing.
 */
export function joinButtonLabel({
  busy,
  autoApprove,
  requestStatus,
}: {
  busy: boolean;
  autoApprove: boolean;
  requestStatus: CommunityDiscoverRow["requestStatus"];
}) {
  if (busy) return autoApprove ? "Joining …" : "Requesting …";
  if (autoApprove) return "Join";
  if (requestStatus === "rejected") return "Request again";
  return "Request to join";
}
