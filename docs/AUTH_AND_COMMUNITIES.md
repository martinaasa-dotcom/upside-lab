# Accounts, ownership, and communities

## Product model

- **My portfolio**: Signed-in users co-own portfolios via `portfell_portfolio_owners` (many users ↔ many portfolios). Full live read **and** write for every co-owner.
- `portfell_portfolios.owner_id` remains as optional primary/creator hint; **authorization uses the junction table**.
- **Communities**: members see each co-owner’s portfolios live, **read-only**. Invite joins and existing members show every real portfolio unless the owner turns one off. A public join request lets them pick which portfolios the circle will see. Classrooms stay paper-only. Never share a real portfolio into a class.
- Portfolio PIN/password and guest share links are **removed**. A signed-in session (Google or email link) plus co-ownership is the only gate.
- Community membership is **always opt-in, never automatic**. Signing in never adds anyone to any community (fixed in `030`, see below). A community is either:
  - **Private** (default): invite-link only, exactly like portfolio co-ownership.
  - **Public**: discoverable to any signed-in user (`GET /api/communities/discover`), who can ask to join (`POST /api/communities/:id/join-request`) — an admin still has to approve (`PATCH` same route) before the requester gets read access to anyone's portfolios.
  - **Classroom** (`kind = classroom`, always private): teacher-run paper class. Students join with an invite. Redeeming the invite (or an approved join request) provisions one homework portfolio with the class `starting_cash` and pins it. Real portfolios cannot be shared into a class. Class portfolios cannot be deleted while the class exists. See migration `039`. Teacher sets `class_plan` (migration `040`): buy week, closed, sell-and-move, or anything goes. Empty plan means open. Purpose is the house note. Teachers can still edit a class portfolio; students cannot break the current rule. Leaving the class unpins the homework portfolio and drops the class lock so it becomes a normal portfolio they can delete.

## One account, more than one address

`portfell_account_emails` (migration `20260823170000`) is the list of other addresses that open **one** account. Google sign-in hands back an address, so a second Google account used to mean a second Upside Lab account: new empty portfolios, no holdings, no circle, and a support email as the only way out.

**No second auth user is ever made.** Supabase still holds exactly one, with one primary email. The extra addresses are checked before a Google identity is turned into a session: `/auth/google/callback` asks `accountForAddress` first, and when it answers, the session comes from a one-time token minted for the account that owns the address (`magicTokenFor`, spent by `verifyOtp`) rather than from Supabase's own idea of who that address is. Email sign-in uses the same lookup (`hashedSessionTokenForAddress`).

Two ways to add one:

- **Connect a Google account.** The same own-domain handshake, with `intent=link` written into the state cookie *before* the browser leaves, because nothing coming back from Google can say what the trip was for. Google proved the address a second ago, so it goes down confirmed with no mail. Preview deploys fall back to Supabase's hosted handshake and cannot do this; they answer `not-configured`.
- **Send a link.** Anything else is mailed a confirmation carrying a token whose sha256 is all the table holds, good for one hour. `/auth/link` confirms the address and deliberately **signs nobody in**: a link sitting in an unconfirmed mailbox that opened somebody's account would be the thing this feature exists to prevent.

Adding is the service role's work (the check is the whole job, and a client checking itself is not a check). The one write a client may make to that table is deleting a row of its own, and RLS says so. The account export carries the list, without the digest of a pending confirmation.

**The one destructive case is narrow and the database decides it.** An address that already has an Upside Lab account can be taken only when `portfell_account_never_used` says that account has no name, no answers to the experience questions, nothing bought, no portfolio owned or co-owned, no circle, no join request, no saved conviction notes or watchlist, and no seed portfolio waiting on it. Two accounts that have both been used are refused and sent to support, because choosing which one loses its holdings is not a decision code gets to make.

Every outcome is a word in `ADDRESS_MESSAGES` (`src/lib/auth/account-addresses.ts`) and the sentence lives beside it, because the Google leg comes back as a redirect and can only carry the word.

### Four things the first version of this got wrong

**An address that has never signed up here is the dangerous one.** The confirmation refused an address whose account had things in it and adopted one whose account was empty, and said yes to an address with no account at all. That last case is the only one whose owner has never heard of Upside Lab, so nothing ever warned them and nothing ever would: bound to somebody else's account on the strength of one branded letter, their first Google sign-in landed there. `confirmAddressLink` takes the signed-in user now and refuses that case (`sign-in-first`) unless the browser pressing the button is signed in to the account that asked. The other cases are unchanged: holding the mailbox is the whole proof, and the link is often read on a phone that has never been signed in here.

**A page that asks you to agree to something has to say what it is.** `/auth/link` and `/auth/email` both showed a button and named neither the address nor the account. `pendingAddressLink` and `emailLoginTarget` read a token without spending it so both pages can, with the mailbox masked (`maskAddress`) because neither page is behind a session.

**A session is not swapped in silence.** Two roads used to mint one: a Google sign-in with a linked address opened an account named by a different address with nothing on screen saying whose, and `/auth/email/complete` wrote fresh cookies over whatever session was already in the browser. Both stop and ask. `/auth/continue` is that question, carrying its decision in a signed short-lived cookie (`src/lib/auth/continue-session.ts`), GET asking and POST minting; the email road peeks rather than spends, so somebody who answers no keeps a working link. `/auth/email/complete` refuses outright when another account is signed in here, unless the form says `switch=1`.

