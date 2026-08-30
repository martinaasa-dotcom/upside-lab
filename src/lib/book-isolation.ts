/** Live sheet ids are postgres UUIDs. Local unsigned seed uses ids like `p-aasad`. */
const LIVE_SHEET_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isLiveSheetId(id: string | null | undefined): boolean {
  return Boolean(id && LIVE_SHEET_ID.test(id));
}

/** `source: "demo"` is unsigned local state. Never apply it to a signed-in user. */
export function isUnsignedLocalCache(cache: { source: string }): boolean {
  return cache.source === "demo";
}

/**
 * Signed-in books only keep live sheets (UUID ids from the server).
 * Permission is co-ownership on those rows, not a name allowlist.
 */
export function keepLiveSheetsOnly<
  T extends { id: string },
  H extends { portfolio_id: string },
>(
  portfolios: T[],
  holdings: H[]
): { portfolios: T[]; holdings: H[] } {
  const nextPortfolios = portfolios.filter((p) => isLiveSheetId(p.id));
  const keep = new Set(nextPortfolios.map((p) => p.id));
  return {
    portfolios: nextPortfolios,
    holdings: holdings.filter((h) => keep.has(h.portfolio_id)),
  };
}
