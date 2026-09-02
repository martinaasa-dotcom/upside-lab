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
   | `snapshot`          | `0 2 * * *`             | 2 h |
   | `disaster-recovery` | `0 3 * * *`             | 2 h |
   | `sunday-note`       | `0 4 * * 0`             | 2 h (the two resume slots ping the same check) |
   | `billing-reconcile` | `0 5 * * *`             | 2 h |
   | `error-digest`      | `30 5 * * *`            | 2 h |
   | `popular-tickers`   | `0 7 1 * *`             | 6 h |
   | `margus-fund`       | `0 11 * * 1-6`          | 2 h (the 23:30 weekday slot pings it too) |
   | `empty-book-nudge`  | `0 14 * * *`            | 2 h |
   | `splits`            | `0 15 * * 1-5`          | 2 h |

### Why every grace is two hours

Because the scheduler is the larger term, and the first version of this
table did not account for it. Vercel does not promise a cron fires at the
minute named, and on this project it does not come close. Measured against
production rather than guessed, using the arrival times the work itself
records (`portfell_book_snapshots.created_at` against its 02:00 schedule,
`portfell_split_checks.claimed_at` against its 15:00 one) over about a
fortnight: sixteen runs, **3 to 59 minutes late, median 37**. Nine of the
fourteen snapshot runs were past the half hour this table first allowed, so
as originally written it would have raised a false alarm most days, which
is the failure the whole feature exists to avoid in its worst form.

So a grace is the worst observed arrival plus the route's own
`maxDuration` plus room. What it costs is detection latency, and that is
the cheap side of the trade: a backup that stopped running is noticed at
04:00 rather than 02:30, and nothing downstream of any of these jobs is
faster than a day. `cron-checks.test.ts` holds that floor against
`WORST_MEASURED_LATENESS_SECONDS`, so tightening one fails until somebody
re-measures.

A route scheduled more than once gets one check, on the slot that runs on
the most days; the other slots are retries of the same day's work and ping
it early, which the service treats as fine. A grace has to clear the
route's own `maxDuration` with room for a retry, and the test reads each
route's `maxDuration` and fails if one no longer does.

## A changed variable needs a deploy

`CRON_HEARTBEAT_BASE` is read at request time, but that is not the same as
taking effect at request time. Vercel's own documentation is explicit:
"Any change you make to environment variables are not applied to previous
deployments, they only apply to new deployments." So setting or changing it
in the dashboard does nothing at all until the next production deployment
goes out, and the symptom is exactly the symptom of a wrong ping key, which
is every check reading "Last Ping: Never" forever. Push anything to `main`,
or redeploy the current production deployment from the dashboard.

## Where it stands

Live since 2026-09-02. The project carries an email alert channel, the nine
checks below exist with these schedules in UTC, and `CRON_HEARTBEAT_BASE` is
set in Vercel's production environment only, as a secret.

If a check ever reads "Last Ping: Never" a day after its schedule should
have come round, the ping is not arriving: either the slug does not match
the route directory name or the ping key in `CRON_HEARTBEAT_BASE` is wrong.
The app cannot tell you, by design, since a failed ping is logged
(`cron_heartbeat_unreachable`) and swallowed so a monitoring outage never
fails the work it watches.

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
