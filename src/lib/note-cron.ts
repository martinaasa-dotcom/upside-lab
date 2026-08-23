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
  weeklySubject,
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

export function weeklyLetterAlreadySent(
  sentAt: string | Date | null | undefined,
  now: Date = new Date()
): boolean {
  if (!sentAt) return false;
  const at = new Date(sentAt).getTime();
  if (!Number.isFinite(at)) return false;
  return now.getTime() - at < RESEND_WINDOW_MS;
}

/**
 * Every profile row that shares one mailbox, keyed by that mailbox.
 *
 * The sent-marker is what stops the 04:20 and 04:40 resume slots mailing
 * somebody the 04:00 run already reached, so writing it has to be certain.
 * It used to be written with `.in("email", connectedEmailsFor(...))`, which
 * is a case-sensitive match on a column holding whatever the identity
 * provider stored: a profile saved as `Martin.Aasa@upthink.ee` never
 * matched the lower-cased address this code computes, so the update touched
 * zero rows, wrote no marker, and reported no error. The letter went out,
 * the run counted it as sent, and both resume slots sent it again -- three
 * copies of the same letter in one morning.
 *
 * Ids are the key these rows were selected by, so they cannot miss. One
 * mailbox can still cover several profiles (Martin's two Google logins),
 * and every one of them has to be stamped or the untouched row is the one
 * that mails again -- hence a list per mailbox rather than a single id.
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
   * One of the later Sunday slots, whose job is to pick up recipients an
   * earlier run did not reach. Only meaningful when the sent-marker column
   * exists: without it a resume run cannot tell who already has the letter,
   * so it stands down rather than sending a duplicate.
   */
  isResumeRun?: boolean;
};

