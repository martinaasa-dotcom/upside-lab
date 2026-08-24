-- A co-owner could remove the owner from their own portfolio.
--
-- Migration 017 closed this exact hole on INSERT: the policy let any signed-in
-- stranger self-grant co-ownership through a direct REST call, and it was
-- tightened to existing co-owners only, with the note that the app writes this
-- table through the service role and so loses nothing. DELETE was left as it
-- was written in 011:
--
--   for delete using (public.portfell_is_portfolio_co_owner(portfolio_id))
--
-- which says any co-owner of a portfolio may delete any ownership row of that
-- portfolio, the owner's included. Invite your partner to a portfolio and they
-- can lock you out of it, with one request and no interface anywhere near it.
-- Verified against a real database with two accounts: Bob, invited as a
-- co-owner, deleted Ann's row and was left the only owner of a portfolio Ann
-- made.
--
-- Nothing in src/ deletes from this table, so the narrow rule costs the app
-- nothing, and it is the rule AGENTS.md already claims is in force: the one
-- write a client may make here is giving up its own access. Revoking somebody
-- else stays where every other administrative write already is, behind the
-- service role, where the caller is checked in code.
drop policy if exists "portfell_portfolio_owners_delete" on public.portfell_portfolio_owners;

create policy "portfell_portfolio_owners_delete" on public.portfell_portfolio_owners
  for delete using (user_id = (select auth.uid()));
