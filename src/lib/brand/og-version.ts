/*
  The version string on the social card's URL, `/og.png?v=<this>`.

  It used to borrow `MARK_ASSET_VERSION`, the hash of the mark's geometry,
  which was right while the only thing that ever changed the card was the
  mark. The card's words changed on 2026-10-02 and the mark did not, so a
  new card would have been served at the old URL, and the places a share
  link is unfurled (Slack, X, iMessage, LinkedIn) cache that image by URL
  for days to weeks: everybody pasting a link would have gone on seeing the
  old card.

  So the card versions itself, from its own bytes. It is the first 8 hex
  characters of the sha256 of `public/og.png`, and `og-version.test.ts`
  recomputes it from the file in the tree, so regenerating the card with
  `npm run icons` and forgetting this line fails CI with the value to
  paste. A change to the mark changes the card's bytes too, so this still
  moves when the mark does.
*/
export const OG_CARD_VERSION = "07439aae";