/** Vercel Cron still mails everyone opted in. A manual hit stays on Martin. */
export function noteTestAudience(req: Request): NoteDispatchOpts {
  const url = new URL(req.url);
  const only = url.searchParams.get("only")?.trim().toLowerCase();
  // vercel.json marks the 04:20 and 04:40 slots with ?resume=1.
  const isResumeRun = url.searchParams.get("resume") === "1";
  if (only === "me") return { onlyEmails: [SUPERADMIN_NOTE_EMAIL], isResumeRun };
  if (req.headers.get("x-vercel-cron") === "1") return { isResumeRun };
  return { onlyEmails: [SUPERADMIN_NOTE_EMAIL], isResumeRun };
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
  let markerAvailable = true;
  let { data: profiles, error } = await supabase
    .from(PORTFELL_TABLES.profiles)
    .select("id, email, display_name, note_sunday_sent_at")
    .eq("note_sunday", true);

  if (error && missingMarkerColumn(error)) {
    markerAvailable = false;
    logEvent(
      "sunday_letter_marker_column_missing",
      { message: error.message },
      "warn"
    );
    const retry = await supabase
      .from(PORTFELL_TABLES.profiles)
      .select("id, email, display_name")
      .eq("note_sunday", true);
    error = retry.error;
    profiles = (retry.data ?? []).map((row) => ({
      ...row,
      // No column, so nobody has a recorded send. Everyone is pending.
      note_sunday_sent_at: null,
    }));
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
      error: error.message,
      status: 500,
    };
  }

  const aliasMap = await loadAliasMap(supabase);
  const allow = (opts.onlyEmails ?? []).map((e) => e.trim().toLowerCase());
  const allowSet = new Set(allow.filter(Boolean));
  const eligible = (profiles ?? []).filter((profile) =>
    emailMatchesAllowlist(profile.email, allowSet, aliasMap)
  );
  const recipients = collapseMailRecipients(eligible, aliasMap);
  // Collapsing keeps one profile per mailbox; the marker has to reach the
  // rows it dropped too, so keep their ids before they go.
  const idsByMailbox = profileIdsByMailbox(
    eligible as { id: string; email?: string | null }[],
    aliasMap
  );

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
  // A targeted send (`?only=me`, or any non-cron hit) is a test by
  // definition, so it ignores the marker and does not stamp one -- otherwise
  // testing the letter on Saturday would make Sunday's real run skip you.
  const isTestSend = allowSet.size > 0;
  const now = new Date();
  const pending = recipients.filter(
    ({ to, profile }) =>
      to &&
      (isTestSend ||
        !weeklyLetterAlreadySent(
          (profile as { note_sunday_sent_at?: string | null })
            .note_sunday_sent_at,
          now
        ))
  );
  let skipped = optedIn - pending.length;
  let sent = 0;

  // ---- One batched read per table, not one per recipient. ----------------
  //
  // This loop used to issue four sequential queries for every recipient, so
  // the database round trips grew linearly with the mailing list while the
  // function's time budget stayed at 60s. The same data comes back in four
  // queries total.
  const userIds = pending.map(({ profile }) => profile.id as string);
  const { data: ownRows } = userIds.length
    ? await supabase
        .from(PORTFELL_TABLES.portfolioOwners)
        .select("portfolio_id, user_id")
        .in("user_id", userIds)
    : { data: [] as { portfolio_id: string; user_id: string }[] };
  const ownsByUser = groupBy(
    (ownRows ?? []) as { portfolio_id: string; user_id: string }[],
    (r) => r.user_id
  );

  const allPortfolioIds = [
    ...new Set((ownRows ?? []).map((r) => r.portfolio_id as string)),
  ];
  const { data: bookRows } = allPortfolioIds.length
    ? await supabase
        .from(PORTFELL_TABLES.portfolios)
        .select("id, cash_balance, classroom_community_id")
        .in("id", allPortfolioIds)
    : { data: [] as BookRow[] };
  const bookById = new Map(
    ((bookRows ?? []) as BookRow[]).map((b) => [b.id, b])
  );

  const { data: holdingRows } = allPortfolioIds.length
    ? await supabase
        .from(PORTFELL_TABLES.holdings)
        .select("ticker, shares, buy_price, portfolio_id")
        .in("portfolio_id", allPortfolioIds)
    : { data: [] as HoldingRow[] };
  const holdingsByPortfolio = groupBy(
    (holdingRows ?? []) as HoldingRow[],
    (h) => (h.portfolio_id as string) ?? null
  );

  const { data: labRows } = userIds.length
    ? await supabase
        .from(PORTFELL_TABLES.labState)
        .select("conviction, watchlist, owner_id")
        .in("owner_id", userIds)
    : { data: [] as LabRow[] };
  const labByOwner = new Map(
    ((labRows ?? []) as LabRow[]).map((l) => [l.owner_id as string, l])
  );

  // ---- Assemble every letter's inputs in memory, then quote once. --------
  type Prepared = {
    to: string;
    profile: (typeof pending)[number]["profile"];
    cash: number;
    holdings: { ticker: string; shares: number; buy_price: number }[];
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
    const letter = buildWeeklyLetter({
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
    });
    letter.margus = await writeWeeklyTake(letter, {
      budgetMs: Math.min(LETTER_BUDGET_MS, left),
    });
    const ok = await sendNoteEmail({
      to: item.to,
      subject: weeklySubject(letter),
      text: weeklyLetterText(letter),
      html: weeklyLetterHtml(letter),
    });
    if (!ok) {
      skipped += 1;
      continue;
    }
    // Mark before counting: an unmarked send is one this run cannot prove,
    // and a resumed run would write to that person again.
    if (!isTestSend && markerAvailable) {
      const ids = idsByMailbox.get(item.to) ?? [];
      const { data: stamped, error: stampError } = ids.length
        ? await supabase
            .from(PORTFELL_TABLES.profiles)
            .update({ note_sunday_sent_at: new Date().toISOString() })
            .in("id", ids)
            .select("id")
        : { data: [] as { id: string }[], error: null };
      // A marker that did not land is exactly the state that mails this
      // person again twenty minutes from now, so say so loudly rather than
      // discarding the result. The letter is already delivered; all this
      // run can do is leave a trace of why the duplicate is coming.
      if (stampError || (stamped ?? []).length === 0) {
        logEvent(
          "sunday_letter_marker_write_failed",
          {
            to: item.to,
            ids: ids.length,
            message: stampError?.message ?? "no rows updated",
          },
          "error"
        );
      }
    }
    sent += 1;
  }

  return {
    ok: true,
    sent,
    skipped,
    optedIn,
    remaining,
    emailed,
  };
}
