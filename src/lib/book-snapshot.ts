import type { SupabaseClient } from "@supabase/supabase-js";
import { readAll } from "@/lib/supabase/read-all";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";

export type BookSnapshotKind = "nightly" | "pre_delete" | "manual";

export type SnapshotMarks = {
  capturedAt: string;
  quotes: Record<string, number>;
  navByPortfolio: Record<string, number>;
};

export type BookSnapshotPayload = {
  portfolios: unknown[];
  holdings: unknown[];
  /** Mark-to-market at capture time. Older snapshots omit this. */
  marks?: SnapshotMarks;
};

export type BookSnapshotRow = {
  id: string;
  kind: BookSnapshotKind;
  label: string;
  payload: BookSnapshotPayload;
  created_at: string;
};

/**
 * Nightly rows kept, and therefore the widest window any nightly-history
 * reader can hope to see. Exported so a reader can bound its own query to the
 * same number instead of picking an unrelated magic limit.
 */
export const NIGHTLY_SNAPSHOT_WINDOW = 14;

const KEEP_NIGHTLY = NIGHTLY_SNAPSHOT_WINDOW;
const KEEP_PRE_DELETE = 30;
const KEEP_MANUAL = 20;

export async function captureBookPayload(
  supabase: SupabaseClient,
  opts?: { portfolioIds?: string[] }
): Promise<BookSnapshotPayload> {
  const ids = opts?.portfolioIds;
  if (ids && ids.length === 0) {
    return { portfolios: [], holdings: [] };
  }

  /*
    A page at a time, because a snapshot is complete or it is not a snapshot.

    The nightly cron calls this with no ids at all, which is every portfolio
    and every holding in the project. PostgREST answers with at most
    db-max-rows -- a Supabase project is set to 1,000 -- and it does that
    silently: no error, just a shorter list. A backup missing most of its rows
    and looking exactly like a good one is worse than no backup, and
    docs/DISASTER_RECOVERY.md rests on these.
  */
  const portQ = () => {
    const q = supabase
      .from(PORTFELL_TABLES.portfolios)
      .select("*")
      .order("sort_order");
    return ids?.length ? q.in("id", ids) : q;
  };
  const holdQ = () => {
    const q = supabase
      .from(PORTFELL_TABLES.holdings)
      .select("*")
      .order("sort_order");
    return ids?.length ? q.in("portfolio_id", ids) : q;
  };

  const [portfolios, holdings] = await Promise.all([
    readAll<unknown>(portQ, "throw"),
    readAll<unknown>(holdQ, "throw"),
  ]);

  return { portfolios, holdings };
}

/** Snapshot sheet ids that this person actually owns. */
export function snapshotSheetsForOwner(
  payload: BookSnapshotPayload,
  ownedIds: string[]
): string[] {
  const owned = new Set(ownedIds.filter(Boolean));
  const rows = Array.isArray(payload.portfolios) ? payload.portfolios : [];
  const out: string[] = [];
  for (const raw of rows) {
    const id = (raw as { id?: string }).id;
    if (id && owned.has(id)) out.push(id);
  }
  return out;
}

/**
 * Keep only this person's sheets from a mixed nightly/manual snapshot.
 * Other people's cash and holdings never leave in an export.
 */
export function sliceSnapshotPayload(
  payload: BookSnapshotPayload,
  ownedIds: string[]
): BookSnapshotPayload | null {
  const keep = new Set(snapshotSheetsForOwner(payload, ownedIds));
  if (keep.size === 0) return null;
  const portfolios = (Array.isArray(payload.portfolios) ? payload.portfolios : []).filter(
    (raw) => {
      const id = (raw as { id?: string }).id;
      return Boolean(id && keep.has(id));
    }
  );
  const holdings = (Array.isArray(payload.holdings) ? payload.holdings : []).filter(
    (raw) => {
      const id = (raw as { portfolio_id?: string }).portfolio_id;
      return Boolean(id && keep.has(id));
    }
  );
  const marks = payload.marks
    ? {
        ...payload.marks,
        navByPortfolio: Object.fromEntries(
          Object.entries(payload.marks.navByPortfolio ?? {}).filter(([id]) =>
            keep.has(id)
          )
        ),
      }
    : undefined;
  return { portfolios, holdings, ...(marks ? { marks } : {}) };
}

