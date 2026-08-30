import { SUPERADMIN_NOTE_EMAIL } from "@/lib/auth/superadmin";
import { noteEmailConfigured, sendNoteEmail } from "@/lib/send-note";
import { getSupabaseServer, supabaseUsesServiceRole } from "@/lib/supabase/server";
import { readAll } from "@/lib/supabase/read-all";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import { logEvent } from "@/lib/telemetry";

/*
  The error log had readers but no messenger.

  `logError` writes every crash into `portfell_error_log` and /admin shows
  the latest 150, which means a regression is discovered exactly as often
  as somebody opens that page. The audit checklist ranks this second among
  the silent failures: a new class of error appearing after a deploy shows
  up today as rows in a table nobody is looking at, and the first person
  to report it is usually a reader.

  This is the messenger. Once a day it reads the last day of the log,
  collapses each row's message into a stable class (ids, numbers, quoted
  values and addresses vary per occurrence; the sentence around them is
  the error), compares against the day before, and mails the superadmin
  when either a class appears that yesterday did not have, or the volume
  jumps well past yesterday's. A quiet day sends nothing, because a daily
  "all fine" mail trains its reader to stop opening it.

  Deliberately not a Sentry: no new provider, no SDK in the request path,
  and the log table it reads is the one the app already writes and /admin
  already triages. Clearing the log from /admin resets the comparison
  window, so the day after a triage everything current reads as new,
  which is the right side to err on.
*/

const WINDOW_MS = 24 * 60 * 60 * 1000;
const SPIKE_MIN_TOTAL = 20;
const SPIKE_MULTIPLE = 3;

export type ErrorRow = {
  source: string | null;
  message: string | null;
  path: string | null;
  created_at: string | null;
};

export type ErrorClass = {
  key: string;
  count: number;
  /** One real message, so the collapsed key never has to be read back. */
  sample: string;
  /** Up to three distinct paths this class was seen on. */
  paths: string[];
};

/**
 * Collapse one occurrence into the class it belongs to. Uuids, long hex,
 * addresses, quoted values and numbers are the parts that vary between
 * occurrences of the same fault, so they fold; what is left is the
 * sentence, which is the fault.
 */
export function errorClassOf(source: string, message: string): string {
  const folded = message
    .replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      "<id>"
    )
    .replace(/[0-9a-f]{16,}/gi, "<hex>")
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "<email>")
    .replace(/"[^"]*"/g, "<q>")
    .replace(/'[^']*'/g, "<q>")
    .replace(/\d+(?:\.\d+)?/g, "<n>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
  return `${source}: ${folded}`;
}

/** Group a window of rows into classes, biggest first. */
export function groupErrorClasses(rows: ErrorRow[]): ErrorClass[] {
  const byKey = new Map<string, ErrorClass>();
  for (const row of rows) {
    const message = row.message ?? "";
    if (!message.trim()) continue;
    const key = errorClassOf(row.source ?? "unknown", message);
    const existing = byKey.get(key);
    if (existing) {
      existing.count += 1;
      const path = row.path?.trim();
      if (path && !existing.paths.includes(path) && existing.paths.length < 3) {
        existing.paths.push(path);
      }
    } else {
      byKey.set(key, {
        key,
        count: 1,
        sample: message.slice(0, 200),
        paths: row.path?.trim() ? [row.path.trim()] : [],
      });
    }
  }
  return [...byKey.values()].sort((a, b) => b.count - a.count);
}

export type DigestDecision = {
  newClasses: ErrorClass[];
  knownClasses: ErrorClass[];
  total: number;
  priorTotal: number;
  spike: boolean;
  shouldSend: boolean;
};

/** What the last day looks like next to the day before it. */
export function decideDigest(
  current: ErrorClass[],
  prior: ErrorClass[]
): DigestDecision {
  const priorKeys = new Set(prior.map((c) => c.key));
  const newClasses = current.filter((c) => !priorKeys.has(c.key));
  const knownClasses = current.filter((c) => priorKeys.has(c.key));
  const total = current.reduce((sum, c) => sum + c.count, 0);
  const priorTotal = prior.reduce((sum, c) => sum + c.count, 0);
  const spike =
    total >= SPIKE_MIN_TOTAL && total >= SPIKE_MULTIPLE * Math.max(1, priorTotal);
  return {
    newClasses,
    knownClasses,
    total,
    priorTotal,
    spike,
    shouldSend: newClasses.length > 0 || spike,
  };
}

