import { isRequestAbort } from "@/lib/abort";
import { observeRoute } from "@/lib/observe-route";
import { logEvent } from "@/lib/telemetry";

/*
  A cron that stops firing is invisible, and everything else in this repo
  guards the other direction.

  The claim tables, the idempotency keys and `weeklyNumbersAreSound` all
  protect against a cron firing twice or firing with bad data. Nothing can
  protect, from inside the process, against Vercel's scheduler quietly not
  invoking the route at all: no code of ours runs, so no log line, no error
  and no alert. A missed splits day means every holding of a split company
  is priced at a tenth of the truth until a person notices by eye, and a
  missed disaster-recovery day is a backup gap nobody chose.

  The answer has to live outside the process: a dead-man's-switch service
  (Healthchecks.io, or anything with the same URL shape) that expects a
  ping on every successful run and alerts when one does not arrive on
  schedule. This file sends those pings.

  `CRON_HEARTBEAT_BASE` is the project's ping base, e.g.
  `https://hc-ping.com/<ping-key>`. Each cron pings `<base>/<slug>` where
  the slug is the route's own directory name (`snapshot`, `splits`,
  `sunday-note`, ...), so the checks to create in the service are exactly
  the entries in vercel.json's crons block, each with that schedule and a
  sensible grace. A failing run pings `<base>/<slug>/fail` so the alert is
  immediate instead of waiting out the grace window. Unset, all of this is
  a no-op: the app never hard-depends on a monitoring service, same as the
  market-data and model chains never hard-depend on one provider.

  The ping is best-effort in both directions. A monitoring outage must not
  fail the work it monitors, so a ping that cannot be delivered is logged
  and swallowed. And an unauthorized caller must not be able to touch the
  check at all, which is why auth-shaped answers ping nothing: silence is
  already the alarm when the scheduler itself is sending bad credentials.
*/

const PING_TIMEOUT_MS = 5_000;

/** `/api/cron/snapshot` is the check named `snapshot`. */
export function cronSlugFromRoute(route: string): string | null {
  const m = route.match(/^\/api\/cron\/([a-z0-9-]+)$/);
  return m ? m[1] : null;
}

/**
 * Tell the dead-man's-switch how this run ended. Never throws: the switch
 * watches the work, the work never waits on the switch.
 */
export async function pingCronHeartbeat(
  slug: string,
  outcome: "ok" | "fail"
): Promise<void> {
  const base = process.env.CRON_HEARTBEAT_BASE?.trim().replace(/\/+$/, "");
  if (!base || !/^[a-z0-9-]+$/.test(slug)) return;
  const url = `${base}/${slug}${outcome === "fail" ? "/fail" : ""}`;
  try {
    await fetch(url, {
      method: "POST",
      signal: AbortSignal.timeout(PING_TIMEOUT_MS),
    });
  } catch (err) {
    logEvent(
      "cron_heartbeat_unreachable",
      {
        slug,
        outcome,
        message: err instanceof Error ? err.message : String(err),
      },
      "warn"
    );
  }
}

/**
 * `observeRoute` for a scheduled route: same timing and throw logging, plus
 * the heartbeat ping. Every route under `src/app/api/cron/` exports its
 * handler through this (`cron-heartbeat.test.ts` fails on one that does
 * not), so a cron added later is on the switch without anybody remembering
 * this file exists.
 *
 * What counts as which outcome:
 * - a response below 400 pings success;
 * - 401 and 403 ping nothing, because those are a caller who was refused,
 *   not work that failed, and a stranger probing the URL must not be able
 *   to mark the check either way;
 * - every other status pings failure, since a 5xx and the config-shaped
 *   4xx/503 answers ("Supabase not configured", "CRON_SECRET is not
 *   configured") are all runs that did not do the day's work;
 * - a thrown error pings failure and is rethrown, except a caller abort,
 *   which is not the work failing.
 */
export function cronRoute<Args extends unknown[], Result>(
  handler: (...args: Args) => Result | Promise<Result>,
  route: string
): (...args: Args) => Promise<Result> {
  const observed = observeRoute(handler, route);
  const slug = cronSlugFromRoute(route);
  return async (...args: Args): Promise<Result> => {
    let result: Result;
    try {
      result = await observed(...args);
    } catch (err) {
      if (slug && !isRequestAbort(err)) {
        await pingCronHeartbeat(slug, "fail");
      }
      throw err;
    }
    if (slug && result instanceof Response) {
      if (result.status < 400) {
        await pingCronHeartbeat(slug, "ok");
      } else if (result.status !== 401 && result.status !== 403) {
        await pingCronHeartbeat(slug, "fail");
      }
    }
    return result;
  };
}
