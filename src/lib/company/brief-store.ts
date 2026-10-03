/**
 * The shared company brief, read and written by the server only.
 *
 * The rules are `forecast-ticker-cache-store.ts`'s rules, because this is
 * the same shape of table: one row per company, read by every reader in
 * the product rather than by the person who caused the run. Getting any of
 * them wrong means one bad run is served to everybody looking that company
 * up, under the provenance mark, as a considered answer.
 *
 * WHAT CHANGED, AND WHY IT IS THE WHOLE POINT OF THIS FILE NOW.
 *
 * A row used to be either usable or not, and "not" meant the reader waited
 * for a fresh model run: up to a minute, on a page somebody had opened to
 * read. It went "not" after five days, after any one-fifth price move, and
 * on every new quarter, so on an ordinary week a popular company cost
 * everybody who opened it after the fifth day twenty seconds of skeleton
 * for an argument that had not changed.
 *
 * So the verdict has three answers now, not two (`judgeBrief`):
 *
 *   fresh    nothing has happened that the argument could turn on, so it
 *            is served as it is and nobody waits
 *   stale    something has: the company reported, an event landed in the
 *            news, the price moved a fifth, or three weeks passed. The
 *            row is STILL SERVED, at once, with a note saying what
 *            happened, and a rewrite is started behind it where somebody
 *            with an account is reading (`/api/company/[ticker]/brief`)
 *            or on the warmer's clock where nobody is
 *   missing  there is no row, or one too old or too wrong to show at all
 *
 * The price itself is never part of the argument. It is fetched live in
 * the browser on every page and placed in the fair value zones there, so a
 * company that drifts two per cent on a quiet day costs nothing at all.
 *
 * Best effort throughout: a read or a write failing costs the next reader
 * a cache hit, never this reader their page.
 */
import type { Json } from "@/lib/supabase/database.types";
import { getSupabaseServer } from "@/lib/supabase/server";
import type { CompanyBrief } from "@/lib/ai/company-brief";
import type { CompanyArticle } from "@/lib/company/sources";
import { factsKeyVersion } from "@/lib/company/facts";
import { thesisNewsSince, type ThesisNews } from "@/lib/company/thesis-news";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How long a written page may stand with nothing having happened to it.
 *
 * The backstop, not the mechanism. The mechanism is the figures, the news
 * and the price below; this is for the story the headline rule did not
 * recognise and the market did not react to, which three weeks is long
 * enough to make rare and short enough that a page never describes a
 * company a season out of date. It used to be five days, which rewrote
 * every company in the published list every few days whether or not
 * anything had happened to it.
 */
export const BRIEF_MAX_AGE_MS = 21 * DAY_MS;

/**
 * How old a page may be and still be SHOWN, with its note, while a new
 * one is written.
 *
 * Past this a page is not worth the reader's time even labelled: two
 * months is long enough for most companies to have reported twice, and a
 * case for and against from that far back is history rather than an
 * argument. The reader gets the figures, which are current, and the
 * written half arrives when it is rewritten.
 */
export const BRIEF_SHOW_MAX_AGE_MS = 60 * DAY_MS;

/**
 * How far the share price may travel from the price the page was written
 * against before the page is rewritten.
 *
 * A fifth, the same figure the forecast cache uses. Not because the price
 * is part of the argument (it is not, and it is live on every page) but
 * because a move that size is news even when no headline the feed handed
 * back says so, and the five-year path drawn from the old price would no
 * longer start anywhere near today.
 */
export const BRIEF_MAX_DRIFT = 0.2;

export type StoredBrief = {
  brief: CompanyBrief;
  /** When the model wrote it, never when it was last handed out. */
  generatedAt: string;
  factsKey: string;
  anchorPrice: number | null;
};

export type BriefStaleReason = "figures" | "news" | "price" | "age";

