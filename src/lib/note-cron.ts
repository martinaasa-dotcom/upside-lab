import { unsubscribeUrlFor } from "@/lib/unsubscribe-link";
import { readAll } from "@/lib/supabase/read-all";
import { requestIsScheduledCron } from "@/lib/cron-auth";
import { logError } from "@/lib/error-log";
import { logEvent } from "@/lib/telemetry";
import {
  ACCOUNT_ALIAS_FALLBACK,
  collapseMailRecipients,
  emailMatchesAllowlist,
  loadAliasMap,
  primaryEmailFromMap,
} from "@/lib/auth/identity";
import { SUPERADMIN_NOTE_EMAIL } from "@/lib/auth/superadmin";
import { sheetCashBalance } from "@/lib/cash-balance";
import { ownedBookPortfolios } from "@/lib/classroom";
import { hasLiveHoldings } from "@/lib/empty-book-nudge";
import { fetchQuotesWithFallback } from "@/lib/market/quotes";
import { fetchMarketEvents, fetchWeekReturns } from "@/lib/market/yahoo";
import {
  buildWeeklyLetter,
  parseConviction,
  weeklyLetterHtml,
  weeklyLetterText,
  weeklyNumbersAreSound,
  weeklySubject,
  type WeeklyLetterInput,
} from "@/lib/weekly-letter";
import { sanitizeWatchlist } from "@/lib/lab-bundle";
import { writeWeeklyTake } from "@/lib/weekly-margus";
import { noteEmailConfigured, sendNoteEmail } from "@/lib/send-note";
import { getSupabaseServer, supabaseUsesServiceRole } from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How long the whole run may take before it stops starting new recipients.
 *
 * The route's `maxDuration` is 60s. Leaving 10s of headroom means the
 * dispatcher returns its own JSON -- with a truthful `remaining` count --
 * instead of being killed mid-send and serving the platform's plain-text
 * timeout page.
 */
const RUN_BUDGET_MS = 50_000;

/** Per-recipient model budget, capped again by whatever the run has left. */
const LETTER_BUDGET_MS = 20_000;

/**
 * Below this there is no point starting another letter -- the model call
 * alone would not land, and a half-written run is worse than a resumed one.
 */
const MIN_LETTER_MS = 8_000;

type BookRow = {
  id: string;
  cash_balance: number;
  classroom_community_id?: string | null;
};
type HoldingRow = {
  ticker?: string | null;
  shares?: number | null;
  buy_price?: number | null;
  portfolio_id?: string | null;
  updated_at?: string | null;
};
type LabRow = {
  conviction?: unknown;
  watchlist?: unknown;
  owner_id?: string | null;
};

/**
 * A recipient marked inside this window is skipped.
 *
 * The letter goes out weekly, so three days is comfortably long enough that
 * a resumed run never writes to the same person twice and comfortably short
 * enough that next Sunday is never blocked.
 */
const RESEND_WINDOW_MS = 3 * DAY_MS;

/**
 * One key for the whole Sunday-to-Saturday week, so every slot and every
 * retry of one letter carries the same idempotency key.
 */
export function letterWeekKey(now: Date = new Date()): string {
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.toISOString().slice(0, 10);
}

/**
 * Every profile row that shares one mailbox, keyed by that mailbox.
 *
 * The marker is what stops the 04:20 and 04:40 slots mailing somebody the
 * 04:00 run already reached, so the key it is written with has to be
 * certain. `.in("email", connectedEmailsFor(...))` is not: it is a
 * case-sensitive match on a column holding whatever the identity provider
 * stored, and a profile saved as `Martin.Aasa@upthink.ee` never matches the
 * lower-cased address this file computes. Written that way the update
 * touched zero rows and returned no error, which is how one letter became
 * three; used as a *claim*, the same miss is worse in the other direction,
 * because zero rows updated reads as "somebody else has this one" and the
 * reader is passed over every Sunday instead.
 *
 * Ids are the key these rows were selected by, so they cannot miss on
 * spelling, casing or padding. One mailbox can still cover several profiles
 * (two Google logins, one reader), and every one of them has to be stamped
 * or the untouched row is the one that mails again, hence a list per
 * mailbox rather than a single id.
 */
