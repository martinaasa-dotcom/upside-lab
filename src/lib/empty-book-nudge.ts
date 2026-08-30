/** One-time nudge when someone signs up and never imports a name. */

import { readAll } from "@/lib/supabase/read-all";
import { isClassroomSheet } from "@/lib/classroom";
import {
  collapseMailRecipients,
  connectedEmailsFor,
  loadAliasMap,
} from "@/lib/auth/identity";
import { emptyBookNudgeHtml } from "@/lib/email-letter";
import { PRODUCT_NAME, PRODUCT_ORIGIN } from "@/lib/product";
import { noteEmailConfigured, sendNoteEmail } from "@/lib/send-note";
import { getSupabaseServer, supabaseUsesServiceRole } from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";

export const EMPTY_BOOK_NUDGE_AFTER_DAYS = 7;
export const EMPTY_BOOK_NUDGE_BATCH = 40;

const DAY_MS = 24 * 60 * 60 * 1000;

type HoldingRow = {
  ticker?: string | null;
  shares?: number | null;
  portfolio_id?: string | null;
};

export function hasLiveHoldings(
  rows: { ticker?: string | null; shares?: number | null }[]
): boolean {
  return rows.some(
    (h) => String(h.ticker ?? "").trim() && Number(h.shares) > 0
  );
}

export function isEmptyBookNudgeDue(input: {
  createdAt: string | Date;
  sentAt: string | Date | null | undefined;
  now?: Date;
}): boolean {
  if (input.sentAt) return false;
  const created = new Date(input.createdAt).getTime();
  if (!Number.isFinite(created)) return false;
  const now = (input.now ?? new Date()).getTime();
  return now - created >= EMPTY_BOOK_NUDGE_AFTER_DAYS * DAY_MS;
}

export function shouldSkipEmptyBookNudge(input: {
  hasClassroomSheet: boolean;
  hasLiveHoldings: boolean;
}): boolean {
  return input.hasClassroomSheet || input.hasLiveHoldings;
}

