-- portfell_account_never_used could never answer true, so the path it
-- guards was dead from the day it was written.
--
-- The function decides whether an address that already has an Upside Lab
-- account may be adopted by somebody signing in with it: only when that
-- account has nothing in it at all, which is somebody who signed in once
-- and closed the tab. AGENTS.md describes the test as "no conviction notes
-- or watchlist", and the SQL tested for the EXISTENCE of a
-- portfell_lab_state row instead.
--
-- Every account has one. `ensureProfileAndClaims` upserts a lab-state row
-- for every account at sign-in, before anybody has written a note or added
-- a name to a watchlist, so the clause was false for everyone and the whole
-- function returned false for everyone. The documented behaviour was
-- unreachable, silently, and the failure looks exactly like the safe answer,
-- which is why nothing surfaced it.
--
-- The fix tests the row's CONTENT, which is what the documentation says and
-- what the question actually is: an empty lab row is the absence of any lab
-- state, not the presence of some.

create or replace function public.portfell_account_never_used(p_user uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select
    not exists (
      select 1
      from public.portfell_profiles p
      where p.id = p_user
        and (
          coalesce(nullif(trim(p.display_name), ''), null) is not null
          or p.experience_tier is not null
          or p.knows_options is not null
        )
    )
    and not exists (
      select 1 from public.portfell_holdings h
      join public.portfell_portfolio_owners o on o.portfolio_id = h.portfolio_id
      where o.user_id = p_user
    )
    and not exists (
      select 1 from public.portfell_portfolio_owners o where o.user_id = p_user
    )
    and not exists (
      select 1 from public.portfell_portfolios pf where pf.owner_id = p_user
    )
    and not exists (
      select 1 from public.portfell_community_members m where m.user_id = p_user
    )
    and not exists (
      select 1 from public.portfell_community_join_requests r where r.user_id = p_user
    )
    and not exists (
      select 1 from public.portfell_community_invite_uses u where u.user_id = p_user
    )
    -- The row itself is created for everybody at sign-in. What makes an
    -- account used is something written INTO it.
    and not exists (
      select 1 from public.portfell_lab_state l
      where l.owner_id = p_user
        and (
          coalesce(l.conviction, '{}'::jsonb) <> '{}'::jsonb
          or coalesce(jsonb_array_length(l.watchlist), 0) > 0
        )
    )
    and not exists (
      select 1
      from public.portfell_seed_claims sc
      join public.portfell_profiles p on p.id = p_user
      where sc.email = lower(p.email)
    );
$$;

revoke all on function public.portfell_account_never_used(uuid) from public;
revoke all on function public.portfell_account_never_used(uuid) from anon;
revoke all on function public.portfell_account_never_used(uuid) from authenticated;
