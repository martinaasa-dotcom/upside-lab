# Accounts, ownership, and communities

## Product model

- **My book**: Google-signed-in users co-own portfolios via `portfell_portfolio_owners` (many users ↔ many portfolios). Full live read **and** write for every co-owner.
- `portfell_portfolios.owner_id` remains as optional primary/creator hint; **authorization uses the junction table**.
- **Communities**: members see each co-owner’s book live, **read-only**. Invite joins and existing members show every real portfolio unless the owner turns one off. A public join request lets them pick which portfolios the circle will see. Classrooms stay paper-only. Never share a real book into a class.
- Portfolio PIN/password and guest share links are **removed** — Google session + co-ownership is the only gate.
- Community membership is **always opt-in, never automatic**. Signing in never adds anyone to any community (fixed in `030`, see below). A community is either:
  - **Private** (default): invite-link only, exactly like portfolio co-ownership.
  - **Public**: discoverable to any signed-in user (`GET /api/communities/discover`), who can ask to join (`POST /api/communities/:id/join-request`) — an admin still has to approve (`PATCH` same route) before the requester gets read access to anyone's book.
  - **Classroom** (`kind = classroom`, always private): teacher-run paper class. Students join with an invite. Redeeming the invite (or an approved join request) provisions one homework portfolio with the class `starting_cash` and pins it. Real portfolios cannot be shared into a class. Class portfolios cannot be deleted while the class exists. See migration `039`. Teacher sets `class_plan` (migration `040`): buy week, closed, sell-and-move, or anything goes. Empty plan means open. Purpose is the house note. Teachers can still edit a class portfolio; students cannot break the current rule. Leaving the class unpins the homework portfolio and drops the class lock so it becomes a normal portfolio they can delete.

## Identity aliases

Multiple Google emails can map to **one person** in communities (`portfell_account_aliases`):

| Alias | Primary |
|-------|---------|
| `aasamartinaasa@gmail.com` | `martin.aasa@upthink.ee` |

Martin's two Google logins stay one person. Rasmus and Karoliine are **two** people who share Karud, the same way Martin and Amanda share Aasad / Anu / MaryAnn. Leaderboards combine co-owners of the same portfolios (`Rasmus and Karoliine`, `Martin and Amanda Aasa`). Co-ownership of the shared portfolio is unchanged.

Circle membership still copies across those households (`portfell_household_groups`, migration `053`). If Karoliine joins Monki, Rasmus is added too, same role. Same for Martin and Amanda, including Martin's second Google login. Leave and role changes copy as well. Classrooms stay per person. This is not a sign-in auto-join for strangers: it only mirrors a circle someone in the household already opted into.

## Community-pinned portfolios

`portfell_community_portfolios` pins portfolios into a community even before owners sign in. Upside Circle includes **Karud** and **Lap** (shown as “awaiting sign-in” until their seed emails claim).

## Seed ownership (test circle)

| Email | Portfolios |
|-------|------------|
| `martin.aasa@upthink.ee` | Aasad, Anu, MaryAnn |
| `aasamartinaasa@gmail.com` | Aasad, Anu, MaryAnn (alias of Martin) |
| `amandalucas400@gmail.com` | Aasad, Anu, MaryAnn |
| `rasmusmarjapuu@gmail.com` | Karud |
| `karukaroliine99@gmail.com` | Karud |
| `liinaanette@gmail.com` | Lap |

Multiple emails can map to the **same** `portfolio_slug` in `portfell_seed_claims` for co-ownership.

Claims: `/auth/callback` + `GET /api/portfolios` via `ensureProfileAndClaims` → junction insert.

- Preferred: `SUPABASE_SERVICE_ROLE_KEY` on Vercel.
- Fallback: RPC `portfell_claim_seed_for_me()`.

Ops SQL: `scripts/seed-ownership.sql`.

Add co-owner after both users exist: `POST /api/portfolios/:id/owners` `{ "email": "…" }` (caller must already co-own), or mint an invite from **My account**.

## Community invite links

Reusable until an admin retires the link or it expires. An optional email field is an allowlist (comma-separated), not a one-person ticket. Redeeming does not burn the link.

Each successful redeem writes `portfell_community_invite_uses` (one row per person per link). Admins see who minted it, how many unique people used it, and who those people are (`GET /api/communities/:id/invites`). **Retire this link** sets `revoked_at` (`PATCH /api/communities/:id/invites/:inviteId`). People already in stay. The raw token is only shown at create time. The list shows a 6-character hint.

## My Account (`/account`)

