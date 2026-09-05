-- A public circle lets people in.
--
-- Public already meant "anyone signed in can find this and ask to join",
-- and the asking then sat waiting on an admin who was told about it by a
-- single digit in a badge. In practice that is a door with a bell nobody
-- hears: the request is granted whenever the admin next happens to look,
-- so the gate delays people without deciding anything.
--
-- `auto_approve_joins` is the admin's decision, made once, recorded here,
-- rather than a rule the code applies to every public circle in the
-- product. It defaults to true, because that is what "public" reads as;
-- an admin who wants to vet every arrival turns it off in Settings and
-- the request goes back to waiting for them.
--
-- Private circles are unaffected: the join-request route refuses anything
-- that is not public before it ever reads this column, so an invite is
-- still the only way into one. Classes are always private for the same
-- reason and are set false here as well, so the column can never be the
-- thing that lets a stranger into somebody's homework.

alter table public.portfell_communities
  add column if not exists auto_approve_joins boolean not null default true;

update public.portfell_communities
  set auto_approve_joins = false
  where kind = 'classroom';

comment on column public.portfell_communities.auto_approve_joins is
  'Public circles only: let a join request in on the spot instead of waiting on an admin. Always false for classes.';