export function profileIdsByMailbox<
  T extends { id: string; email?: string | null },
>(
  profiles: readonly T[],
  aliasToPrimary: Record<string, string> = ACCOUNT_ALIAS_FALLBACK
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const profile of profiles) {
    const to = primaryEmailFromMap(profile.email, aliasToPrimary);
    if (!to || !profile.id) continue;
    const ids = out.get(to);
    if (ids) ids.push(profile.id);
    else out.set(to, [profile.id]);
  }
  return out;
}

export function weeklyLetterAlreadySent(
  sentAt: string | Date | null | undefined,
  now: Date = new Date()
): boolean {
  if (!sentAt) return false;
  const at = new Date(sentAt).getTime();
  if (!Number.isFinite(at)) return false;
  return now.getTime() - at < RESEND_WINDOW_MS;
}

/** Group rows by a key, so one batched query replaces a query per recipient. */
function groupBy<T>(rows: readonly T[], key: (row: T) => string | null): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    if (!k) continue;
    const bucket = out.get(k);
    if (bucket) bucket.push(row);
    else out.set(k, [row]);
  }
  return out;
}

export type NoteDispatchOpts = {
  /** When set, only these addresses get a note. Scheduled cron leaves this off. */
  onlyEmails?: readonly string[];
  /**
   * Deliberately re-send to someone the marker says already has this
   * week's letter. Only an explicit `?only=` test or `?force=1` sets it --
   * never anything inferred about the caller. See `noteTestAudience`.
   */
  forceResend?: boolean;
  /**
   * One of the later Sunday slots, whose job is to pick up recipients an
   * earlier run did not reach. Only meaningful when the sent-marker column
   * exists: without it a resume run cannot tell who already has the letter,
   * so it stands down rather than sending a duplicate.
   */
  isResumeRun?: boolean;
};

/**
 * Vercel Cron still mails everyone opted in. A manual hit stays on Martin.
 *
 * **Who** a run mails is a guess about the caller, so nothing about not
 * mailing someone twice is allowed to hang off it. It used to: the only
 * test for "this is the scheduler" was an `x-vercel-cron: 1` header Vercel
 * does not document and does not send, so all three Sunday slots fell
 * through to the manual branch -- which skipped the already-sent marker
 * *and* skipped writing one, on the reasoning that a targeted send is a
 * test. Three identical letters, every Sunday, and no one but Martin ever
 * received the letter at all.
 *
 * Now the marker is skipped only when the caller says so out loud
 * (`?only=`, which is a person testing, or `?force=1`). If the platform
 * changes its headers again the worst case is that the letter goes to
 * Martin alone -- once.
 */
export function noteTestAudience(req: Request): NoteDispatchOpts {
  const url = new URL(req.url);
  const only = url.searchParams.get("only")?.trim().toLowerCase();
  // vercel.json marks the 04:20 and 04:40 slots with ?resume=1.
  const isResumeRun = url.searchParams.get("resume") === "1";
  const forceResend = url.searchParams.get("force") === "1";
  if (only === "me") {
    return {
      onlyEmails: [SUPERADMIN_NOTE_EMAIL],
      isResumeRun,
      // A named test send is a test: it neither skips nor burns the marker,
      // so testing on Saturday never eats Sunday's real letter.
      forceResend: true,
    };
  }
  if (requestIsScheduledCron(req)) return { isResumeRun, forceResend };
  return { onlyEmails: [SUPERADMIN_NOTE_EMAIL], isResumeRun, forceResend };
}

/**
 * PostgREST's shape for "you asked for a column that is not there"
 * (Postgres 42703). Matched on the code where it is given, and on the
 * message otherwise, because the column name is what makes this specific
 * rather than any schema complaint.
 */
function missingMarkerColumn(err: { code?: string; message?: string }): boolean {
  if (err?.code === "42703") return true;
  const message = String(err?.message ?? "");
  return /note_sunday_sent_at/.test(message) &&
    /(does not exist|could not find|schema cache)/i.test(message);
}