- **Community profile**: `display_name`, `bio`, `avatar_url` via `PATCH /api/auth/me` — shown on community member lists.
- **Portfolio invites**: mint shareable codes/links (`POST /api/portfolios/:id/invites`). Partner accepts at `/account/join?code=…` (`POST /api/portfolios/join`). Optional email locks the invite; if they already have a profile, Account tries direct co-owner add first.

## Superadmin

Hard-coded emails (`src/lib/auth/superadmin.ts`):

- `martin.aasa@upthink.ee`
- `aasamartinaasa@gmail.com`

UI: `/admin` (also in the workspace switcher). API: `GET /api/admin/overview` (403 otherwise).

Data via `portfell_superadmin_overview()` (migration `015`) when no service role; service-role path if `SUPABASE_SERVICE_ROLE_KEY` is set.

Shows every Upside profile (Google sign-ins), every community, and each community’s members/roles.

## Migrations

- `008` profiles + ownership + communities + RLS  
- `009` share links `created_by` (dropped in `013`)  
- `010` claim RPC (superseded claim body in `011`)  
- `011` `portfell_portfolio_owners` + co-owner RLS  
- `012` profile `bio` + `portfell_portfolio_invites`  
- `013` drop portfolio `access_secret_hash` + `portfell_share_links`  
- `014` community members RLS recursion fix  
- `015` superadmin overview RPC  
- `016` account aliases + community-pinned portfolios (Karud/Lap)  
- `049` Karud seed claim so Karoliine co-owns Karud on first sign-in (the alias that folded her into Rasmus was dropped in `052`)
- `052` drop the Karud account alias. Rasmus and Karoliine stay two Circle members on one book, like Martin and Amanda
- `053` household circle membership. Martin/Amanda and Rasmus/Karoliine join, leave, and change roles together. Classrooms stay per person.
- `050` community invite uses log + `token_hint`. Redeem RPC records who used which link. Admin list + retire.
- `051` circle share is opt-out again. Backfill members' real portfolios into non-class circles. Public join requests can store `share_portfolio_ids`.  

- `017` RLS hardening — closed a self co-owner-escalation hole on `portfell_portfolio_owners`, a world-readable `portfell_book_snapshots` policy, a stale shared-row leak on `portfell_lab_state`, and a null-email coalesce bug on invite `SELECT` policies
- `018` fixed `portfell_claim_seed_for_me()` — a PL/pgSQL loop variable named `slug` collided with the `portfell_portfolios.slug` column, so every first-time seed claim raised "column reference is ambiguous" and rolled back (profile included). Silently broken since `010`; only worked for people seeded directly via `scripts/seed-ownership.sql` (Martin/Martina/Amanda). Rasmus was backfilled manually after the fix; Karoliine and Liina will claim normally on their first sign-in now
- `029` community admin delete RLS policy (rename already had one from `008`)
- `030` **critical fix**: `ensureProfileAndClaims`'s service-role path (`claimWithServiceRole`) auto-joined *every* signed-in user into Upside Circle unconditionally, regardless of any seed claim — meaning any stranger creating an account was silently added to the family's community and granted read access to their books (and vice versa). Confirmed live for two non-family test accounts before the fix. Removed the auto-join entirely from both the app-code path and `portfell_claim_seed_for_me()` (which had a narrower, seed-claim-gated version of the same auto-join) — see `031` for the invite/request model that replaced it
- `031` `portfell_communities.visibility` (`public`/`private`, defaults to `private`), discovery `SELECT` policy for public communities, and `portfell_community_join_requests` (+ RLS) for the request-to-join flow
- `039` classroom kind + starting cash on communities, `classroom_community_id` on portfolios (one paper portfolio per student per class)

Writes require a signed-in **co-owner** only.

## Service role on production (added 2026-08-12)

`SUPABASE_SERVICE_ROLE_KEY` is now set on Vercel production. Before this, `ensureProfileAndClaims` always took the RPC path (`claimWithRpc`) since the service-role path was unavailable — that's why `018`'s ambiguous-column bug was able to silently strand new sign-ins for as long as it did (the RPC was the *only* claim path, with no fallback). With the key set, `ensureProfileAndClaims`/`getSupabaseDataClient()` now prefer the service-role path; the RPC path still exists as a fallback if the key is ever unset in a given environment (preview deploys, local dev).

This also unlocks full self-service account deletion (`/api/account/delete`) — with service role configured, deleting an account now removes the actual `auth.users` row via the admin API, not just the app-level data. Still worth a smoke test that calls `portfell_claim_seed_for_me` end-to-end occasionally, since a future regression there would still degrade (not strand) new sign-ins on any environment without the key.
