-- A class portfolio stays in its class.
--
-- Migration 20260819120000 made the insert policy on
-- portfell_community_portfolios refuse a real portfolio pinned into a
-- classroom, which is the direction that leaks somebody's real money to a
-- class. It said nothing about the other direction: a student could pin the
-- class's paper portfolio into an ordinary circle they belong to, and
-- everybody in that circle would read homework as somebody's real holdings,
-- in the circle's book, the leaderboard and the Sunday letter's comparisons.
-- The app route that mints these rows (POST /api/communities/[id]/sheets)
-- had the same gap, checking the class rule only when the target was a
-- class, and is fixed in the same change.
--
-- The rule, stated for both directions: a pinned portfolio either carries no
-- classroom and goes into a circle, or carries one and goes into exactly
-- that class. Both write policies take the extra clause, the owner's and the
-- admin's, because a circle admin can pin without owning. It is written as
-- "there is no portfolio row saying this belongs to a different class"
-- rather than as a positive match, so the admin policy keeps the leniency
-- it has today for a row the admin cannot read at all.

drop policy if exists portfell_community_portfolios_owner_insert
  on public.portfell_community_portfolios;
create policy portfell_community_portfolios_owner_insert
  on public.portfell_community_portfolios
  for insert
  with check (
    portfell_is_community_member(community_id)
    and exists (
      select 1
      from public.portfell_portfolio_owners o
      where o.portfolio_id = portfell_community_portfolios.portfolio_id
        and o.user_id = (select auth.uid())
    )
    and (
      not exists (
        select 1
        from public.portfell_communities c
        where c.id = portfell_community_portfolios.community_id
          and c.kind = 'classroom'
      )
      or exists (
        select 1
        from public.portfell_portfolios p
        where p.id = portfell_community_portfolios.portfolio_id
          and p.classroom_community_id = portfell_community_portfolios.community_id
      )
    )
    and not exists (
      select 1
      from public.portfell_portfolios p
      where p.id = portfell_community_portfolios.portfolio_id
        and p.classroom_community_id is not null
        and p.classroom_community_id <> portfell_community_portfolios.community_id
    )
  );

drop policy if exists "portfell_community_portfolios_admin"
  on public.portfell_community_portfolios;
create policy "portfell_community_portfolios_admin"
  on public.portfell_community_portfolios
  for all
  using (public.portfell_is_community_admin(community_id))
  with check (
    public.portfell_is_community_admin(community_id)
    and (
      not exists (
        select 1
        from public.portfell_communities c
        where c.id = portfell_community_portfolios.community_id
          and c.kind = 'classroom'
      )
      or exists (
        select 1
        from public.portfell_portfolios p
        where p.id = portfell_community_portfolios.portfolio_id
          and p.classroom_community_id = portfell_community_portfolios.community_id
      )
    )
    and not exists (
      select 1
      from public.portfell_portfolios p
      where p.id = portfell_community_portfolios.portfolio_id
        and p.classroom_community_id is not null
        and p.classroom_community_id <> portfell_community_portfolios.community_id
    )
  );