/** The Sunday letter is the only scheduled email, so there is no kind. */
export async function dispatchWeeklyLetters(
  opts: NoteDispatchOpts = {}
): Promise<{
  ok: boolean;
  sent: number;
  skipped: number;
  /**
   * How many of `skipped` were passed over because their numbers were too
   * thin to state as fact (`weeklyNumbersAreSound`). Counted apart so a
   * data-quality regression reads as a rate in one place instead of as
   * scattered per-person warnings; `sunday_letter_untrusted_rate` logs the
   * same figure. They keep their empty marker, so a later slot retries.
   */
  untrusted?: number;
  optedIn: number;
  /** Recipients the run did not reach before its deadline. A later run takes them. */
  remaining: number;
  emailed: boolean;
  error?: string;
  status?: number;
}> {
  if (!supabaseUsesServiceRole()) {
    return {
      ok: false,
      sent: 0,
      skipped: 0,
      optedIn: 0,
      remaining: 0,
      emailed: false,
      error: "Note skipped. Service role is not configured.",
      status: 503,
    };
  }
  const supabase = getSupabaseServer();
  if (!supabase) {
    return {
      ok: false,
      sent: 0,
      skipped: 0,
      optedIn: 0,
      remaining: 0,
      emailed: false,
      error: "Supabase not configured",
      status: 400,
    };
  }

  /*
   * The marker column may not exist yet, and that must not stop the letter.
   *
   * `docs/ZERO_DOWNTIME_MIGRATIONS.md` ships the app (step 4) *before*
   * applying the SQL on production (step 5), so there is always a window
   * where this code is live and `note_sunday_sent_at` is not there. This
   * function used to select the column unconditionally and return
   * `ok: false` on any error, which meant that during that window nobody
   * got a letter at all -- no partial send, no warning, just a quiet
   * Sunday. The window is however long it takes someone to run a
   * migration, which in practice was hours.
   *
   * So: ask for the marker, and if the database says there is no such
   * column, ask again without it. Everything else about the run is
   * unchanged; only the resume bookkeeping is unavailable.
   */
  /*
   * The mailing list itself is paged.
   *
   * Everything downstream of this read was made to page when the letter
   * was batched, and this line was not, which left the one read that
   * decides *who gets a letter at all* stopping at db-max-rows. Past a
   * thousand subscribers the readers beyond the cap would simply not be
   * in the list: no error, no warning, no letter, and nothing anywhere
   * that could notice, because a person who is never fetched is never
   * skipped either.
   *
   * `"throw"` rather than `"stop"`, because the missing-column fallback
   * below needs the error to recognise it, and because a partial mailing
   * list is the failure this is fixing.
   */
  type SundayProfile = {
    id: string;
    email: string | null;
    display_name: string | null;
    note_sunday_sent_at: string | null;
  };

  // Two literal selects rather than one with a ternary: the typed client
  // parses the column list at compile time and cannot read a conditional.
  const readWithMarker = () =>
    readAll<SundayProfile>(
      () =>
        supabase
          .from(PORTFELL_TABLES.profiles)
          .select("id, email, display_name, note_sunday_sent_at")
          .eq("note_sunday", true)
          .order("id"),
      "throw"
    );

  const readWithoutMarker = () =>
    readAll<Omit<SundayProfile, "note_sunday_sent_at">>(
      () =>
        supabase
          .from(PORTFELL_TABLES.profiles)
          .select("id, email, display_name")
          .eq("note_sunday", true)
          .order("id"),
      "throw"
    );

  let markerAvailable = true;
  let profiles: SundayProfile[] = [];
  let error: { code?: string; message?: string } | null = null;

  try {
    profiles = await readWithMarker();
  } catch (err) {
    error = err as { code?: string; message?: string };
  }

  if (error && missingMarkerColumn(error)) {
    markerAvailable = false;
    logEvent(
      "sunday_letter_marker_column_missing",
      { message: error.message },
      "warn"
    );
    try {
      const retry = await readWithoutMarker();
      error = null;
      profiles = retry.map((row) => ({
        ...row,
        // No column, so nobody has a recorded send. Everyone is pending.
        note_sunday_sent_at: null,
      }));
    } catch (err) {
      error = err as { code?: string; message?: string };
    }
  }

  /*
   * Without the marker there is no way to tell who already received this
   * week's letter, and the schedule fires three times on a Sunday (04:00
   * plus two resume slots). Sending from every one of them would put the
   * same letter in the same inbox three times, which is worse than the
   * problem the resume slots exist to solve. So the first run of the day
   * does the work and the later two stand down until the column lands.
   */
  if (!markerAvailable && opts.isResumeRun) {
    return {
      ok: true,
      sent: 0,
      skipped: 0,
      optedIn: 0,
      remaining: 0,
      emailed: false,
    };
  }

  if (error) {
    return {
      ok: false,
      sent: 0,
      skipped: 0,
      optedIn: 0,
      remaining: 0,
      emailed: false,
      error: error.message ?? "read failed",
      status: 500,
    };
  }

  const aliasMap = await loadAliasMap(supabase);
  const allow = (opts.onlyEmails ?? []).map((e) => e.trim().toLowerCase());
  const allowSet = new Set(allow.filter(Boolean));
  const eligible = (profiles ?? []).filter((profile) =>
    emailMatchesAllowlist(profile.email, allowSet, aliasMap)
  );
  /*
   * Captured before the collapse, deliberately. `collapseMailRecipients`
   * keeps one profile per mailbox and drops the rest, and an unstamped row
   * is exactly the row that mails again twenty minutes later.
   */
  const idsByMailbox = profileIdsByMailbox(
    eligible as { id: string; email?: string | null }[],
    aliasMap
  );
  const recipients = collapseMailRecipients(eligible, aliasMap);

  const emailed = noteEmailConfigured();
  if (!emailed) {
    return {
      ok: true,
      sent: 0,
      skipped: recipients.length,
      optedIn: recipients.length,
      remaining: 0,
      emailed: false,
    };
  }
  const startedAt = Date.now();
  const optedIn = recipients.length;

  // Anyone already written to this week is done -- this is what lets a run
  // that stopped at its deadline be resumed by the next one without
  // double-mailing.
  //
  // Only an explicit `?only=` test or `?force=1` re-sends. This used to be
  // "any targeted send", i.e. anything the cron sniffer failed to
  // recognise, which is how the same letter went out three times.
  const bypassMarker = opts.forceResend === true;
  const now = new Date();
  // A marker older than the window is last week's and may be claimed again.
  const staleBefore = new Date(now.getTime() - RESEND_WINDOW_MS).toISOString();
  const pending = recipients.filter(
    ({ to, profile }) =>
      to &&
      (bypassMarker ||
        !weeklyLetterAlreadySent(
          (profile as { note_sunday_sent_at?: string | null })
            .note_sunday_sent_at,
          now
        ))
  );
  let skipped = optedIn - pending.length;
  let sent = 0;
  let untrusted = 0;
  /*
   * Which of the two writers produced each letter. The fallback is meant
   * to be the rare case, and until this counted them nothing distinguished
   * a Sunday the model wrote from one where every reader got the plainest
   * prose the product has.
   */
  let modelTakes = 0;
  let fallbackTakes = 0;
  const fallbackReasons = new Map<string, number>();

  // ---- One batched read per table, not one per recipient. ----------------
  //
  // This loop used to issue four sequential queries for every recipient, so
  // the database round trips grew linearly with the mailing list while the
  // function's time budget stayed at 60s. The same data comes back in four
  // queries total.
  const userIds = pending.map(({ profile }) => profile.id as string);
  //
  // A page at a time, all four of them. Batching turned four queries per
  // recipient into four queries total, which is right, and it also made every
  // one of them a read whose length grows with the mailing list. PostgREST
  // answers with at most db-max-rows, which a Supabase project is set to
  // 1,000, and it applies that silently.
  //
  // The holdings read is the one that matters. A hundred readers with four
  // portfolios of twenty-five names is 10,000 rows, so most of them would
  // come back with part of their holdings and no sign of it -- and
  // weeklyNumbersAreSound cannot catch that, because it refuses on a holding
  // with no quote and a truncated holding is not present to have one. The
  // letter would state a portfolio value computed from a fraction of the
  // portfolio, as a fact, in an inbox.
  const ownRows = userIds.length
    ? await readAll<{ portfolio_id: string; user_id: string }>(() =>
        supabase
          .from(PORTFELL_TABLES.portfolioOwners)
          .select("portfolio_id, user_id")
          .in("user_id", userIds)
          .order("portfolio_id")
          .order("user_id")
      )
    : [];
  const ownsByUser = groupBy(ownRows, (r) => r.user_id);

  const allPortfolioIds = [
    ...new Set(ownRows.map((r) => r.portfolio_id as string)),
  ];
  const bookRows = allPortfolioIds.length
    ? await readAll<BookRow>(() =>
        supabase
          .from(PORTFELL_TABLES.portfolios)
          .select("id, cash_balance, classroom_community_id")
          .in("id", allPortfolioIds)
          .order("id")
      )
    : [];
  const bookById = new Map(bookRows.map((b) => [b.id, b]));

  const holdingRows = allPortfolioIds.length
    ? await readAll<HoldingRow>(() =>
        supabase
          .from(PORTFELL_TABLES.holdings)
          // `updated_at` so `weeklyNumbersAreSound` can tell a share count
          // that predates a split from one the reader has already fixed.
          .select("ticker, shares, buy_price, portfolio_id, updated_at")
          .in("portfolio_id", allPortfolioIds)
          .order("id")
      )
    : [];
  const holdingsByPortfolio = groupBy(
    holdingRows,
    (h) => (h.portfolio_id as string) ?? null
  );

  const labRows = userIds.length
    ? await readAll<LabRow>(() =>
        supabase
          .from(PORTFELL_TABLES.labState)
          .select("conviction, watchlist, owner_id")
          .in("owner_id", userIds)
          .order("id")
      )
    : [];
  const labByOwner = new Map(labRows.map((l) => [l.owner_id as string, l]));

  // ---- Assemble every letter's inputs in memory, then quote once. --------
  type Prepared = {
    to: string;
    profile: (typeof pending)[number]["profile"];
    cash: number;
    holdings: {
      ticker: string;
      shares: number;
      buy_price: number;
      updated_at?: string | null;
    }[];
    tickers: string[];
    watchlist: string[];
    lab: LabRow | undefined;
  };
  const prepared: Prepared[] = [];
  for (const { to, profile } of pending) {
    const ids = (ownsByUser.get(profile.id as string) ?? []).map(
      (o) => o.portfolio_id
    );
    const books = ids
      .map((id) => bookById.get(id))
      .filter((b): b is BookRow => Boolean(b));
    const noteBooks = ownedBookPortfolios(books) as BookRow[];
    if (noteBooks.length === 0) {
      skipped += 1;
      continue;
    }
    const holdings = noteBooks
      .flatMap((b) => holdingsByPortfolio.get(b.id) ?? [])
      .map((h) => ({
        ticker: String(h.ticker ?? "").toUpperCase(),
        shares: Number(h.shares ?? 0),
        buy_price: Number(h.buy_price ?? 0),
        updated_at: h.updated_at ?? null,
      }));
    if (!hasLiveHoldings(holdings)) {
      skipped += 1;
      continue;
    }
    const tickers = [...new Set(holdings.map((h) => h.ticker))].filter(Boolean);
    const held = new Set(tickers);
    const lab = labByOwner.get(profile.id as string);
    const watchlist = sanitizeWatchlist(lab?.watchlist).filter(
      (t) => !held.has(t)
    );
    const cash = noteBooks.reduce(
      (s, p) =>
        s +
        sheetCashBalance({
          cash_balance: Number(p.cash_balance ?? 0),
          classroom_community_id: p.classroom_community_id,
        }),
      0
    );
    prepared.push({ to: to as string, profile, cash, holdings, tickers, watchlist, lab });
  }

  // Everyone's names in one set. Two readers holding NVDA used to mean two
  // separate quote requests for NVDA; now the whole mailing list costs the
  // upstream providers one round of calls, not one per reader.
  const allTickers = [
    ...new Set(prepared.flatMap((p) => [...p.tickers, ...p.watchlist])),
  ].filter(Boolean);
  const allQuotes =
    allTickers.length > 0
      ? (await fetchQuotesWithFallback(allTickers)).quotes
      : {};
  const allWeekReturns =
    allTickers.length > 0 ? await fetchWeekReturns(allTickers) : undefined;
  const allEarnings =
    allTickers.length > 0
      ? (await fetchMarketEvents(allTickers)).earnings
      : undefined;

  const pick = <T,>(
    source: Record<string, T> | undefined,
    names: readonly string[]
  ): Record<string, T> | undefined => {
    if (!source) return undefined;
    const out: Record<string, T> = {};
    for (const n of names) if (n in source) out[n] = source[n];
    return out;
  };

  /*
   * Take this week's letter for one person, atomically.
   *
   * `update ... where the marker is null or stale` is a single statement,
   * so Postgres hands the row to exactly one caller. Two runs racing --
   * the 04:20 slot starting while 04:00 is still working, or the platform
   * invoking one schedule twice, which Vercel documents as possible --
   * cannot both win it. Reading the marker up front and stamping after the
   * send left that whole window open.
   *
   * "unavailable" falls back to the old order (send, then stamp) rather
   * than dropping everybody's letter over one unexpected answer.
   */
  const claimRecipient = async (
    ids: string[]
  ): Promise<"claimed" | "taken" | "unavailable"> => {
    if (!markerAvailable || ids.length === 0) return "unavailable";
    const { data, error } = await supabase
      .from(PORTFELL_TABLES.profiles)
      .update({ note_sunday_sent_at: new Date().toISOString() })
      .in("id", ids)
      .or(`note_sunday_sent_at.is.null,note_sunday_sent_at.lt.${staleBefore}`)
      .select("id");
    if (error) {
      logEvent("sunday_letter_claim_failed", { message: error.message }, "warn");
      return "unavailable";
    }
    return (data ?? []).length > 0 ? "claimed" : "taken";
  };

  /** The letter never left. Put the claim back so a later slot retries. */
  const releaseRecipient = async (ids: string[]): Promise<void> => {
    if (!markerAvailable || ids.length === 0) return;
    await supabase
      .from(PORTFELL_TABLES.profiles)
      .update({ note_sunday_sent_at: null })
      .in("id", ids);
  };

  const weekKey = letterWeekKey(now);

  // ---- Write and send, stopping cleanly before the platform kills us. ----
  let remaining = 0;
  for (let i = 0; i < prepared.length; i++) {
    const left = RUN_BUDGET_MS - (Date.now() - startedAt);
    if (left < MIN_LETTER_MS) {
      // Out of time. The rest keep their null marker, so the next run --
      // scheduled later the same morning -- picks them up.
      remaining = prepared.length - i;
      break;
    }
    const item = prepared[i];
    const letterNames = new Set([...item.tickers, ...item.watchlist]);
    const input: WeeklyLetterInput = {
      name: item.profile.display_name as string | null,
      cash: item.cash,
      holdings: item.holdings,
      quotes: pick(allQuotes, item.tickers) ?? {},
      conviction: parseConviction(item.lab?.conviction),
      weekReturns: pick(allWeekReturns, item.tickers),
      earnings: allEarnings?.filter((e) =>
        letterNames.has(String(e.ticker ?? "").toUpperCase())
      ),
      watchlist: item.watchlist,
      watchQuotes: pick(allQuotes, item.watchlist) ?? {},
      watchWeekReturns: pick(allWeekReturns, item.watchlist),
    };

    /*
     * A letter states a portfolio value and a week's move as fact, in the
     * subject line and in 38px type. If the market data behind either one
     * came back thin, this recipient is passed over rather than mailed a
     * confident wrong number.
     *
     * Before the claim, deliberately: a recipient this refuses must keep an
     * empty marker so a later Sunday slot retries them with fresh data.
     * Claiming first and checking after would stamp them and walk away,
     * which costs them the week.
     */
    const trust = weeklyNumbersAreSound(input);
    if (!trust.ok) {
      logEvent(
        "sunday_letter_skipped_untrusted",
        { reason: trust.reason },
        "warn"
      );
      skipped += 1;
      untrusted += 1;
      continue;
    }

    const markerIds = idsByMailbox.get(item.to) ?? [];
    const claim = bypassMarker
      ? ("unavailable" as const)
      : await claimRecipient(markerIds);
    if (claim === "taken") {
      // Someone else -- an earlier slot, or a run still in flight -- has
      // this person's letter this week.
      skipped += 1;
      continue;
    }

    const letter = buildWeeklyLetter(input);
    letter.margus = await writeWeeklyTake(letter, {
      budgetMs: Math.min(LETTER_BUDGET_MS, left),
      onOutcome: ({ source, reason }) => {
        if (source === "model") {
          modelTakes += 1;
          return;
        }
        fallbackTakes += 1;
        fallbackReasons.set(reason, (fallbackReasons.get(reason) ?? 0) + 1);
      },
    });
    /*
      A link that stops the letter by itself, signed for the profile whose
      letter this is. The mailbox can belong to more than one profile; the
      endpoint turns it off for every profile with that address, so which of
      them signed the link does not matter.
    */
    const unsubscribeUrl = unsubscribeUrlFor(markerIds[0] ?? "") ?? undefined;

    const ok = await sendNoteEmail({
      to: item.to,
      subject: weeklySubject(letter),
      text: weeklyLetterText(letter),
      html: weeklyLetterHtml(letter, unsubscribeUrl),
      unsubscribeUrl,
      // Last line of defence, and the only one outside this codebase: the
      // provider refuses a second send under the same key for 24h, so even
      // a bug on our side cannot put two Sunday letters in one inbox.
      idempotencyKey: bypassMarker ? undefined : `sunday-letter:${weekKey}:${item.to}`,
    });
    if (!ok) {
      if (claim === "claimed") await releaseRecipient(markerIds);
      skipped += 1;
      continue;
    }
    if (!bypassMarker && markerAvailable && claim !== "claimed") {
      // Claiming was unavailable, so stamp the old way: after the send, and
      // before counting it, since an unmarked send is one a resumed run
      // would make again.
      await supabase
        .from(PORTFELL_TABLES.profiles)
        .update({ note_sunday_sent_at: new Date().toISOString() })
        .in("id", markerIds);
    }
    sent += 1;
  }

  /*
   * The per-recipient skip above is a scattered warning; this is the same
   * fact as a rate, once per run. A systematic data-quality regression (a
   * stale-quote bug, a provider outage across the Sunday window) shows up
   * as an unusually high untrusted share, and buried in per-person log
   * lines it stays invisible until a reader asks where their letter went.
   * A quarter of the run refused, on more than one person, is an incident
   * and goes through logError, so it lands in portfell_error_log, /admin
   * and the daily error digest rather than only in a log stream nobody
   * reads; anything smaller stays a warning event.
   */
  /*
   * A Sunday nobody's letter was written by the model.
   *
   * `fallbackWeeklyTake` exists so the letter always ships, and it does its
   * job quietly, which is exactly the problem: a missing API key, a slot
   * held by another background job or an answer the checks refuse all end
   * with a letter in the inbox and nothing anywhere saying the writer
   * never ran. One alarm, on the run rather than per recipient, carrying
   * the reasons but nothing about who was reading.
   */
  if (fallbackTakes > 0) {
    const reasons = Object.fromEntries(fallbackReasons);
    if (modelTakes === 0 && fallbackTakes >= 1) {
      await logError({
        source: "server",
        message: `Sunday letter: the model wrote none of ${fallbackTakes} letters in this run, so every reader got the fallback prose.`,
        path: "/api/cron/sunday-note",
        event: "sunday_letter_all_fallback",
        context: { fallbackTakes, modelTakes, reasons },
      });
    } else {
      logEvent(
        "sunday_letter_fallback_rate",
        { fallbackTakes, modelTakes, reasons },
        "warn"
      );
    }
  }

  if (untrusted > 0) {
    const attempted = pending.length;
    if (untrusted >= 2 && untrusted / Math.max(1, attempted) >= 0.25) {
      await logError({
        source: "server",
        message: `Sunday letter refused ${untrusted} of ${attempted} recipients for thin market data in one run.`,
        path: "/api/cron/sunday-note",
        event: "sunday_letter_untrusted_rate",
        context: { untrusted, attempted, sent, remaining },
      });
    } else {
      logEvent(
        "sunday_letter_untrusted_rate",
        { untrusted, attempted, sent, remaining },
        "warn"
      );
    }
  }

  return {
    ok: true,
    sent,
    skipped,
    untrusted,
    optedIn,
    remaining,
    emailed,
  };
}
