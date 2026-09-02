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

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How long a before-delete copy is kept, whatever the count says.
 *
 * Deleting a portfolio takes a copy of it first, holding by holding, so
 * there is an undo. Nobody asks for that copy and nobody is shown it going
 * stale, and keeping thirty of them by count alone means a person who has
 * deleted three portfolios in two years still has all three sitting there
 * with their holdings in them. A month is a generous undo window and is
 * where an unasked-for copy of somebody's holdings stops earning its keep.
 * A save the reader made themselves is a different thing and is not bounded
 * by age here: they asked for it, they can see it, and taking it away on a
 * timer would be the app throwing out something somebody meant to keep.
 */
export const PRE_DELETE_SNAPSHOT_MAX_AGE_DAYS = 30;

/**
 * Which saved copies to drop, newest row first.
 *
 * Two bounds rather than one, and a row past either goes: everything after
 * `keep`, and, when `maxAgeDays` is given, anything older than that however
 * few there are. A row whose timestamp cannot be read is kept, because
 * deleting somebody's save on the strength of a date nobody could parse is
 * the wrong way round to be wrong.
 */
export function snapshotsToPrune(
  rows: { id?: string | null; created_at?: string | null }[],
  opts: { keep: number; maxAgeDays?: number; now?: number }
): string[] {
  const now = opts.now ?? Date.now();
  const cutoff =
    opts.maxAgeDays == null ? null : now - opts.maxAgeDays * DAY_MS;
  const drop: string[] = [];
  rows.forEach((row, index) => {
    const id = row?.id;
    if (!id) return;
    if (index >= opts.keep) {
      drop.push(id);
      return;
    }
    if (cutoff == null) return;
    const at = row.created_at ? Date.parse(row.created_at) : Number.NaN;
    if (Number.isFinite(at) && at < cutoff) drop.push(id);
  });
  return drop;
}

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
      .order("sort_order")
      .order("id");
    return ids?.length ? q.in("id", ids) : q;
  };
  const holdQ = () => {
    const q = supabase
      .from(PORTFELL_TABLES.holdings)
      .select("*")
      .order("sort_order")
      .order("id");
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

/**
 * Save a copy, and say whose it is.
 *
 * `ownerId` is required for the two per-person kinds and meaningless for the
 * nightly one, which is the whole project. It is what stops one reader's
 * twenty-first save deleting another reader's first: see the retention note
 * on `pruneOldSnapshots`.
 */
export async function saveBookSnapshot(
  supabase: SupabaseClient,
  kind: BookSnapshotKind,
  label: string,
  payload?: BookSnapshotPayload,
  ownerId?: string | null
): Promise<BookSnapshotRow> {
  const body = payload ?? (await captureBookPayload(supabase));
  const { data, error } = await supabase
    .from(PORTFELL_TABLES.snapshots)
    .insert({
      kind,
      label,
      payload: body,
      owner_id: kind === "nightly" ? null : (ownerId ?? null),
    })
    .select("id, kind, label, payload, created_at")
    .single();
  if (error) throw new Error(error.message);
  return data as BookSnapshotRow;
}

type PruneRow = {
  id?: string | null;
  created_at?: string | null;
  owner_id?: string | null;
};

/** Group per-person rows by whose they are, so one window is one person's. */
function byOwner(rows: PruneRow[]): PruneRow[][] {
  const groups = new Map<string, PruneRow[]>();
  for (const row of rows) {
    // A row nobody could be attributed to shares one bucket with the others
    // like it, which is the behaviour those rows already had.
    const key = row.owner_id ?? "";
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.values()];
}

/**
 * Keep the last of each kind, counting a per-person kind inside its owner.
 *
 * The nightly window is project-wide because a nightly row is the project.
 * The other two are one reader's own history, and counting those globally is
 * what let anybody's saves push out everybody's: twenty manual rows in total
 * meant the twenty-first, whoever made it, deleted the oldest, whoever owned
 * it. The cron did it unaided every night the totals were over, so this was
 * live data loss rather than an attack anybody had to mount.
 *
 * `ownerId` narrows the read for the request path, which only ever needs to
 * tidy the caller's own history. The cron passes nothing and prunes every
 * owner's window in turn.
 */
export async function pruneOldSnapshots(
  supabase: SupabaseClient,
  ownerId?: string | null
) {
  const nightlyQuery = supabase
    .from(PORTFELL_TABLES.snapshots)
    .select("id, created_at, owner_id")
    .eq("kind", "nightly")
    .order("created_at", { ascending: false });

  // Every filter before the ordering, so the read is one chain rather than
  // an ordered query narrowed afterwards.
  const perPerson = (kind: BookSnapshotKind) => {
    const base = supabase
      .from(PORTFELL_TABLES.snapshots)
      .select("id, created_at, owner_id")
      .eq("kind", kind);
    return (ownerId ? base.eq("owner_id", ownerId) : base).order("created_at", {
      ascending: false,
    });
  };

  const [{ data: nightly }, { data: preDelete }, { data: manuals }] =
    await Promise.all([
      nightlyQuery,
      perPerson("pre_delete"),
      perPerson("manual"),
    ]);

  const dropIds = [
    // The one genuinely project-wide window, and the only one that stays so.
    ...snapshotsToPrune((nightly ?? []) as PruneRow[], { keep: KEEP_NIGHTLY }),
    ...byOwner((preDelete ?? []) as PruneRow[]).flatMap((rows) =>
      snapshotsToPrune(rows, {
        keep: KEEP_PRE_DELETE,
        maxAgeDays: PRE_DELETE_SNAPSHOT_MAX_AGE_DAYS,
      })
    ),
    ...byOwner((manuals ?? []) as PruneRow[]).flatMap((rows) =>
      snapshotsToPrune(rows, { keep: KEEP_MANUAL })
    ),
  ];
  if (dropIds.length === 0) return;
  await supabase.from(PORTFELL_TABLES.snapshots).delete().in("id", dropIds);
}

/**
 * One saved book, or null when there is no row by that id.
 *
 * A driver error is thrown as it came. The route turns it into `dbError`,
 * so the sentence Postgres wrote never reaches a response body.
 */
export async function loadBookSnapshot(
  supabase: SupabaseClient,
  snapshotId: string
): Promise<{ id: string; payload: BookSnapshotPayload } | null> {
  const { data, error } = await supabase
    .from(PORTFELL_TABLES.snapshots)
    .select("id, payload")
    .eq("id", snapshotId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return data as { id: string; payload: BookSnapshotPayload };
}

/*
  A restore either happens or is refused, and a refusal is a sentence the
  reader is meant to see with the status that belongs to it. It comes back
  as a value rather than a throw so the route can tell it from the driver
  failing, which is the only thing these functions still throw and which
  is never written for a reader.
*/
export type RestoreRefusal = { ok: false; status: 403 | 404; error: string };

export type BookRestoreOutcome =
  | { ok: true; counts: { portfolios: number; holdings: number } }
  | RestoreRefusal;

export type SheetRestoreOutcome =
  | { ok: true; counts: { holdings: number; cash: number } }
  | RestoreRefusal;

export const SNAPSHOT_GONE = "That save is not there any more.";
export const SNAPSHOT_NONE_OF_YOURS = "This save has none of your portfolios.";
export const SNAPSHOT_NOT_THIS_PORTFOLIO =
  "This save has no copy of this portfolio.";

/**
 * Put the caller's own sheets back from a save. Never deletes a sheet,
 * never touches a book they do not own.
 */
export async function restoreBookFromSnapshot(
  supabase: SupabaseClient,
  snapshotId: string,
  ownedPortfolioIds: string[]
): Promise<BookRestoreOutcome> {
  const snap = await loadBookSnapshot(supabase, snapshotId);
  if (!snap) return { ok: false, status: 404, error: SNAPSHOT_GONE };

  const payload = snap.payload;
  const ids = snapshotSheetsForOwner(payload, ownedPortfolioIds);
  if (ids.length === 0) {
    return { ok: false, status: 403, error: SNAPSHOT_NONE_OF_YOURS };
  }

  let holdings = 0;
  for (const id of ids) {
    const applied = await applySheetFromPayload(
      supabase,
      id,
      payload,
      ownedPortfolioIds
    );
    if (!applied.ok) return applied;
    holdings += applied.counts.holdings;
  }
  return { ok: true, counts: { portfolios: ids.length, holdings } };
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

/**
 * The saved copy of one live portfolio, chosen from the caller's own sheets
 * in the save and nobody else's.
 *
 * A nightly save carries every portfolio in the project. This used to match
 * by id, then slug, then name across all of them, so a reader who renamed
 * their portfolio to a name somebody else was already using had that
 * person's holdings and cash copied in over their own. The slug and name
 * fallbacks stay, because a save taken before a rename is still the right
 * save, but they only ever look at sheets the caller owns: a sheet that is
 * not theirs is not a candidate whatever it is called. A live portfolio the
 * caller does not own matches nothing.
 */
export function matchSnapshotSheet(
  payload: BookSnapshotPayload,
  live: { id: string; slug?: string | null; name?: string | null },
  ownedPortfolioIds: string[]
): SnapshotPortfolio | null {
  const owned = new Set(ownedPortfolioIds.filter(Boolean));
  if (!owned.has(live.id)) return null;

  const mine = (Array.isArray(payload.portfolios)
    ? payload.portfolios
    : []
  ).filter((raw) => {
    const id = (raw as SnapshotPortfolio).id;
    return Boolean(id && owned.has(id));
  }) as SnapshotPortfolio[];

  const lower = (v: unknown) => String(v).toLowerCase();
  return (
    mine.find((p) => p.id === live.id) ||
    mine.find(
      (p) => p.slug && live.slug && lower(p.slug) === lower(live.slug)
    ) ||
    mine.find(
      (p) => p.name && live.name && lower(p.name) === lower(live.name)
    ) ||
    null
  );
}

async function applySheetFromPayload(
  supabase: SupabaseClient,
  livePortfolioId: string,
  payload: BookSnapshotPayload,
  ownedPortfolioIds: string[]
): Promise<SheetRestoreOutcome> {
  const { data: live, error: liveErr } = await supabase
    .from(PORTFELL_TABLES.portfolios)
    .select("id, slug, name")
    .eq("id", livePortfolioId)
    .maybeSingle();
  if (liveErr) throw new Error(liveErr.message);
  if (!live) {
    return { ok: false, status: 404, error: "Couldn't find that portfolio." };
  }

  const match = matchSnapshotSheet(
    payload,
    live as { id: string; slug?: string | null; name?: string | null },
    ownedPortfolioIds
  );
  if (!match) {
    return { ok: false, status: 403, error: SNAPSHOT_NOT_THIS_PORTFOLIO };
  }

  const holdings = (Array.isArray(payload.holdings)
    ? payload.holdings
    : []) as SnapshotHolding[];
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

  return { ok: true, counts: { holdings: sheetHoldings.length, cash } };
}

/**
 * Replace one live sheet's cash + holdings from a save the caller has
 * already loaded. Only the caller's own sheets in that save are candidates;
 * see `matchSnapshotSheet`.
 */
export async function restoreSheetFromSnapshot(
  supabase: SupabaseClient,
  payload: BookSnapshotPayload,
  livePortfolioId: string,
  ownedPortfolioIds: string[]
): Promise<SheetRestoreOutcome> {
  return applySheetFromPayload(
    supabase,
    livePortfolioId,
    payload,
    ownedPortfolioIds
  );
}
