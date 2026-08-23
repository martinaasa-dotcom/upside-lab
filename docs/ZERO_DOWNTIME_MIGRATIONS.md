# Zero-downtime schema migrations

Live traffic hits `portfell_portfolios` and `portfell_holdings` on every
portfolio load. A migration that takes an exclusive lock for more than a
heartbeat will queue those queries. Follow this order every time.

---

## Each new SQL file, in order

1. **Create the file the official way** (do not invent a timestamp):

```bash
npx supabase migration new short_description_here
```

That writes `supabase/migrations/<timestamp>_short_description_here.sql`.
Put only additive SQL in it when you can: new nullable column, new table,
new function, `CREATE INDEX CONCURRENTLY`.

2. **Lint for lock hazards** before anyone applies it:

```bash
npx tsx scripts/migrate-online.ts --lint supabase/migrations/<the-new-file>.sql
```

Fix every `error`. `warn` means "do this in a second migration after the
app no longer reads the old shape." `--force` skips that and is for a
maintenance window only.

3. **Apply on a copy first.** Use a Supabase branch, or a throwaway
   project. Use the **direct** Postgres URI (port `5432`), not the
   transaction pooler (`6543` / `pooler.supabase.com`):

```bash
DATABASE_URL='postgresql://postgres:…@db.YOUR-REF.supabase.co:5432/postgres' \
  npx tsx scripts/migrate-online.ts --apply supabase/migrations/<the-new-file>.sql
```

The script sets `lock_timeout = 2s` and `statement_timeout = 30s`. A lock
timeout retries instead of waiting behind a long report. `CREATE INDEX
CONCURRENTLY` is run outside a transaction (Postgres requires that).

4. **Ship the app that uses the new shape** (`git push` / Vercel). For a
   new nullable column, this can be the same release as the SQL. For a
   rename or a dropped column, the app that still reads the old name must
   already be gone.

5. **Apply the same file on production** with production `DATABASE_URL`,
   same `--apply` command. Watch Vercel and the site for a minute. If
   queries stall, the lint missed a lock. Roll *forward* with a fix. Do
   not `git revert` SQL that already ran.

6. **Tighten later** (separate file, after every live instance is on the
   new app): `SET NOT NULL`, `DROP COLUMN`, `DROP TABLE`.

---

## Expand / contract (the rule behind the steps)

Never change a live column's meaning in the same deploy as the app.

1. **Expand.** Add a nullable column, a new table, or a new function. Ship
   the app that writes both old and new shapes.
2. **Backfill.** `UPDATE ... WHERE new_col IS NULL LIMIT 1000` in a loop.
   Each batch should finish under `statement_timeout`.
3. **Contract.** Ship the app that reads only the new shape. Next
   migration: `SET NOT NULL` (short lock, table already filled) or
   `DROP COLUMN` once no running build selects the old name.

Renames follow the same pattern: add the new name, dual-write, drop the
old. Do not `RENAME COLUMN` on a hot table.

---

## What is safe on Postgres 15 (Supabase)

- `ADD COLUMN` nullable, or with a constant `DEFAULT` (no table rewrite)
- `CREATE INDEX CONCURRENTLY` / `DROP INDEX CONCURRENTLY`
- `ADD CONSTRAINT ... NOT VALID` then `VALIDATE CONSTRAINT`
- `CREATE OR REPLACE FUNCTION`
- `CREATE TABLE` / `CREATE SCHEMA`
- RLS policy changes that do not rewrite rows

## What is not

- `ALTER COLUMN ... TYPE` (rewrite)
- `ADD COLUMN ... NOT NULL` with no default (full scan + exclusive lock)
- `CREATE INDEX` without `CONCURRENTLY` on a table that already has rows
- `VACUUM FULL`, `REINDEX` without `CONCURRENTLY`, `TRUNCATE`
- `ADD FOREIGN KEY` / `CHECK` without `NOT VALID` on a large table

The linter (`src/lib/dr/migration-locks.ts`) flags those. Indexes created
in the same file as their `CREATE TABLE` are allowed without CONCURRENTLY:
the table is empty and the exclusive lock is cheap.

---

## If a migration is half-applied

A failed migration is not undone by reverting git. Prefer a forward fix
(add the missing column, finish the backfill). Restore a WAL-G point only
when you cannot roll forward. That restore takes the project down. See
`docs/DISASTER_RECOVERY.md`.