/** Drop deleted sheet ids from a snapshot payload. Mirrors the SQL scrub. */
export function scrubSnapshotPayload(
  payload: BookSnapshotPayload,
  deletedIds: string[]
): BookSnapshotPayload {
  const drop = new Set(deletedIds.filter(Boolean));
  if (drop.size === 0) return payload;
  const portfolios = (Array.isArray(payload.portfolios) ? payload.portfolios : []).filter(
    (raw) => {
      const id = (raw as { id?: string }).id;
      return !id || !drop.has(id);
    }
  );
  const holdings = (Array.isArray(payload.holdings) ? payload.holdings : []).filter(
    (raw) => {
      const id = (raw as { portfolio_id?: string }).portfolio_id;
      return !id || !drop.has(id);
    }
  );
  const marks = payload.marks
    ? {
        ...payload.marks,
        navByPortfolio: Object.fromEntries(
          Object.entries(payload.marks.navByPortfolio ?? {}).filter(
            ([id]) => !drop.has(id)
          )
        ),
      }
    : undefined;
  return { portfolios, holdings, ...(marks ? { marks } : {}) };
}

/**
 * Nightly NAV per sheet, from live quotes. Restore ignores this. Home's
 * 14-day spark reads it. Missing quotes fall back to cost, which is worse
 * than a hole, so callers should only attach marks when quotes actually
 * covered the book.
 */
export function computeSnapshotMarks(
  portfolios: unknown[],
  holdings: unknown[],
  quotes: Record<string, { price?: number }>
): SnapshotMarks {
  const navByPortfolio: Record<string, number> = {};
  const prices: Record<string, number> = {};

  for (const raw of portfolios) {
    const p = raw as { id?: string; cash_balance?: number };
    if (!p.id) continue;
    navByPortfolio[p.id] = Number(p.cash_balance ?? 0);
  }

  for (const raw of holdings) {
    const h = raw as {
      portfolio_id?: string;
      ticker?: string;
      shares?: number;
      buy_price?: number;
    };
    const pid = h.portfolio_id;
    const ticker = String(h.ticker ?? "").toUpperCase();
    if (!pid || !ticker) continue;
    const shares = Number(h.shares ?? 0);
    const spot = quotes[ticker]?.price;
    const price =
      typeof spot === "number" && spot > 0 ? spot : Number(h.buy_price ?? 0);
    if (typeof spot === "number" && spot > 0) prices[ticker] = spot;
    navByPortfolio[pid] = (navByPortfolio[pid] ?? 0) + shares * price;
  }

  return {
    capturedAt: new Date().toISOString(),
    quotes: prices,
    navByPortfolio,
  };
}

export async function saveBookSnapshot(
  supabase: SupabaseClient,
  kind: BookSnapshotKind,
  label: string,
  payload?: BookSnapshotPayload
): Promise<BookSnapshotRow> {
  const body = payload ?? (await captureBookPayload(supabase));
  const { data, error } = await supabase
    .from(PORTFELL_TABLES.snapshots)
    .insert({
      kind,
      label,
      payload: body,
    })
    .select("id, kind, label, payload, created_at")
    .single();
  if (error) throw new Error(error.message);
  return data as BookSnapshotRow;
}

export async function pruneOldSnapshots(supabase: SupabaseClient) {
  const [{ data: nightly }, { data: preDelete }, { data: manuals }] =
    await Promise.all([
      supabase
        .from(PORTFELL_TABLES.snapshots)
        .select("id")
        .eq("kind", "nightly")
        .order("created_at", { ascending: false }),
      supabase
        .from(PORTFELL_TABLES.snapshots)
        .select("id")
        .eq("kind", "pre_delete")
        .order("created_at", { ascending: false }),
      supabase
        .from(PORTFELL_TABLES.snapshots)
        .select("id")
        .eq("kind", "manual")
        .order("created_at", { ascending: false }),
    ]);

  const dropIds = [
    ...(nightly ?? []).slice(KEEP_NIGHTLY).map((r) => r.id as string),
    ...(preDelete ?? []).slice(KEEP_PRE_DELETE).map((r) => r.id as string),
    ...(manuals ?? []).slice(KEEP_MANUAL).map((r) => r.id as string),
  ];
  if (dropIds.length === 0) return;
  await supabase.from(PORTFELL_TABLES.snapshots).delete().in("id", dropIds);
}

/**
 * Put the caller's own sheets back from a save. Never deletes a sheet,
 * never touches a book they do not own.
 */