function firstName(displayName: string | null | undefined): string | null {
  const first = String(displayName ?? "")
    .trim()
    .split(/\s+/)[0];
  if (!first || first.length < 2 || first.length > 24) return null;
  if (!/^[\p{L}'’-]+$/u.test(first)) return null;
  return first;
}

export function emptyBookNudgeSubject(): string {
  return "Your portfolio is still empty";
}

export function emptyBookNudgeText(
  displayName: string | null | undefined
): string {
  const hi = firstName(displayName);
  const greeting = hi ? `Hi ${hi}.` : "Hi.";
  return [
    "Your portfolio is still empty.",
    greeting,
    "You signed up about a week ago, and there is still nothing in your portfolio.",
    `${PRODUCT_NAME} watches the companies you already own. Paste what you hold. On the days a price falls it reads what happened at that company and tells you whether anything really changed, which most of the time it has not. Margus will talk the week through with you, and a circle lets you go through it with people you know.`,
    "Getting started is one step: add what you already own. Upload a CSV file, drop in a screenshot of your broker page, or type them in. That is the whole thing.",
    PRODUCT_ORIGIN,
    "This is a one-time note. The Sunday email starts once there is something in your portfolio. You can turn it off in Account: https://upsidelab.app/account",
  ].join("\n\n");
}

export async function dispatchEmptyBookNudges(): Promise<{
  ok: boolean;
  sent: number;
  skipped: number;
  candidates: number;
  emailed: boolean;
  error?: string;
  status?: number;
}> {
  if (!supabaseUsesServiceRole()) {
    return {
      ok: false,
      sent: 0,
      skipped: 0,
      candidates: 0,
      emailed: false,
      error: "Empty-book nudge skipped. Service role is not configured.",
      status: 503,
    };
  }
  const supabase = getSupabaseServer();
  if (!supabase) {
    return {
      ok: false,
      sent: 0,
      skipped: 0,
      candidates: 0,
      emailed: false,
      error: "Supabase not configured",
      status: 400,
    };
  }

  const cutoff = new Date(
    Date.now() - EMPTY_BOOK_NUDGE_AFTER_DAYS * DAY_MS
  ).toISOString();
  const { data: profiles, error } = await supabase
    .from(PORTFELL_TABLES.profiles)
    .select("id, email, display_name, created_at, empty_book_nudge_sent_at")
    .is("empty_book_nudge_sent_at", null)
    .lte("created_at", cutoff)
    .not("email", "is", null)
    .order("created_at", { ascending: true })
    .limit(EMPTY_BOOK_NUDGE_BATCH);
  if (error) {
    return {
      ok: false,
      sent: 0,
      skipped: 0,
      candidates: 0,
      emailed: false,
      error: error.message,
      status: 500,
    };
  }

  const emailed = noteEmailConfigured();
  if (!emailed) {
    return {
      ok: true,
      sent: 0,
      skipped: (profiles ?? []).length,
      candidates: (profiles ?? []).length,
      emailed: false,
    };
  }

  const aliasMap = await loadAliasMap(supabase);
  const recipients = collapseMailRecipients(profiles ?? [], aliasMap);

  // Everyone still due, decided in memory before any per-person query.
  const due = recipients.filter(
    ({ to, profile }) =>
      to &&
      isEmptyBookNudgeDue({
        createdAt: profile.created_at as string,
        sentAt: profile.empty_book_nudge_sent_at as string | null,
      })
  );
  let sent = 0;
  let skipped = recipients.length - due.length;

  // Three batched reads for the whole batch, not two per candidate. At the
  // 40-candidate cap that is 3 reads where it used to be up to 80. Each is
  // paged, so "batched" never quietly means "the first 1,000 rows".
  const dueUserIds = due.map(({ profile }) => profile.id as string);
  const owned = dueUserIds.length
    ? await readAll<{ portfolio_id: string; user_id: string }>(() =>
        supabase
          .from(PORTFELL_TABLES.portfolioOwners)
          .select("portfolio_id, user_id")
          .order("portfolio_id")
          .order("user_id")
          .in("user_id", dueUserIds)
      )
    : [];
  const idsByUser = new Map<string, string[]>();
  for (const row of owned) {
    const bucket = idsByUser.get(row.user_id);
    if (bucket) bucket.push(row.portfolio_id);
    else idsByUser.set(row.user_id, [row.portfolio_id]);
  }
  const allIds = [...new Set(owned.map((r) => r.portfolio_id))];

  const bookRows = allIds.length
    ? await readAll<{ id: string; classroom_community_id: string | null }>(() =>
        supabase
          .from(PORTFELL_TABLES.portfolios)
          .select("id, classroom_community_id")
          .order("id")
          .in("id", allIds)
      )
    : [];
  const classroomIds = new Set(
    bookRows
      .filter((p) =>
        isClassroomSheet({ classroom_community_id: p.classroom_community_id })
      )
      .map((p) => p.id)
  );

  /*
    Paged, because this read is what decides the email. It covers every
    portfolio of up to `EMPTY_BOOK_NUDGE_BATCH` people at once, which at
    forty candidates holding a couple of portfolios each is already past
    PostgREST's silent 1,000-row cap. A truncated read does not fail: the
    holdings it dropped simply are not there, so `hasLiveHoldings` answers
    false and somebody who has been buying all week is told their
    portfolio is still empty. The marker is written straight after, so
    that letter is the only one they ever get and the mistake is never
    corrected.
  */
  const holdingRows = allIds.length
    ? await readAll<HoldingRow>(() =>
        supabase
          .from(PORTFELL_TABLES.holdings)
          .select("ticker, shares, portfolio_id")
          .order("id")
          .in("portfolio_id", allIds)
      )
    : [];
  const holdingsByPortfolio = new Map<string, HoldingRow[]>();
  for (const row of holdingRows) {
    const key = String(row.portfolio_id ?? "");
    if (!key) continue;
    const bucket = holdingsByPortfolio.get(key);
    if (bucket) bucket.push(row);
    else holdingsByPortfolio.set(key, [row]);
  }

  for (const { to: email, profile } of due) {
    const ids = idsByUser.get(profile.id as string) ?? [];
    const hasClassroom = ids.some((id) => classroomIds.has(id));
    const live = hasLiveHoldings(
      ids.flatMap((id) => holdingsByPortfolio.get(id) ?? [])
    );

    if (shouldSkipEmptyBookNudge({ hasClassroomSheet: hasClassroom, hasLiveHoldings: live })) {
      skipped += 1;
      continue;
    }

    const text = emptyBookNudgeText(profile.display_name as string | null);
    const ok = await sendNoteEmail({
      to: email,
      subject: emptyBookNudgeSubject(),
      text,
      html: emptyBookNudgeHtml(text),
    });
    if (!ok) {
      skipped += 1;
      continue;
    }
    const { error: markErr } = await supabase
      .from(PORTFELL_TABLES.profiles)
      .update({ empty_book_nudge_sent_at: new Date().toISOString() })
      .in("email", connectedEmailsFor(email, aliasMap));
    if (markErr) {
      skipped += 1;
      continue;
    }
    sent += 1;
  }

  return {
    ok: true,
    sent,
    skipped,
    candidates: (profiles ?? []).length,
    emailed,
  };
}
