-- A price plan belongs to the reader who set it.
--
-- The Research room draws a ladder of price levels for every listing from
-- arithmetic the reader can check, and the whole point of it is that the
-- reader owns the levels: every edge is editable, and an edited edge has
-- to survive a new browser or the plan is a scratchpad rather than a plan.
--
-- It rides on `portfell_lab_state` beside the conviction notes and the
-- watchlist, for the same reason those do: it is per owner rather than per
-- portfolio (one person's view of a company does not change because they
-- opened a different portfolio), nothing else reads it, and it is small.
--
-- Edits are stored as MULTIPLES OF THE ANCHOR, never as prices. The anchor
-- moves as the estimates move, and a reader who decided to trim a fifth
-- above fair value meant that rather than a dollar figure frozen on the
-- afternoon they typed it. Storing prices would leave every saved plan
-- slowly describing a company that no longer exists.
--
-- Row level security is the table's own, unchanged: the existing policies
-- are per row and cover every column.
alter table public.portfell_lab_state
  add column if not exists ladders jsonb not null default '{}'::jsonb;

comment on column public.portfell_lab_state.ladders is
  'Per-ticker price plan edits, as multiples of that ladder''s anchor. Written by the Research room; read there and by the alert builder.';