export async function restoreBookFromSnapshot(
  supabase: SupabaseClient,
  snapshotId: string,
  ownedPortfolioIds: string[]
): Promise<{ portfolios: number; holdings: number }> {
  const { data: snap, error: sErr } = await supabase
    .from(PORTFELL_TABLES.snapshots)
    .select("id, payload")
    .eq("id", snapshotId)
    .single();
  if (sErr || !snap) throw new Error(sErr?.message ?? "Snapshot not found");

  const payload = snap.payload as BookSnapshotPayload;
  const ids = snapshotSheetsForOwner(payload, ownedPortfolioIds);
  if (ids.length === 0) {
    throw new Error("This save has none of your portfolios.");
  }

  let holdings = 0;
  for (const id of ids) {
    const counts = await applySheetFromPayload(supabase, id, payload);
    holdings += counts.holdings;
  }
  return { portfolios: ids.length, holdings };
}

type SnapshotPortfolio = {
  id?: string;
  slug?: string;
  name?: string;
  cash_balance?: number;
  sort_order?: number;
  [key: string]: unknown;
};

type SnapshotHolding = {
  id?: string;
  portfolio_id?: string;
  ticker?: string;
  shares?: number;
  buy_price?: number;
  eoy_target?: number | null;
  target_call_pct?: number;
  stock_target_override?: number | null;
  sort_order?: number;
  [key: string]: unknown;
};

async function applySheetFromPayload(
  supabase: SupabaseClient,
  livePortfolioId: string,
  payload: BookSnapshotPayload
): Promise<{ holdings: number; cash: number }> {
  const { data: live, error: liveErr } = await supabase
    .from(PORTFELL_TABLES.portfolios)
    .select("id, slug, name")
    .eq("id", livePortfolioId)
    .single();
  if (liveErr || !live) throw new Error(liveErr?.message ?? "Portfolio not found");

  const portfolios = (Array.isArray(payload.portfolios)
    ? payload.portfolios
    : []) as SnapshotPortfolio[];
  const holdings = (Array.isArray(payload.holdings)
    ? payload.holdings
    : []) as SnapshotHolding[];

  const match =
    portfolios.find((p) => p.id === livePortfolioId) ||
    portfolios.find(
      (p) =>
        p.slug &&
        live.slug &&
        String(p.slug).toLowerCase() === String(live.slug).toLowerCase()
    ) ||
    portfolios.find(
      (p) =>
        p.name &&
        live.name &&
        String(p.name).toLowerCase() === String(live.name).toLowerCase()
    );

  if (!match) {
    throw new Error(
      `Snapshot has no portfolio matching “${live.name}” (id/slug/name)`
    );
  }

  const snapPortfolioId = match.id;
  const sheetHoldings = holdings.filter((h) =>
    snapPortfolioId ? h.portfolio_id === snapPortfolioId : false
  );

  const cash = Number(match.cash_balance ?? 0);
  const { error: cashErr } = await supabase
    .from(PORTFELL_TABLES.portfolios)
    .update({
      cash_balance: cash,
      updated_at: new Date().toISOString(),
    })
    .eq("id", livePortfolioId);
  if (cashErr) throw new Error(cashErr.message);

  const { error: delErr } = await supabase
    .from(PORTFELL_TABLES.holdings)
    .delete()
    .eq("portfolio_id", livePortfolioId);
  if (delErr) throw new Error(delErr.message);

  if (sheetHoldings.length > 0) {
    const rows = sheetHoldings.map((h, i) => ({
      portfolio_id: livePortfolioId,
      ticker: String(h.ticker ?? "").toUpperCase(),
      shares: Number(h.shares ?? 0),
      buy_price: Number(h.buy_price ?? 0),
      eoy_target: h.eoy_target ?? null,
      target_call_pct: Number(h.target_call_pct ?? 0.15),
      stock_target_override: h.stock_target_override ?? null,
      sort_order: Number(h.sort_order ?? i + 1),
    }));
    const { error: hIns } = await supabase
      .from(PORTFELL_TABLES.holdings)
      .insert(rows);
    if (hIns) throw new Error(hIns.message);
  }

  return { holdings: sheetHoldings.length, cash };
}

/**
 * Replace one live sheet's cash + holdings from a book snapshot.
 * Matches snapshot portfolio by id, then slug, then name.
 */
export async function restoreSheetFromSnapshot(
  supabase: SupabaseClient,
  snapshotId: string,
  livePortfolioId: string
): Promise<{ holdings: number; cash: number }> {
  const { data: snap, error: sErr } = await supabase
    .from(PORTFELL_TABLES.snapshots)
    .select("id, payload")
    .eq("id", snapshotId)
    .single();
  if (sErr || !snap) throw new Error(sErr?.message ?? "Snapshot not found");

  return applySheetFromPayload(
    supabase,
    livePortfolioId,
    snap.payload as BookSnapshotPayload
  );
}
