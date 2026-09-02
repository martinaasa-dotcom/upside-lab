# Cron monitoring

Every scheduling guarantee inside this codebase — the claim tables, the
Resend idempotency keys, `weeklyNumbersAreSound` — protects against a cron
firing *twice* or firing with *bad data*. None of them can protect against
Vercel's scheduler quietly not firing at all, because in that case no code
of ours runs: no log line, no error, no alert. A missed `splits` day prices
every holding of a split company at a tenth of the truth until a person
notices by eye; a missed `disaster-recovery` day is a backup gap nobody
chose. The audit checklist ranks this the most expensive silent failure in
the app.

The answer lives outside the process: a dead-man's-switch service that
expects a ping on every successful run and alerts when one does not arrive
on schedule.

## How it works

`src/lib/cron-heartbeat.ts` wraps every route under `src/app/api/cron/`
(via `cronRoute`, which also carries `observeRoute`'s timing and throw
logging). After each run it pings:

- `<CRON_HEARTBEAT_BASE>/<slug>` when the route answered below 400,
- `<CRON_HEARTBEAT_BASE>/<slug>/fail` when it answered 5xx, threw, or
  answered one of the config-shaped errors (400 "Supabase not configured",
  503 "CRON_SECRET is not configured"),
- nothing on 401/403, so a stranger probing the URL cannot mark a check
  either way. When the scheduler itself is sending bad credentials, the
  resulting silence *is* the alarm.

The slug is the route's own directory name, so the checks to create are
exactly the entries in `vercel.json`'s `crons` block.
`src/lib/cron-heartbeat.test.ts` fails if a cron route is not wrapped, or
if `vercel.json` and the route directories drift apart.

With `CRON_HEARTBEAT_BASE` unset nothing is pinged: the app never
hard-depends on a monitoring service, the same way the market-data and
model chains never hard-depend on one provider. A ping that cannot be
delivered is logged (`cron_heartbeat_unreachable`) and swallowed — the
switch watches the work, the work never waits on the switch.

## Setting it up (Healthchecks.io, free tier)

Two of these steps need a person, because they need an account and a
payment-free signup nobody can do on somebody else's behalf. The nine
checks in between are mechanical, and `scripts/setup-healthchecks.ts`
does them.

1. **A person.** Create an account and a project at
   https://healthchecks.io. Point the project's alert channel at email, or
   anything else the service offers, before creating the checks: a check
   with no channel is monitoring that cannot tell anybody. The alert reads
   "check X is down", which maps one-to-one onto "route X has not completed
   since its last expected run".
2. **The script.** From Project Settings, copy the project's read-write
   **API key** (not the ping key, which is a different value), then:

   ```
   npm run cron:checks -- --dry-run          # prints the plan, sends nothing
   HEALTHCHECKS_API_KEY=... npm run cron:checks
   ```

   It creates one check per cron, named by slug, carrying that cron's own
   schedule out of `vercel.json` and the grace period judged for it in
   `src/lib/cron-checks.ts`. Each check is upserted on its slug, so running
   it again after a schedule moves updates the check in place rather than
   making a second one. Set `HEALTHCHECKS_API_BASE` for a self-hosted
   instance.

3. **A person again.** Set `CRON_HEARTBEAT_BASE=https://hc-ping.com/<ping-key>`
   in Vercel, production environment only. Previews and CI stay unset on
   purpose. The ping key is write-only: someone holding it can mark checks
   up or down, nothing more. It still stays out of the client bundle (no
   `NEXT_PUBLIC_` prefix, read server-side only) and out of CI.

### What it creates

This table is what the script prints today. It is not the source of
anything: the schedules come from `vercel.json` and the grace periods from
`CRON_GRACE_SECONDS`, and `src/lib/cron-checks.test.ts` fails if this table
disagrees with either. A runbook naming the wrong hour is what produces the
false alert nobody trusts afterwards, so it is checked rather than trusted.

   | Check (slug)        | Schedule (UTC)          | Grace |
   | ------------------- | ----------------------- | ----- |
   | `snapshot`          | `0 2 * * *`             | 30 min |
   | `disaster-recovery` | `0 3 * * *`             | 30 min |
   | `sunday-note`       | `0 4 * * 0`             | 2 h (the two resume slots ping the same check) |
   | `billing-reconcile` | `0 5 * * *`             | 30 min |
   | `error-digest`      | `30 5 * * *`            | 30 min |
   | `popular-tickers`   | `0 7 1 * *`             | 6 h |
   | `margus-fund`       | `0 11 * * 1-6`          | 2 h (the 23:30 weekday slot pings it too) |
   | `empty-book-nudge`  | `0 14 * * *`            | 30 min |
   | `splits`            | `0 15 * * 1-5`          | 1 h |

A route scheduled more than once gets one check, on the slot that runs on
the most days; the other slots are retries of the same day's work and ping
it early, which the service treats as fine. A grace has to clear the
route's own `maxDuration` with room for a retry, and the test reads each
route's `maxDuration` and fails if one no longer does.

## What this deliberately does not do

- No pings from previews or CI: only production carries the env var, so a
  branch build cannot silence a real missed run by pinging the check.
- No per-run payloads or timings in the ping. Vercel's own logs and the
  `slow_route` telemetry already carry that; the switch answers exactly one
  question, "did the day's run complete", and stays trivial enough that it
  cannot itself be the thing that breaks.
- Failure detail stays in the logs. A `/fail` ping says *that* a run
  failed; the route's own JSON error and `logEvent` lines say why.

Upside Arena runs the same shape of schedule and can adopt the same file
unchanged; the two apps are one design here as everywhere else.
