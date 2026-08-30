# Secret rotation

`docs/DISASTER_RECOVERY.md` covers losing the data; nothing covered losing
(or merely suspecting) a key. This is the runbook: what each secret
protects, how to rotate it without downtime, and the two places where the
order genuinely matters. All of these live in Vercel env (production
scope); none are in CI, and `scripts/check-ci-env.ts` fails the build if a
secret name ever appears there.

When to rotate: immediately on any suspicion of exposure (a key pasted
into the wrong window, a laptop gone, a provider breach notice), and
otherwise as an annual review pass down this list. There is no automation
behind that cadence on purpose -- every key here is on a free or
near-free tier where the rotation cost is five minutes of hands, and a
scheduled rotation that nobody actually performs is worse than a short
list somebody reads once a year.

The general pattern, everywhere the provider allows two live keys:
create the new key, set it in Vercel, redeploy, verify, then revoke the
old one. Only revoke first when the provider forces it.

## The two rotations with teeth

**`SUPABASE_SERVICE_ROLE_KEY`** is the app's master key: every API write,
every cron, RLS bypassed by design. Rotating it in the Supabase dashboard
(Settings -> API) also rotates the anon key when done via the legacy "JWT
secret" reset, and *that* signs every user out. Prefer the per-key rotation
if the dashboard offers it for the project. Order:

1. **First check `UNSUBSCRIBE_SECRET` is set.** The Sunday letter's
   one-click unsubscribe link is an HMAC signed with `UNSUBSCRIBE_SECRET`
   *or, when that is unset, with the service role key*
   (`src/lib/unsubscribe-link.ts`). Rotating the service key with no
   `UNSUBSCRIBE_SECRET` silently invalidates the unsubscribe link in every
   letter already sitting in an inbox, and a reader whose unsubscribe
   does not work presses the spam button instead, which is charged
   against the sending domain. Set `UNSUBSCRIBE_SECRET` (any long random
   string), deploy, and let a send go out before touching the service key.
2. Rotate in Supabase, update `SUPABASE_SERVICE_ROLE_KEY` (and
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` if it moved too) in Vercel, redeploy.
3. Verify: sign in, save a holding, and hit one cron route by hand with
   the CRON_SECRET bearer.

**`SNAPSHOT_ENCRYPTION_KEY`** encrypts the cold copies in R2. A new key
does not open old objects, so rotating it forks history: everything
written before the rotation needs the old key forever (or until
retention expires it). Keep the retired key in the password manager,
labeled with its last-valid date, until every object it can open has aged
out (`DR_COLD_RETENTION_DAYS`, default 30). Rotating without keeping the
old key is quietly deleting a month of backups.

**`UNSUBSCRIBE_SECRET`** itself has the same property in miniature:
rotating it invalidates the unsubscribe links in letters already
delivered. Rotate it right after a Sunday send, so the links have a full
week as the freshest thing in each inbox, and never rotate it casually.

## The routine ones

Each of these follows create-new, swap, verify, revoke-old, with no
ordering constraints:

- **`CRON_SECRET`** -- shared bearer between Vercel Cron and the routes.
  Set the new value in env and redeploy; the scheduler sends whatever is
  current. If a `CRON_HEARTBEAT_BASE` alert fires right after, the values
  drifted (see `docs/CRON_MONITORING.md`).
- **`GOOGLE_CLIENT_SECRET`** -- Google Cloud allows two active client
  secrets per OAuth client precisely for this: add the new one, deploy,
  delete the old after a successful sign-in.
- **`RESEND_API_KEY`** -- second key from resend.com, swap, delete. Verify
  with a `?only=` test send rather than waiting for Sunday.
- **`STRIPE_SECRET_KEY`** -- Stripe's "roll key" keeps the old one valid
  for a chosen overlap (up to 7 days). Roll, swap, verify a checkout
  session opens.
- **`STRIPE_WEBHOOK_SECRET`** -- comes from the webhook endpoint, not the
  API key. Rolling it in the dashboard offers an overlap window too;
  verify by replaying an event and watching it verify. The daily
  `billing-reconcile` cron is the safety net if a webhook is missed
  mid-rotation.
- **LLM and market-data keys** (`OPENROUTER_API_KEY`, `GROQ_API_KEY`,
  `GEMINI_API_KEY`, `TWELVE_DATA_API_KEY`, `FINNHUB_API_KEY`) -- swap one
  at a time. The fallback chains (`src/lib/ai/model.ts`,
  `src/lib/market/quotes.ts`) carry the app across a dead key, so a
  half-finished rotation degrades instead of failing, which also means a
  *broken* new key can hide behind the chain: check the provenance panel
  names the expected provider afterward.
- **X tokens** (`X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`,
  `X_ACCESS_TOKEN_SECRET`) -- regenerate at developer.x.com. Posting is
  gated on `X_POSTING_ENABLED` anyway; the fund composes and stores each
  day's post regardless, so nothing is lost mid-rotation.
- **`DR_S3_ACCESS_KEY_ID` / `DR_S3_SECRET_ACCESS_KEY`** -- R2 API tokens:
  create a second token scoped to the same bucket, swap, revoke. Then run
  `npx tsx scripts/restore-snapshot.ts --latest` once so the *read* path
  is proven with the new token too, not just the nightly write.
- **`SUPABASE_ACCESS_TOKEN`** -- personal access token used only to read
  WAL backup status; regenerate at supabase.com/dashboard/account/tokens,
  swap. The DR cron records a warning rather than failing while it is
  missing.
- **`CRON_HEARTBEAT_BASE`** -- the ping key inside the URL is write-only
  (it can mark checks up or down, read nothing). Regenerate in the
  monitoring service if leaked; a wrong value shows up as every check
  going quiet at once.
- **Database password** (`DATABASE_URL` for dumps and psql) -- reset in
  Supabase Settings -> Database. Nothing serverless uses it, so the blast
  radius is whoever runs dumps by hand.

## After any rotation

Watch the next scheduled day end to end: the heartbeat checks all green
(`docs/CRON_MONITORING.md`), a Sunday letter arriving with a working
unsubscribe link, and `/admin` free of new red rows. A rotation that
"worked" is one that has survived one full cycle of the schedule, not one
that deployed without an error.
