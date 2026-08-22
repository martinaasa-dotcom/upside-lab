# Disaster recovery

Nightly in-database saves (`portfell_book_snapshots`, 02:00 UTC) live in the
same Postgres as the book. If that project is gone, those rows are gone.

Cold copies are a second, encrypted JSON dump of every portfolio's cash and
holdings, stored in Cloudflare R2 (or AWS S3). A daily cron also checks that
Supabase still has a fresh WAL / daily backup.

Nothing here changes the app UI.

**Already on Vercel production:** `SNAPSHOT_ENCRYPTION_KEY`,
`SUPABASE_PROJECT_REF`, `DR_S3_PREFIX`, `DR_S3_REGION`.

**Still required:** the four R2 values in Part B, then the redeploy in
Part C.

**Skip the Supabase access token.** It only lists whether Supabase still
has a platform backup. New tokens cannot be set to never expire (max one
year), so we do not use it. Close that Generate New Token dialog. Cold
copies on R2 are the copy that survives a deleted project.

---

## Part A. Supabase access token (optional, skip)

Skip this unless you later want the cron to fail when Supabase's own
backups go stale. Close the token dialog and go to Part B.

If you do want it later: [Account tokens](https://supabase.com/dashboard/account/tokens)
→ **Generate new token** → name `Upside Lab DR cron` → **Expires in:
Custom** (latest date, at most one year) → copy once → test:

```bash
curl -sS -o /tmp/sb-backups.json -w "%{http_code}\n" \
  -H "Authorization: Bearer PASTE_TOKEN_HERE" \
  "https://api.supabase.com/v1/projects/uzrnybyggznpvgxgrvgl/database/backups"
```

You want `200`. Then add `SUPABASE_ACCESS_TOKEN` on
[Vercel env](https://vercel.com/upthink-solutions/upside/settings/environment-variables)
(Production, Sensitive). Without this variable the cron skips the listing
and still uploads to R2.

---

## Part B. Cloudflare R2 bucket (cold copies)

Do **not** use Upside Lab Supabase Storage for this. Deleting that project
deletes its files. R2 is a separate account, which is the point.

R2's free tier is enough. You need a Cloudflare account. If you already use
Cloudflare for DNS, use that same login.

### B1. Create the bucket

1. Open [https://dash.cloudflare.com](https://dash.cloudflare.com) and pick
   the account.
2. Left sidebar: **Storage & databases** → **R2**.
3. First visit: click **Purchase R2** (the free plan is fine) and accept.
4. **Create bucket**.
5. Name: `upside-lab-backups` (lowercase, hyphens only).
6. Location: **Automatic**, unless you want EU only. EU-only uses a slightly
   different endpoint (Cloudflare shows it after the token is created).
7. Create bucket. Leave public access **off**.

### B2. Create S3 access keys

1. Still on **R2 → Overview**.
2. On the right, **Account Details** → **API Tokens** → **Manage**.
3. **Create Account API token** (or User token if you are not a Super Admin).
4. Name: `upside-lab-dr`.
5. Permissions: **Object Read & Write**.
6. Apply to: **Specify buckets** → `upside-lab-backups` only.
7. Create the token.
8. Copy, in this order, into your password manager. The secret is shown once:
   - **Access Key ID**
   - **Secret Access Key**
   - **Jurisdictional endpoint** or **S3 API** URL. It looks like
     `https://<32-hex-chars>.r2.cloudflarestorage.com`
9. If the confirmation page has no endpoint, the Account ID is on **R2 →
   Overview**, right side. Endpoint is
   `https://THAT_ACCOUNT_ID.r2.cloudflarestorage.com`.

You now have four values:

| Vercel name | What you copied |
| --- | --- |
| `DR_S3_ENDPOINT` | `https://….r2.cloudflarestorage.com` (no bucket name on the end) |
| `DR_S3_BUCKET` | `upside-lab-backups` |
| `DR_S3_ACCESS_KEY_ID` | Access Key ID |
| `DR_S3_SECRET_ACCESS_KEY` | Secret Access Key |

`DR_S3_REGION` is already `auto` on Vercel. Leave it.

### B3. Put the four values on Vercel

Same page as before:
[Environment Variables](https://vercel.com/upthink-solutions/upside/settings/environment-variables)

Add each one, **Production** only. Mark the two keys **Sensitive**.

Or from this repo (one command per variable):

```bash
printf '%s' 'https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com' | npx vercel env add DR_S3_ENDPOINT production --no-sensitive --yes
printf '%s' 'upside-lab-backups' | npx vercel env add DR_S3_BUCKET production --no-sensitive --yes
printf '%s' 'PASTE_ACCESS_KEY_ID' | npx vercel env add DR_S3_ACCESS_KEY_ID production --sensitive --yes
printf '%s' 'PASTE_SECRET_ACCESS_KEY' | npx vercel env add DR_S3_SECRET_ACCESS_KEY production --sensitive --yes
```

### B4. Optional: AWS S3 instead of R2

Skip B1–B3. Create a private bucket in the AWS console. Then set:

- `DR_S3_BUCKET` to the bucket name
- `DR_S3_REGION` to the bucket region (`eu-north-1`, `us-east-1`, …).
  Overwrite the current `auto` value.
- `DR_S3_ACCESS_KEY_ID` / `DR_S3_SECRET_ACCESS_KEY` from an IAM user that can
  `s3:PutObject`, `s3:GetObject`, `s3:ListBucket` on that bucket only.
- Do **not** set `DR_S3_ENDPOINT`.

---

## Part C. Redeploy, then prove it

New env vars are invisible to the running cron until the next production
deploy.

1. [Deployments](https://vercel.com/upthink-solutions/upside/deployments) →
   the latest **Production** row → **⋯** → **Redeploy** → confirm.
   Wait until the status is **Ready** and `upsidelab.app` points at that
   deployment.
2. From this repo, with `CRON_SECRET` already in `.env.local`:

```bash
set -a && source .env.local && set +a
curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  https://upsidelab.app/api/cron/disaster-recovery | python3 -m json.tool
```

3. You want `"ok": true` and `"uploaded": true` under `cold`. If `cold`
   says skipped, a name is missing or misspelled. If you get 401, the cron
   secret does not match production. If you get 503, read `warnings`.
4. In Cloudflare: **R2** → `upside-lab-backups`. You should see a folder
   `upside-lab/book-snapshots/YYYY/MM/DD/` with a `.json.ulenc` file and a
   `.manifest.json`.
5. Prove the file decrypts and the money still adds up:

```bash
set -a && source .env.local && set +a
npx tsx scripts/restore-snapshot.ts --latest
```

That should print `"ok": true` and
`SUM(cash)+SUM(holdings)=…`. `--require-sql` also needs `DATABASE_URL` and
`psql` (the direct 5432 URI, not the pooler).

After this, the 03:00 UTC cron does the same job every night. You do not
need to click anything daily.

---

## What the daily job does

`GET /api/cron/disaster-recovery` (03:00 UTC, same `CRON_SECRET` as the
other crons):

1. Ask Supabase for the backup list **if** `SUPABASE_ACCESS_TOKEN` is set.
   Otherwise skip that check.
2. Read every `portfell_portfolios` and `portfell_holdings` row (service
   role).
3. Checksum: `SUM(cash) + SUM(shares × buy price)`, rounded to the cent.
4. Encrypt the JSON (`SNAPSHOT_ENCRYPTION_KEY`) and PUT it to the bucket.
   A sibling `.manifest.json` stores the checksum and the backup check, not
   the holdings.

5. Delete any cold snapshot + manifest object older than
   `DR_COLD_RETENTION_DAYS` (default **30**, unset elsewhere). This is a
   whole-account export — one encrypted blob per day, covering every portfolio and
   every owner — so there is no way to cut a single deleted account out of
   an already-written copy. Bounding the whole object's age is what the
   privacy policy promises instead: a deleted account's data can persist in
   that day's backup for up to the retention window, then the object is
   gone. A purge failure is logged as a warning; it does not fail the job or
   block the next day's upload.

   30 days is deliberate. These copies exist to rebuild after a
   catastrophic Supabase failure, a mass accidental delete, or ransomware,
   and all of those are noticed in days. A longer window reads as an
   archive rather than a backup, and raises the GDPR bar for no operational
   gain. `src/lib/dr/config.test.ts` pins the default so it can't drift
   away from the number published in `src/app/privacy/page.tsx` §7.

## Retention backstop (do this once, in Cloudflare)

The purge above runs *inside the cron*. If the cron stops running —
disabled, failing, quota — objects live forever and the privacy promise
quietly stops being true, with nothing to notice.

Set an **R2 bucket lifecycle rule to expire objects after 45 days**, on
the same prefix (`DR_S3_PREFIX`, default `upside-lab/book-snapshots`).
It is deliberately longer than the cron's 30 so the cron stays the thing
that normally does the work and the rule only catches the failure case.
This cannot be done from this repo; it is a console action on the bucket.

## Restoring after someone has deleted their account

A cold copy is a point in time. Anyone who ran self-service account
deletion **after** that copy was written is still inside it, and restoring
brings them back.

So a restore is not finished when the data loads. Before the app is
serving again, re-apply the deletions that happened since the snapshot:
run `portfell_purge_user_data()` for every account deleted in that window.
Reconstruct that list from whatever survived (the deletion log, support
mail, the `portfell_profiles` rows that exist in the snapshot but not in
the pre-incident production database).

Skipping this step silently un-deletes people who asked to be forgotten,
which is the failure mode regulators actually care about — and it is the
condition that makes "backups may retain data until the cycle expires" a
defensible position rather than an excuse.

Local dry run (uses `.env.local`):

```bash
npx tsx scripts/export-cold-snapshot.ts
```

If R2 or the Supabase token is missing, the job still captures the book and
returns warnings. A stale backup or a failed upload returns HTTP 503 so
Vercel marks the cron red.

---

## Restore validator (any time)

Decrypts a snapshot, loads cash + holdings into a throwaway Postgres schema
(`dr_restore_*`), checks the same SUM, then drops the schema. Never writes
to `public`.

```bash
npx tsx scripts/restore-snapshot.ts --file path/to/book.json.ulenc
npx tsx scripts/restore-snapshot.ts --latest
npx tsx scripts/restore-snapshot.ts --s3-key upside-lab/book-snapshots/2026/08/17/book-....json.ulenc
npx tsx scripts/restore-snapshot.ts --live --require-sql
```

A drifted SUM exits 1.

---

## If production Postgres is gone

1. Create a new Upside Lab Supabase project. Keep the `portfell_*` table
   names.
2. Apply `supabase/migrations` in order (`supabase db push` against the new
   project).
3. If the *old* project still exists: Dashboard → **Database** →
   **Backups** → restore the closest point. The project is down while that
   runs. Prefer this when you only need to rewind a few hours.
4. If the project is deleted: Supabase's own backups died with it. Decrypt
   the latest R2 object (`npx tsx scripts/restore-snapshot.ts --latest` is
   a check, not a loader). Insert `payload.portfolios` and
   `payload.holdings` with the service role, or ask an agent to write that
   one-off load. Then point Vercel at the new URL + keys. Isolation is env,
   not a table rename.

---

## What this does not replace

- Nightly `portfell_book_snapshots` (the 14-day spark, in-app restore of
  your own portfolios)
- Auth users, storage objects, Edge Config, Vercel env
- A one-click "put this file back onto live portfolios" button. The validator
  only proves the file is intact. Loading it onto production is a
  deliberate, owned action.
