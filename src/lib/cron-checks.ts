/**
 * The checks to create in the dead-man's-switch, derived rather than typed.
 *
 * `cron-heartbeat.ts` sends a ping per run; a ping nobody is expecting
 * raises nothing, so the service needs one check per cron, each carrying
 * that cron's own schedule. Writing those out by hand in a runbook is how
 * they go stale: a schedule moves in `vercel.json`, the table in the doc
 * does not, and the check quietly starts expecting a run at the wrong hour.
 * The first alert anybody gets is then a false one, which is worse than
 * none, because the next real alert is the one they have learned to ignore.
 *
 * So the schedule comes out of `vercel.json` and nothing restates it. The
 * one number that is a judgement rather than a fact is the grace: how long
 * after the expected minute a run may still arrive before the check goes
 * down. That has to clear the route's own `maxDuration` plus the slack of
 * a retry, and `cron-checks.test.ts` reads each route's `maxDuration` and
 * fails if a grace no longer covers it, so the judgement stays checkable.
 */

/** One entry of `vercel.json`'s crons block. */
export type VercelCron = { path: string; schedule: string };

/** A check to create in the monitoring service. */
export type CronCheck = {
  /** The route's own directory name, which is what the app pings. */
  slug: string;
  /** The schedule the check expects, in UTC. */
  schedule: string;
  /** Seconds a late run may still arrive before the check goes down. */
  grace: number;
  /** What a person reads when this check alerts. */
  desc: string;
  /** Every other slot that pings this same check, earlier than expected. */
  alsoPingedBy: string[];
};

/**
 * How long a late run may still be on its way.
 *
 * Judged per cron, not by a formula: what matters is how long the work can
 * legitimately take and how much lateness is still harmless. A monthly job
 * gets hours because nothing downstream of it is same-day; the splits job
 * gets one hour because a holding priced at a tenth of the truth is wrong
 * on every screen until it runs.
 */
export const CRON_GRACE_SECONDS: Record<string, number> = {
  snapshot: 30 * 60,
  "disaster-recovery": 30 * 60,
  "sunday-note": 2 * 60 * 60,
  "billing-reconcile": 30 * 60,
  "error-digest": 30 * 60,
  "popular-tickers": 6 * 60 * 60,
  "margus-fund": 2 * 60 * 60,
  "empty-book-nudge": 30 * 60,
  splits: 60 * 60,
};

/** What a person reads when the alert arrives, per cron. */
export const CRON_CHECK_DESC: Record<string, string> = {
  snapshot: "Nightly copy of every portfolio. Down means no new backup.",
  "disaster-recovery":
    "Encrypted cold copy and the check that the database's own backups are readable. Down means both went unverified.",
  "sunday-note":
    "The Sunday letter. Down means it was not written, so nobody got one.",
  "billing-reconcile":
    "Reads subscriptions back from Stripe. Down means a payment change may not have reached the account.",
  "error-digest":
    "The daily fold of the error log. Down means new kinds of error are going unreported.",
  "popular-tickers":
    "The month's list of names people can pick from at onboarding. Down means last month's list is still being offered.",
  "margus-fund": "The fund's trading day. Down means it did not trade.",
  "empty-book-nudge":
    "The one reminder to somebody who signed up and added nothing.",
  splits:
    "Applies share splits. Down means a split company is priced at a fraction of the truth on every screen.",
};

/** `/api/cron/snapshot?resume=1` is the check named `snapshot`. */
export function slugFromCronPath(path: string): string | null {
  const m = path.split("?")[0]!.match(/^\/api\/cron\/([a-z0-9-]+)$/);
  return m ? m[1]! : null;
}

/* ------------------------------------------------------------------ *
 * Reading a cron expression
 * ------------------------------------------------------------------ */

function expandField(field: string, min: number, max: number): Set<number> {
  const out = new Set<number>();
  for (const part of field.split(",")) {
    const [range, stepText] = part.split("/");
    const step = stepText ? Number(stepText) : 1;
    if (!Number.isInteger(step) || step < 1) {
      throw new Error(`bad step in cron field "${field}"`);
    }
    let lo = min;
    let hi = max;
    if (range !== "*") {
      const bounds = range!.split("-").map(Number);
      if (bounds.some((n) => !Number.isInteger(n))) {
        throw new Error(`bad cron field "${field}"`);
      }
      lo = bounds[0]!;
      hi = bounds.length > 1 ? bounds[1]! : bounds[0]!;
    }
    if (lo < min || hi > max || hi < lo) {
      throw new Error(`cron field "${field}" is outside ${min}-${max}`);
    }
    for (let n = lo; n <= hi; n += step) out.add(n);
  }
  return out;
}

