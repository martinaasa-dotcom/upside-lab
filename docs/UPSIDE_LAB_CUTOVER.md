# Upside Lab cutover

Production data lives on the dedicated **Upside Lab** Supabase project (`uzrnybyggznpvgxgrvgl`, eu-north-1). Table names stay `portfell_*`. The shared Upthink Platform project (`jwjezdgggrgdgfsovgtx`) no longer serves this app.

This is not a Shopify app. There is no Partner Dashboard and no `shopify.app.toml`.

## Repository

The GitHub repository is [`martinaasa-dotcom/upside-lab`](https://github.com/martinaasa-dotcom/upside-lab), branch `main`. It was renamed to match the product name; GitHub keeps redirecting the old path, but write new links against `upside-lab`.

The rename stops at GitHub. These keep their older names on purpose, because renaming them moves live infrastructure rather than a label:

- The **Vercel project** is still `upside` — dashboard links stay `https://vercel.com/upthink-solutions/upside/...`.
- Legacy deployment hosts (`portfolio-*.vercel.app`, `upside-*.vercel.app`) stay in the redirect allow-list in `src/lib/site-url.ts`.
- The R2 bucket `upside-lab-backups` and prefix `upside-lab/book-snapshots` are storage paths (`src/lib/dr/config.ts`), not repository names.
- `portfell_*` tables and `portfell-*`/`upside-*` localStorage keys are untouched, as everywhere else.

## Database isolation

Vercel production and preview, plus local `.env.local`, point at:

- `NEXT_PUBLIC_SUPABASE_URL=https://uzrnybyggznpvgxgrvgl.supabase.co`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` for that project

Do not rename `portfell_*` tables.

RLS is enabled on every `portfell_*` table. Holdings and portfolios are scoped to co-owners; community members get read access to portfolios pinned into a community they belong to. Writes to someone else's portfolio stay denied.

## Auth

Site URL on the dedicated project: `https://upsidelab.app`. Redirect allow-list includes the apex, www (legacy), the Vercel alias, and localhost.

Google provider credentials were copied from the old project. In Google Cloud, authorized redirect URIs must include:

- `https://upsidelab.app/auth/callback`
- `https://www.upsidelab.app/auth/callback`
- `https://uzrnybyggznpvgxgrvgl.supabase.co/auth/v1/callback`

Keep the old Upthink Platform callback until you are sure nobody still signs in there, then remove it.

Existing Google users were copied with the same user ids, so portfolios and community membership survive. Sessions do not: everyone signs in with Google once on the new project.

## Domain

Canonical host: `upsidelab.app`. Known legacy hosts then 301 to it (path + query kept). `/api/*` is not redirected, so Vercel cron and signed callbacks do not drop a body.

Redirects stay off until you set `UPSIDE_CANONICAL_HOST=upsidelab.app` in Vercel. Shipping the 301 against a parking page on ZoneOS took the live alias down; do not set that env until the domain's nameservers point at this project.

### DNS / Vercel

- Buy/configure `upsidelab.app` and add it as the production domain in Vercel.
- Point the apex + `www` at Vercel.
- Set production env:
  - `UPSIDE_CANONICAL_HOST=upsidelab.app`
  - `NEXT_PUBLIC_SITE_URL=https://upsidelab.app`
  - `OPENROUTER_HTTP_REFERER=https://upsidelab.app`
  - `OPENROUTER_APP_TITLE=Upside Lab Assistant Margus`

## What this repo does not do for you

- Register extra Google Cloud OAuth redirect URIs (add the dedicated project's `/auth/v1/callback` if sign-in fails after cutover).
- There is no Shopify app to reconfigure.
