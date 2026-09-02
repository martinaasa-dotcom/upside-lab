-- Deleting an account reaches the saved copies of portfolios it deleted
-- earlier, not only the ones still standing.
--
-- portfell_purge_user_data scrubs snapshot payloads of `deleted_ids`, and
-- that array is built from portfell_portfolio_owners at purge time: the
-- portfolios this person still owns when they press delete. A portfolio
-- deleted last month is not in it, and a saved copy of it very much is.
-- DELETE /api/portfolios takes a `pre_delete` snapshot of the portfolio it
-- is about to remove, holding by holding, and a `manual` save carries
-- whatever the reader had at the time. So every holding of every portfolio
-- somebody deleted before deleting their account survived the deletion,
-- inside a jsonb payload, where the column sweep in
-- supabase/tests/account-deletion.test.sql cannot see it and where the
-- GDPR export never showed it to them either.
--
-- The saved copies name their owner. `captureBookPayload` selects whole
-- portfolio rows, so each entry in `payload->'portfolios'` carries the
-- `owner_id` the row had when the copy was taken. That is the key.
--
-- One condition on top of it, and it is the load-bearing one: an entry is
-- only scrubbed when the portfolio it names no longer exists. `owner_id` is
-- whoever created a portfolio, and a portfolio can be shared, so scrubbing
-- on the column alone would strip a co-owner's live portfolio out of every
-- save in the project and leave them unable to restore it. A portfolio that
-- is gone and was this person's is theirs alone to erase; a portfolio that
-- still stands belongs to somebody still using it.
--
-- Full CREATE OR REPLACE because Postgres has no way to add a statement to
-- a function. Everything here is the body from
-- 20260819170000_purge_email_seed_tables_on_deletion.sql with only the
-- snapshot block changed.

create or replace function public.portfell_purge_user_data(p_uid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_ids uuid[] := '{}';
  stale_ids uuid[] := '{}';
  scrub_ids uuid[] := '{}';
  rec record;
  owner_count int;
  member_count int;
  admin_count int;
  promote_id uuid;
  em text;
begin
  if p_uid is null then
    return;
  end if;

  select email into em from public.portfell_profiles where id = p_uid;

  for rec in
    select po.portfolio_id
    from public.portfell_portfolio_owners po
    where po.user_id = p_uid
  loop
    select count(*) into owner_count
    from public.portfell_portfolio_owners
    where portfolio_id = rec.portfolio_id;

    if owner_count <= 1 then
      deleted_ids := array_append(deleted_ids, rec.portfolio_id);
      delete from public.portfell_portfolios where id = rec.portfolio_id;
    end if;
  end loop;

  -- Last admin of a circle that still has other people: hand the role off
  -- so the group is not stuck with nobody who can invite or delete it.
  for rec in
    select m.community_id
    from public.portfell_community_members m
    where m.user_id = p_uid and m.role = 'admin'
  loop
    select count(*) into member_count
    from public.portfell_community_members
    where community_id = rec.community_id
      and user_id is distinct from p_uid;

    if member_count = 0 then
      delete from public.portfell_communities where id = rec.community_id;
      continue;
    end if;

    select count(*) into admin_count
    from public.portfell_community_members
    where community_id = rec.community_id
      and role = 'admin'
      and user_id is distinct from p_uid;

    if admin_count = 0 then
      select user_id into promote_id
      from public.portfell_community_members
      where community_id = rec.community_id
        and user_id is distinct from p_uid
      order by joined_at asc
      limit 1;

      if promote_id is not null then
        update public.portfell_community_members
        set role = 'admin'
        where community_id = rec.community_id
          and user_id = promote_id;
      end if;
    end if;
  end loop;

  -- Circles where this person is the only remaining member, even if not admin.
  for rec in
    select m.community_id
    from public.portfell_community_members m
    where m.user_id = p_uid
  loop
    select count(*) into member_count
    from public.portfell_community_members
    where community_id = rec.community_id
      and user_id is distinct from p_uid;
    if member_count = 0 then
      delete from public.portfell_communities where id = rec.community_id;
    end if;
  end loop;

  /*
    Portfolios of this person's that the saved copies still name and the
    database no longer has: the ones they deleted themselves, days or months
    before deleting the account. Read after the loop above, so a portfolio
    this purge just deleted counts as gone here too and a shared one does
    not. A payload id that is not a uuid is left alone rather than cast,
    since a payload is data and a cast that raises would take the whole
    deletion down with it.
  */
  select coalesce(array_agg(distinct q.pid), '{}')
    into stale_ids
  from (
    select (elem->>'id')::uuid as pid
    from public.portfell_book_snapshots s
    cross join lateral jsonb_array_elements(
      coalesce(s.payload->'portfolios', '[]'::jsonb)
    ) elem
    where elem->>'owner_id' = p_uid::text
      and elem->>'id' ~*
        '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) q
  where not exists (
    select 1 from public.portfell_portfolios p where p.id = q.pid
  );

  scrub_ids := deleted_ids || stale_ids;

  if cardinality(scrub_ids) > 0 then
    update public.portfell_book_snapshots
    set payload = public.portfell_scrub_snapshot_payload(payload, scrub_ids);

    /*
      A saved copy with nothing left in it is not a copy of anything, and
      its label is a name the deleted person chose ("Before delete: Savings").
      Scrubbing the payload and keeping the row would leave that name sitting
      in the table, so the row goes with its contents.
    */
    delete from public.portfell_book_snapshots
    where jsonb_typeof(payload->'portfolios') = 'array'
      and jsonb_array_length(payload->'portfolios') = 0;
  end if;

  delete from public.portfell_error_log where user_id = p_uid;
  if em is not null and length(trim(em)) > 0 then
    delete from public.portfell_error_log
    where lower(user_email) = lower(em);

    -- The hardcoded email-keyed seed tables. A deleted account's email
    -- should not survive here just because these tables have no FK to
    -- enforce it. Whichever role the email played (a household member, an
    -- alias, a seed claim, or the primary account an alias pointed at) is
    -- removed with it.
    delete from public.portfell_household_groups
    where lower(email) = lower(em);

    delete from public.portfell_account_aliases
    where lower(alias_email) = lower(em)
      or lower(primary_email) = lower(em);

    delete from public.portfell_seed_claims
    where lower(email) = lower(em);
  end if;
end;
$$;

revoke all on function public.portfell_purge_user_data(uuid)
  from public, anon, authenticated;