type ParsedCron = {
  minutes: Set<number>;
  hours: Set<number>;
  daysOfMonth: Set<number>;
  months: Set<number>;
  daysOfWeek: Set<number>;
  domRestricted: boolean;
  dowRestricted: boolean;
};

export function parseCron(expr: string): ParsedCron {
  const f = expr.trim().split(/\s+/);
  if (f.length !== 5) throw new Error(`cron "${expr}" is not five fields`);
  return {
    minutes: expandField(f[0]!, 0, 59),
    hours: expandField(f[1]!, 0, 23),
    daysOfMonth: expandField(f[2]!, 1, 31),
    months: expandField(f[3]!, 1, 12),
    // 7 is Sunday in some dialects; fold it onto 0 so either spelling reads.
    daysOfWeek: new Set(
      [...expandField(f[4]!, 0, 7)].map((d) => (d === 7 ? 0 : d)),
    ),
    domRestricted: f[2] !== "*",
    dowRestricted: f[4] !== "*",
  };
}

/**
 * How often this expression fires in a year.
 *
 * Used only to rank two schedules for the same route against each other, so
 * an exact figure matters less than a consistent one: it walks a fixed
 * non-leap year in UTC rather than the calendar around today, or the answer
 * would depend on the day the script was run.
 */
export function cronFiringsPerYear(expr: string): number {
  const c = parseCron(expr);
  const perDay = c.minutes.size * c.hours.size;
  let days = 0;
  const cursor = new Date(Date.UTC(2027, 0, 1));
  for (let i = 0; i < 365; i += 1) {
    const month = cursor.getUTCMonth() + 1;
    if (c.months.has(month)) {
      const dom = c.daysOfMonth.has(cursor.getUTCDate());
      const dow = c.daysOfWeek.has(cursor.getUTCDay());
      // Standard cron: with both day fields restricted the two are an OR,
      // so "1st of the month or any Monday" fires on both.
      const matches =
        c.domRestricted && c.dowRestricted ? dom || dow : dom && dow;
      if (matches) days += 1;
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days * perDay;
}

/** The first minute of the day this expression can fire, for tie-breaking. */
function earliestMinuteOfDay(expr: string): number {
  const c = parseCron(expr);
  return Math.min(...c.hours) * 60 + Math.min(...c.minutes);
}

/* ------------------------------------------------------------------ *
 * The plan
 * ------------------------------------------------------------------ */

/**
 * One check per cron route, whatever its number of slots.
 *
 * Several routes are scheduled more than once: the Sunday letter has two
 * resume slots behind it and the fund has an evening backlog slot. Those
 * are retries of one day's work rather than separate jobs, so they share a
 * check, and the check is given the slot that runs on the most days. The
 * extra slots then ping it early, which the service treats as fine: an
 * early ping is a run that completed, and that is the only question the
 * check is asking.
 */
export function buildCronCheckPlan(crons: VercelCron[]): CronCheck[] {
  const bySlug = new Map<string, string[]>();
  for (const cron of crons) {
    const slug = slugFromCronPath(cron.path);
    if (!slug) continue;
    bySlug.set(slug, [...(bySlug.get(slug) ?? []), cron.schedule]);
  }

  return [...bySlug.entries()]
    .map(([slug, schedules]) => {
      const ranked = [...schedules].sort((a, b) => {
        const byBreadth = cronFiringsPerYear(b) - cronFiringsPerYear(a);
        if (byBreadth !== 0) return byBreadth;
        return earliestMinuteOfDay(a) - earliestMinuteOfDay(b);
      });
      const schedule = ranked[0]!;
      const grace = CRON_GRACE_SECONDS[slug];
      if (grace === undefined) {
        throw new Error(
          `No grace period for the cron "${slug}". Add one to ` +
            `CRON_GRACE_SECONDS in src/lib/cron-checks.ts, long enough to ` +
            `cover the route's own maxDuration.`,
        );
      }
      return {
        slug,
        schedule,
        grace,
        desc: CRON_CHECK_DESC[slug] ?? "",
        alsoPingedBy: ranked.slice(1),
      };
    })
    .sort((a, b) => a.slug.localeCompare(b.slug));
}
