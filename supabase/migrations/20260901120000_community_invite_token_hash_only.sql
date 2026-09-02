/*
  A community invite is stored as its hash and nothing else.

  `20260817200329_community_invite_copy_token.sql` added a `token` column
  holding the raw invite token so an admin could copy a live link a second
  time. That made `token_hash` decorative: joining checked the hash, but the
  plaintext sat beside it, so anyone who could read the table held every
  live credential in it. Portfolio invites never did this; they keep the
  hash and show the link once.

  This is the contract half of expand/contract (docs/ZERO_DOWNTIME_MIGRATIONS.md):
  the app that reads and writes `token` ships first, and this file runs once
  no live build selects the column. The new app shows a link only in the
  response that created it, and an admin who needs to share one again makes
  a new link, which retires the old one.

  The plaintext is nulled before the column goes, so that if the drop is
  ever held back for a maintenance window the secret is already gone. The
  table is small (one row per invite ever made) so the update is a short
  lock. `DROP COLUMN` itself is a catalogue change and rewrites nothing.
*/

update public.portfell_community_invites
  set token = null
  where token is not null;

alter table public.portfell_community_invites
  drop column if exists token;
