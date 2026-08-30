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

1. Create a project at https://healthchecks.io and copy its ping key.
2. Set `CRON_HEARTBEAT_BASE=https://hc-ping.com/<ping-key>` in Vercel
   (production env only; previews and CI stay unset on purpose).
3. Create one check per schedule, named by slug, with the same cron
   expression (Healthchecks understands cron syntax directly) and a grace
   long enough to cover the route's own `maxDuration` plus retry slack:

   | Check (slug)        | Schedule (UTC)          | Suggested grace |
   | ------------------- | ----------------------- | --------------- |
   | `snapshot`          | `0 2 * * *`             | 30 min          |
   | `disaster-recovery` | `0 3 * * *`             | 30 min          |
   | `sunday-note`       | `0 4 * * 0`             | 2 h (resume slots ping the same check) |
   | `billing-reconcile` | `0 5 * * *`             | 30 min          |
   | `popular-tickers`   | `0 7 1 * *`             | 6 h             |
   | `margus-fund`       | `0 11 * * 1-6`          | 2 h (the 23:30 weekday slot pings it too) |
   | `empty-book-nudge`  | `0 14 * * *`            | 30 min          |
   | `splits`            | `0 15 * * 1-5`          | 1 h             |

   A check with several slots (sunday-note, margus-fund) is created against
   the slot that runs on the most days, and the extra slots simply ping the
   same check early, which Healthchecks treats as fine.
4. Point the project's alert channel at email (or anything else the service
   offers). The alert reads "check X is down", which maps one-to-one onto
   "route X has not completed since its last expected run".

The ping key is write-only: someone holding it can mark checks up or down,
nothing more. It still stays out of the client bundle (the variable has no
`NEXT_PUBLIC_` prefix and is only read server-side) and out of CI.

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
