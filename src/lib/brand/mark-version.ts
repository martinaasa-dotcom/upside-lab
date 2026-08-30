/*
  The one version string behind every cache-busted mark asset.

  `docs/BRAND_MARK.md` used to end with four separate hand edits after any
  change to `mark.ts`: run `npm run icons`, bump every `?v=` in layout
  metadata, bump `OG_IMAGE_PATH`, bump the email lockup URL, and rename
  `CACHE` in `public/sw.js`. Nothing failed when one was missed, and a
  favicon is exactly the file a browser holds past a deploy, so a missed
  bump is a stale logo that outlives the change that replaced it.

  Now every `?v=` imports this constant, `public/sw.js` embeds it in its
  cache name, and `mark-version.test.ts` holds the whole chain honest:

  - The value is the first 8 hex characters of the sha256 of `mark.ts`
    (line endings normalized to \n). The test recomputes it, so a change
    to the mark geometry fails CI until this literal is updated, and the
    failure message prints the new value to paste in.
  - `npm run icons` writes the same hash into
    `public/icons/mark-source.json`; the test compares that too, so stale
    generated icons fail by name instead of shipping.
  - `public/sw.js` must name its cache `upside-shell-v<n>-<this value>`,
    because the worker serves `/icons/` cache-first and only a renamed
    cache makes an installed app drop yesterday's logo. The `v<n>` half
    still moves on its own for shell-only changes.

  A hash is not monotonic, but a cache-bust value only needs to differ
  from every value it replaces, and it never repeats an old one. Yes, a
  comment edit in `mark.ts` forces a bump; one refetch of a few small
  files is the cheap side of that trade, and "the hash of the file"
  beats any rule that needs a person to decide what counted as a change.
*/
export const MARK_ASSET_VERSION = "f93cf950";