export type BriefState =
  | { kind: "fresh" }
  | { kind: "stale"; reason: "figures" }
  | { kind: "stale"; reason: "news"; headline: ThesisNews }
  | { kind: "stale"; reason: "price"; anchorPrice: number; moved: number }
  | { kind: "stale"; reason: "age" }
  /** No row, or one too old or too wrong to put in front of anybody. */
  | { kind: "missing" }
  /** The feed covers this company too thinly for a page to be written. */
  | { kind: "thin" };

export type JudgeInput = {
  spot?: number | null;
  factsKey?: string;
  /** Today's headlines, for the news rule. Absent means not checked. */
  articles?: readonly CompanyArticle[] | null;
  now?: Date;
};

/**
 * What to do with a stored page: serve it, serve it and rewrite it, or
 * leave it out. Pure, so every rule is testable with no database.
 *
 * The rules run in the order a reader would care about them, so the note
 * names the most serious reason when more than one applies: new figures
 * first, because every number the argument leans on has moved; then an
 * event in the news; then the price; then the clock.
 */
export function judgeBrief(
  row: StoredBrief | null | undefined,
  input: JudgeInput = {}
): BriefState {
  if (!row || !row.brief) return { kind: "missing" };

  const at = Date.parse(row.generatedAt ?? "");
  // A row with no readable date cannot be shown to be inside any bound,
  // and "cannot show" is the same answer as "too old" for a shared row.
  if (!Number.isFinite(at)) return { kind: "missing" };
  const now = (input.now ?? new Date()).getTime();
  const age = now - at;
  if (age > BRIEF_SHOW_MAX_AGE_MS) return { kind: "missing" };

  /*
    A row written before this app recorded a facts key carries an empty
    one and is judged on the other rules alone. A row whose key is from an
    older VERSION was invalidated on purpose, because the pages written
    under it were wrong rather than old (`FACTS_KEY_VERSION`), and it is
    not shown at all. A row whose key matches the version but not the
    figures describes a company that has reported since: it is still the
    best argument on file and it is shown with that said.
  */
  if (row.factsKey && input.factsKey && row.factsKey !== input.factsKey) {
    if (factsKeyVersion(row.factsKey) !== factsKeyVersion(input.factsKey)) {
      return { kind: "missing" };
    }
    return { kind: "stale", reason: "figures" };
  }

  const headline = thesisNewsSince(input.articles, row.generatedAt);
  if (headline) return { kind: "stale", reason: "news", headline };

  const anchor = row.anchorPrice;
  const spot = input.spot;
  if (
    typeof anchor === "number" &&
    anchor > 0 &&
    typeof spot === "number" &&
    Number.isFinite(spot) &&
    spot > 0
  ) {
    const moved = (spot - anchor) / anchor;
    if (Math.abs(moved) > BRIEF_MAX_DRIFT) {
      return { kind: "stale", reason: "price", anchorPrice: anchor, moved };
    }
  }

  if (age > BRIEF_MAX_AGE_MS) return { kind: "stale", reason: "age" };
  return { kind: "fresh" };
}

/** True when a stored page can be served as it is, with nothing to rewrite. */
export function isReusableBrief(
  row: StoredBrief | null | undefined,
  input: JudgeInput = {}
): boolean {
  return judgeBrief(row, input).kind === "fresh";
}

/** True when a page in this state is worth putting in front of a reader. */
export function briefIsShowable(state: BriefState): boolean {
  return state.kind === "fresh" || state.kind === "stale";
}

/** True when a page in this state should be written again, given the chance. */
export function briefWantsWriting(state: BriefState): boolean {
  return state.kind === "stale" || state.kind === "missing";
}

/**
 * The stored row as it is, judged by nobody. `judgeBrief` decides what to
 * do with it, because only the caller has today's figures and headlines.
 */
