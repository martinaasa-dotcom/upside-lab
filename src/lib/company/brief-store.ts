/**
 * The shared company brief, read and written by the server only.
 *
 * The rules are `forecast-ticker-cache-store.ts`'s rules, because this is
 * the same shape of table: one row per company, read by every reader in
 * the product rather than by the person who caused the run. Getting any of
 * the three wrong means one bad run is served to everybody looking that
 * company up, under the provenance eye, as a considered answer.
 *
 * One rule is new, and it is the one that matters most here. A forecast
 * path ages against the clock and the share price; a written page about a
 * company also ages against **the company's own figures**, because the
 * whole page is an argument built on last quarter's revenue and profit.
 * `facts_key` is a digest of exactly those, so the morning a company
 * reports, every reader gets a page written from the new numbers rather
 * than a confident argument about figures that have been superseded.
 *
 * Best effort throughout: a read or a write failing costs the next reader
 * a cache hit, never this reader their page.
 */
import type { Json } from "@/lib/supabase/database.types";
import { getSupabaseServer } from "@/lib/supabase/server";
import type { CompanyBrief } from "@/lib/ai/company-brief";

/**
 * How long a written page may be reused.
 *
 * Shorter than the forecast cache's fortnight, because this page carries
 * headlines and a case against, and both go stale in a way a five-year
 * path does not: a company can be in the middle of a story that a
 * ten-day-old page has never heard of. Long enough that a company
 * somebody looks up twice in a week costs one model run.
 */
export const BRIEF_MAX_AGE_MS = 5 * 24 * 60 * 60 * 1000;

/**
 * How far the share price may travel from the price the page was written
 * against before the argument stops describing the same investment. A
 * fifth, the same figure the forecast cache uses, and for the same reason:
 * "how expensive the shares are" is most of what a page like this says.
 */
export const BRIEF_MAX_DRIFT = 0.2;

export type StoredBrief = {
  brief: CompanyBrief;
  /** When the model wrote it, never when it was last handed out. */
  generatedAt: string;
  factsKey: string;
  anchorPrice: number | null;
};

/** Exported so the rules are testable with no database in the room. */
export function isReusableBrief(
  row: StoredBrief,
  input: { spot?: number | null; factsKey?: string; now?: Date } = {}
): boolean {
  if (!row.brief) return false;

  const at = Date.parse(row.generatedAt ?? "");
  // A row with no readable date cannot be shown to be inside the bound,
  // and "cannot show" is the same answer as "too old" for a shared row.
  if (!Number.isFinite(at)) return false;
  const now = (input.now ?? new Date()).getTime();
  if (now - at > BRIEF_MAX_AGE_MS) return false;

  /*
    A row written before this app recorded a facts key carries an empty
    one and is judged on age and price alone, which is what the older rows
    were always judged on. A row that has a key and disagrees with today's
    is refused: the company has reported since.
  */
  if (row.factsKey && input.factsKey && row.factsKey !== input.factsKey) {
    return false;
  }

  const anchor = row.anchorPrice;
  const spot = input.spot;
  if (
    typeof anchor === "number" &&
    anchor > 0 &&
    typeof spot === "number" &&
    Number.isFinite(spot) &&
    spot > 0
  ) {
    if (Math.abs(spot - anchor) / anchor > BRIEF_MAX_DRIFT) return false;
  }
  return true;
}

export async function loadCompanyBrief(
  ticker: string,
  input: { spot?: number | null; factsKey?: string; now?: Date } = {}
): Promise<StoredBrief | null> {
  const key = ticker.trim().toUpperCase();
  if (!key) return null;
  const db = getSupabaseServer();
  if (!db) return null;
  const { data, error } = await db
    .from("portfell_company_briefs")
    .select("brief, facts_key, anchor_price, generated_at")
    .eq("ticker", key)
    .maybeSingle();
  if (error || !data) {
    if (error) console.error("company brief read failed", error.message);
    return null;
  }
  const row: StoredBrief = {
    brief: data.brief as unknown as CompanyBrief,
    generatedAt: data.generated_at,
    factsKey: data.facts_key ?? "",
    anchorPrice: data.anchor_price ?? null,
  };
  return isReusableBrief(row, input) ? row : null;
}

/**
 * Write-through after a run. Never throws.
 *
 * `anchorPrice` has to be a price the server resolved, not a figure that
 * arrived on a request: it is half of what decides whether this row may
 * stand in for a fresh run, so a caller who could set it could keep a row
 * alive against any real price. This route reads the price from the quote
 * path itself, which is the same rule the forecast cache reached the hard
 * way.
 */
export async function saveCompanyBrief(input: {
  ticker: string;
  brief: CompanyBrief;
  factsKey: string;
  anchorPrice: number | null;
  generatedAt?: string;
}): Promise<void> {
  const db = getSupabaseServer();
  if (!db) return;
  const key = input.ticker.trim().toUpperCase();
  if (!key) return;
  const { error } = await db.from("portfell_company_briefs").upsert(
    {
      ticker: key,
      brief: input.brief as unknown as Json,
      facts_key: input.factsKey,
      anchor_price:
        typeof input.anchorPrice === "number" && input.anchorPrice > 0
          ? input.anchorPrice
          : null,
      generated_at: input.generatedAt ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "ticker" }
  );
  if (error) console.error("company brief write failed", error.message);
}
