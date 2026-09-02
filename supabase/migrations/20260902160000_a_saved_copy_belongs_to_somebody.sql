-- A saved copy belongs to somebody, and until now the table did not say so.
--
-- portfell_book_snapshots was built when a snapshot meant the whole project:
-- the nightly row is every portfolio in the product, and one retention window
-- over the table was the right shape for that. Two later kinds broke the
-- assumption without anyone noticing, because they are per person. A "manual"
-- row is one reader pressing Save, and a "pre_delete" row is the copy taken
-- before that reader deletes a portfolio, which is the only thing making the
-- deletion recoverable.
--
-- pruneOldSnapshots still counted them project-wide: twenty manual rows and
-- thirty before-delete rows in total, across everybody. So the twenty-first
-- manual save made by anybody deleted the oldest manual save belonging to
-- somebody else, and the nightly cron did it unaided every night the totals
-- were over. No attacker was needed and none of it was visible: the row is
-- simply gone, and the reader who saved it finds out the day they go looking
-- for an undo they no longer have.
--
-- owner_id is the fix and it is nullable on purpose. A nightly row genuinely
-- belongs to no one and keeps its project-wide window; every per-person row
-- is counted inside its own owner's window from here on.

alter table public.portfell_book_snapshots
  add column if not exists owner_id uuid references auth.users (id) on delete set null;

comment on column public.portfell_book_snapshots.owner_id is
  'Who this copy belongs to. Null for nightly rows, which are the whole project and keep a project-wide retention window. Set for manual and pre_delete rows, which are one person''s and are counted inside their own window.';

-- The prune reads newest-first per kind and, now, per owner.
create index if not exists portfell_book_snapshots_owner_idx
  on public.portfell_book_snapshots (kind, owner_id, created_at desc);

-- Backfill what can be attributed. A per-person payload carries the
-- portfolios it was made of, so the first of them names the owner through
-- the ownership table. Rows that cannot be attributed keep a null owner and
-- are pruned together, which is the behaviour they already had: this
-- migration must not invent an owner for a copy it cannot identify.
update public.portfell_book_snapshots as s
set owner_id = o.user_id
from public.portfell_portfolio_owners as o
where s.owner_id is null
  and s.kind in ('manual', 'pre_delete')
  and o.portfolio_id = ((s.payload -> 'portfolios' -> 0 ->> 'id')::uuid)
  and (s.payload -> 'portfolios' -> 0 ->> 'id') is not null;