export async function readCompanyBrief(
  ticker: string
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
  return {
    brief: data.brief as unknown as CompanyBrief,
    generatedAt: data.generated_at,
    factsKey: data.facts_key ?? "",
    anchorPrice: data.anchor_price ?? null,
  };
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

/* ---------------------------------------------------------------------- *
 * One writer per company
 * ---------------------------------------------------------------------- */

/**
 * How long a claim to write a company's page holds before another caller
 * may take it. Longer than a run can live (`LLM_BUDGET_MS` plus the build,
 * inside a route capped at two minutes), so a claim only ever lapses for a
 * worker that died.
 */
export const BRIEF_CLAIM_STALE_SECONDS = 180;

/**
 * Has the claim function not landed on this database yet?
 *
 * `42883` is Postgres for an undefined function; PostgREST answers a call
 * it cannot resolve from its own schema cache instead, so both spellings
 * are checked. The same test `portfell_claim_fund_run` gets, for the same
 * reason: code reaches production before its migration does.
 */
export function missingBriefClaim(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  if (err.code === "42883" || err.code === "PGRST202") return true;
  const message = String(err.message ?? "");
  return (
    /portfell_claim_company_brief/.test(message) &&
    /(does not exist|could not find|schema cache)/i.test(message)
  );
}

/**
 * Take the right to write this company's page, or learn somebody else has
 * it. True means go ahead.
 *
 * Settled on the primary key rather than on anything read first, because
 * the window between two readers opening the same stale company is the
 * length of a model run, not an instant: a link passed round a group of
 * friends opens the same company several times in that minute, and every
 * one of them would otherwise pay for the same rewrite.
 *
 * A missing function is not a lost race. If the migration has not landed,
 * this answers true and the old behaviour stands, which is a duplicate run
 * at worst; reading the gap as "somebody else has it" would stop every
 * page from ever being rewritten, quietly.
 */
export async function claimBriefWrite(ticker: string): Promise<boolean> {
  const key = ticker.trim().toUpperCase();
  const db = getSupabaseServer();
  if (!db || !key) return true;
  const { data, error } = await db.rpc("portfell_claim_company_brief", {
    p_ticker: key,
    p_stale_after: `${BRIEF_CLAIM_STALE_SECONDS} seconds`,
  });
  if (error) {
    if (!missingBriefClaim(error)) {
      console.error("company brief claim failed", error.message);
    }
    return true;
  }
  return data === true;
}

/** Hand the claim back once the run is over, whichever way it ended. */
export async function releaseBriefWrite(ticker: string): Promise<void> {
  const key = ticker.trim().toUpperCase();
  const db = getSupabaseServer();
  if (!db || !key) return;
  const { error } = await db
    .from("portfell_company_brief_claims")
    .delete()
    .eq("ticker", key);
  if (error && !/does not exist|schema cache/i.test(error.message ?? "")) {
    console.error("company brief release failed", error.message);
  }
}

/**
 * Has `checked_at` not landed on this database yet? PostgREST refuses a
 * whole statement for one unknown column, so the warmer asks once and then
 * stops naming it rather than failing every run until the migration lands.
 */
export function missingCheckedColumn(
  err: { code?: string; message?: string } | null
): boolean {
  if (!err) return false;
  const code = err.code ?? "";
  if (code !== "PGRST204" && code !== "42703") return false;
  return /checked_at/i.test(err.message ?? "");
}

/**
 * Record that the warmer looked at this company and found nothing to do,
 * so the next run starts with the companies it has looked at least
 * recently. Never throws, and does nothing for a company with no row,
 * since there is nothing to stamp and nothing to have checked.
 */
export async function stampBriefChecked(
  ticker: string,
  at: Date = new Date()
): Promise<boolean> {
  const key = ticker.trim().toUpperCase();
  const db = getSupabaseServer();
  if (!db || !key) return false;
  const { error } = await db
    .from("portfell_company_briefs")
    .update({ checked_at: at.toISOString() })
    .eq("ticker", key);
  if (error) {
    if (!missingCheckedColumn(error)) {
      console.error("company brief stamp failed", error.message);
    }
    return false;
  }
  return true;
}