**The account screen does not say which addresses have accounts here.** A signed-in reader can type any address in the world into that field, so `has-data` and `linked-elsewhere` are answered with the same "check that inbox" sentence as a real send, and the refusal is mailed to the address it is about (`addressNotConnectedCopy`). Truthful words stay for anything about the caller's own account. Three limits sit under it: the existing six an hour per account, one every ten minutes for the same account and address, and three a day to one address whoever asks. A pending row nobody confirmed is superseded by a newer request rather than holding the address for an hour at a time.

And a confirmed link mails the account's own address (`addressConnectedCopy`), because the proof happens in the mailbox being added and that letter is the only thing that would ever say a new way in had appeared.

**Supabase project setting:** the Email provider has to be enabled on the project for `generateLink({ type: "magiclink" })` to mint that token. No mail is ever sent through it; Upside Lab sends its own through Resend. With the provider off, `magicTokenFor` returns null and the callback refuses rather than signing the wrong person in.

Do not replace any of this with Supabase's `linkIdentity`: it sends the browser to Supabase's own callback, which is the exact thing `src/lib/auth/google-oauth.ts` exists to avoid, and it would put a hostname nobody recognises on the consent screen.

Not the same thing as the alias table below, which stays. That one maps address to address so two **separate** accounts read as one person on a member list. It is a display rule and it never fixed the second account's empty portfolios.

## Email sign-in

People who will not use Google get a link mailed to their address. There is no password.

- `POST /api/auth/email` with `{ email }` (optional `next`, `confirmed`). Same "did you mean" and MX check as adding an address. Success always returns the same sentence, so it cannot say whether the address already has an account.
- Mail goes through Resend. The token's sha256 sits in `portfell_email_logins` for one hour. Service role only. Asking again replaces the row.
- `GET /auth/email?token=` shows a button and changes nothing. Mail scanners fetch every URL. `POST /auth/email/complete` spends the token, mints a session with `verifyOtp`, and runs `ensureProfileAndClaims`.
- If the address already reaches an account, that account is opened. Otherwise `createUser` (already confirmed, because the button is the proof) then `magicTokenFor`.

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
- `052` drop the Karud account alias. Rasmus and Karoliine stay two Circle members on one portfolio, like Martin and Amanda
- `053` household circle membership. Martin/Amanda and Rasmus/Karoliine join, leave, and change roles together. Classrooms stay per person.
- `050` community invite uses log + `token_hint`. Redeem RPC records who used which link. Admin list + retire.
- `051` circle share is opt-out again. Backfill members' real portfolios into non-class circles. Public join requests can store `share_portfolio_ids`.  

- `017` RLS hardening — closed a self co-owner-escalation hole on `portfell_portfolio_owners`, a world-readable `portfell_book_snapshots` policy, a stale shared-row leak on `portfell_lab_state`, and a null-email coalesce bug on invite `SELECT` policies
- `018` fixed `portfell_claim_seed_for_me()` — a PL/pgSQL loop variable named `slug` collided with the `portfell_portfolios.slug` column, so every first-time seed claim raised "column reference is ambiguous" and rolled back (profile included). Silently broken since `010`; only worked for people seeded directly via `scripts/seed-ownership.sql` (Martin/Martina/Amanda). Rasmus was backfilled manually after the fix; Karoliine and Liina will claim normally on their first sign-in now
- `029` community admin delete RLS policy (rename already had one from `008`)
- `030` **critical fix**: `ensureProfileAndClaims`'s service-role path (`claimWithServiceRole`) auto-joined *every* signed-in user into Upside Circle unconditionally, regardless of any seed claim — meaning any stranger creating an account was silently added to the family's community and granted read access to their portfolios (and vice versa). Confirmed live for two non-family test accounts before the fix. Removed the auto-join entirely from both the app-code path and `portfell_claim_seed_for_me()` (which had a narrower, seed-claim-gated version of the same auto-join) — see `031` for the invite/request model that replaced it
- `031` `portfell_communities.visibility` (`public`/`private`, defaults to `private`), discovery `SELECT` policy for public communities, and `portfell_community_join_requests` (+ RLS) for the request-to-join flow
- `039` classroom kind + starting cash on communities, `classroom_community_id` on portfolios (one paper portfolio per student per class)
- `20260823170000` `portfell_account_emails` plus `portfell_account_for_login_email` and `portfell_account_never_used`. One account, however many mailboxes. See the section at the top of this file

Writes require a signed-in **co-owner** only.

## Service role on production (added 2026-08-12)

`SUPABASE_SERVICE_ROLE_KEY` is now set on Vercel production. Before this, `ensureProfileAndClaims` always took the RPC path (`claimWithRpc`) since the service-role path was unavailable — that's why `018`'s ambiguous-column bug was able to silently strand new sign-ins for as long as it did (the RPC was the *only* claim path, with no fallback). With the key set, `ensureProfileAndClaims`/`getSupabaseDataClient()` now prefer the service-role path; the RPC path still exists as a fallback if the key is ever unset in a given environment (preview deploys, local dev).

This also unlocks full self-service account deletion (`/api/account/delete`) — with service role configured, deleting an account now removes the actual `auth.users` row via the admin API, not just the app-level data. Still worth a smoke test that calls `portfell_claim_seed_for_me` end-to-end occasionally, since a future regression there would still degrade (not strand) new sign-ins on any environment without the key.