function describeClass(c: ErrorClass): string {
  const where = c.paths.length > 0 ? ` at ${c.paths.join(", ")}` : "";
  const times = c.count === 1 ? "once" : `${c.count} times`;
  return `- ${times}${where}:\n  ${c.sample}`;
}

/** Subject and body for the digest mail. Plain text; the shared fallback
 * HTML wrapper dresses it. */
export function digestEmail(decision: DigestDecision, day: string): {
  subject: string;
  text: string;
} {
  const kinds = decision.newClasses.length;
  const subject =
    kinds > 0
      ? `Upside Lab errors: ${kinds} new kind${kinds === 1 ? "" : "s"}, ${decision.total} in the last day`
      : `Upside Lab errors: volume jumped to ${decision.total} in the last day`;

  const lines: string[] = [];
  if (kinds > 0) {
    lines.push("New kinds of error, not seen the day before:");
    lines.push(...decision.newClasses.map(describeClass));
    lines.push("");
  }
  if (decision.spike) {
    lines.push(
      `Volume: ${decision.total} errors in the last day against ${decision.priorTotal} the day before.`
    );
    lines.push("");
  }
  if (decision.knownClasses.length > 0) {
    lines.push("Still occurring from before:");
    lines.push(...decision.knownClasses.slice(0, 5).map(describeClass));
    lines.push("");
  }
  lines.push(`Triage and clear: https://upsidelab.app/admin (${day})`);
  return { subject, text: lines.join("\n") };
}

export async function runErrorDigest(now = new Date()): Promise<{
  ok: boolean;
  total: number;
  newClasses: number;
  emailed: boolean;
  error?: string;
  status?: number;
}> {
  if (!supabaseUsesServiceRole()) {
    return {
      ok: false,
      total: 0,
      newClasses: 0,
      emailed: false,
      error:
        "Error digest skipped. SUPABASE_SERVICE_ROLE_KEY is not configured, so a cron request cannot read the error log.",
      status: 503,
    };
  }
  const supabase = getSupabaseServer();
  if (!supabase) {
    return {
      ok: false,
      total: 0,
      newClasses: 0,
      emailed: false,
      error: "Supabase not configured",
      status: 400,
    };
  }

  const windowStart = new Date(now.getTime() - WINDOW_MS).toISOString();
  const priorStart = new Date(now.getTime() - 2 * WINDOW_MS).toISOString();

  // "throw" on purpose: a digest computed from part of the log would report
  // calm over a day it did not actually read, and the cron 500ing (which
  // pings the heartbeat's /fail) is the honest answer.
  const currentRows = await readAll<ErrorRow>(
    () =>
      supabase
        .from(PORTFELL_TABLES.errorLog)
        .select("source, message, path, created_at")
        .gte("created_at", windowStart),
    "throw"
  );
  const priorRows = await readAll<ErrorRow>(
    () =>
      supabase
        .from(PORTFELL_TABLES.errorLog)
        .select("source, message, path, created_at")
        .gte("created_at", priorStart)
        .lt("created_at", windowStart),
    "throw"
  );

  const decision = decideDigest(
    groupErrorClasses(currentRows),
    groupErrorClasses(priorRows)
  );

  logEvent(
    "error_digest",
    {
      total: decision.total,
      priorTotal: decision.priorTotal,
      newClasses: decision.newClasses.length,
      spike: decision.spike,
    },
    decision.shouldSend ? "warn" : "info"
  );

  let emailed = false;
  if (decision.shouldSend && noteEmailConfigured()) {
    const day = now.toISOString().slice(0, 10);
    const mail = digestEmail(decision, day);
    // Keyed per day: the schedule firing twice, which the platform
    // documents as possible, still sends one mail.
    emailed = await sendNoteEmail({
      to: SUPERADMIN_NOTE_EMAIL,
      subject: mail.subject,
      text: mail.text,
      idempotencyKey: `error-digest:${day}`,
    });
  }

  return {
    ok: true,
    total: decision.total,
    newClasses: decision.newClasses.length,
    emailed,
  };
}
