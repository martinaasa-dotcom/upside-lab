# The Upside Lab mark

Upside Lab's mark is a standing gold **A**, cut into ten flat facets and lit
from the upper right. It ships in `src/components/UpsideLogo.tsx`, drawn from
`src/lib/brand/mark.ts`.

This document records what was decided and why, so the next person does not
have to reconstruct it from the branch history.

---

## What it is

Ten triangles arranged as an "A": a two-facet apex, then two bands widening
toward the feet, with the counter left open through the middle. Hairline gaps
between the facets, a four-step warm ramp across them, all of it flat — no
bevel, no stroke, no shadow.

**One** peak, and the count is the point. Your portfolio is something you hold
on your own, so the mark is a single object. Upside Arena, the sibling
product, draws **two** peaks in aqua, because Arena is a game against people
you know.

### What changed, and what did not

The drawing did not change. There was a version of this branch that replaced
the mosaic with one solid "A", and it was thrown out: the faceted mark is the
identity, it was already good, and what it needed was polish rather than
replacement.

What changed is everything around it, plus two things about the drawing itself
that were never decisions — just artefacts of it having been traced from a
raster rather than constructed:

- **It leaned.** The trace was up to 0.75 units out of true across a
  105-unit-wide drawing, and rows disagreed with themselves about where they
  sat by a tenth of a unit (56.43 against 56.53, 84.27 against 84.37).
  Every mirror pair is now one offset from the centre line applied to both
  sides, so the left and the right are the same drawing to the hundredth of a
  unit. `scripts/test-invariants.ts` fails if any point loses its mirror.
- **It carried ten gradients.** One per facet, no two quite the same, several
  within a point or two of each other. That is not a lighting model, it is ten
  hand-picked values. There are four named steps now — `lit`, `face`, `edge`,
  `deep` — and each facet takes one. The values are the original ones,
  grouped. Nothing got brighter or duller.

### Geometry

On the 128 grid the mark has always been drawn on. The drawing spans x
11.62–116.38 and y 20.27–104.64: 104.75 by 84.37, an aspect of **1.2416**,
centred exactly on x = 64.

`MARK_BOX`, `MARK_VIEWBOX` and `MARK_ASPECT` are all derived from the facet
table, so there is no second place for them to drift.

### Two colourways

The mark has two, and which one is right depends entirely on what it is
sitting on. `COLOURWAYS` in `mark.ts`. Both run top-right to bottom-left,
which is where the light comes from (`LIGHT`), and both have the same four
steps: the facet the light lands on, the ones facing it, the ones turned
away, the ones in shadow at the foot.

**`MARK`** is the app's: gold on the app's own true black. The header lockup,
the splash, the email header, the OG card, `public/upside-mark.svg`.

| Step | From | To |
|---|---|---|
| `lit` | `#ead6ab` | `#b29a6f` |
| `face` | `#dfc59a` | `#a6875d` |
| `edge` | `#caac7a` | `#8f6b3a` |
| `deep` | `#b38e62` | `#764b1f` |

**`ICON`** is the home screen's, and it is the reverse: the warm accent as the
*field*, with the facets in a deep espresso ink.

| | From | To |
|---|---|---|
| plate | `#f7e2b4` | `#b8822c` |
| `lit` | `#4a3512` | `#2a1d08` |
| `face` | `#3a2a0d` | `#1f1506` |
| `edge` | `#2a1d07` | `#150e03` |
| `deep` | `#1a1204` | `#0b0701` |

The light still comes from the upper right in both. A dark object lit from the
upper right has its upper-right facets *lighter*, so `lit` stays the brightest
step in the ink ramp too; it just means less contrast against the plate rather
than more against the field.

Why the icon is not simply the app: see the plate below.

### The hairlines follow the size

`facetScale()` decides how hard the cuts read, and every drawing of the mark
uses it: the React component from the size its lockup lands at, and each
raster from the size the mark itself is drawn at inside its plate.

| Drawn at | Facet scale | What you see |
|---|---|---|
| 96px and up | 1 | the mosaic, hairlines and all |
| 64 to 95px | 1.06 | cuts tightening |
| 40 to 63px | 1.16 | cuts nearly gone |
| under 40px | 1.30 | the gaps close; a solid "A" |

The numbers are measured rather than guessed. A facet's centroid sits about a
third of its height from each edge, so a scale of 1.13 moves an edge by only
0.9 units and closes barely half of a 3.1-unit gap — which is worse than
either extreme, because a half-closed cut is exactly the grey mud this is
trying to avoid. 1.30 is what actually closes it on the small facets; the
large apex pair simply overlap, which at that size nobody can see.

The gaps are about 3.1 units on a 128 grid — a little under two and a half
percent of the width. At 512px that is a crisp 12px cut and the whole point of
the mark. At 32px it is three quarters of one pixel: anti-aliasing turns it to
grey mud and ten gold triangles read as one gold smudge. So below 96px the
facets are swelled about their own centroids until the gaps close, and the
mark resolves into the solid standing "A" that was underneath the mosaic all
along. Same drawing either way; what changes is how much of the cut a pixel
can still carry.

This is the mirror of Arena's `cutForSize`, which widens a hairline as its
drawing shrinks, for exactly the same reason.

---

## The app icon

The mark is not the icon. The icon is the mark on a plate, and the plate is
where the Apple rules live. `PLATE` and `ICON_PRESETS` hold both.

### The plate

One linear gradient, top to bottom, full-bleed and opaque. Nothing else.

It used to be the app's own ambient lighting — a radial field with a warm lobe
behind the mark and a cool counter-lobe in the far corner — moved onto a 128px
tile, where all it did was read as a smudge. An icon plate is a flat colour
with a gentle fall, the way every icon it will sit beside is.

**And the field is the accent, not the app's black.** This is the correction
that mattered most, and it only showed up when the icons were put in a grid
next to the ones people actually have. A near-black tile among them does not
read as premium and restrained; it reads as a hole where an app should be.
Lab's chrome is true black and stays true black — the icon is the one place
that rule deliberately does not reach, because an icon is not chrome, it is a
thing on somebody's home screen competing with forty others.

There is a second reason it had to be this way round for Lab specifically.
Gold occupies a narrow band: it only reads as gold while it is light. So gold
can be the *mark* on something very dark, or it can be the *field* — but the
one thing it cannot be is a mark on a middling warm ground, which is where an
earlier attempt landed when it ran a warm glow at 26 percent behind a gold
mosaic and produced khaki on brown.

What the plate deliberately does **not** carry:

- **no baked corner radius** on the square shapes. This is the one that was
  actually wrong before: every icon in this repo shipped with a 22.5 percent
  radius baked in, including the Apple touch icon, so iOS rounded an
  already-rounded icon. The tell is a thin dark crescent inside each corner.
  The rounding now lives only on the shapes nothing else masks.
- **no baked drop shadow and no baked specular highlight.** The system adds
  its own lighting, and a second one underneath it reads as dirt.
- **no alpha channel** on the square shapes. Apple rejects an App Store icon
  with transparency.
- **no text.** Nothing survives 16px.

### The presets

`glyph` is the fraction of the canvas the mark's **width** takes, not a raw
scale factor, because the mark is a wide drawing and a scale says nothing
about how close a foot lands to an edge.

| Preset | Corner | Width | Where it goes |
|---|---|---|---|
| `app` | square | 0.66 | Apple touch icon, App Store master |
| `tile` | 22.5% | 0.70 | bookmark tiles, PWA `any` |
| `favicon` | 22.5% | 0.80 | the 16, 32 and 48 favicons |
| `maskable` | square | 0.55 | Android adaptive icons |
| `avatar` | square | 0.58 | the social avatar, cropped to a circle |

Each of them crops differently, which is why one safe area would be wrong for
all of them. `favicon` is `tile` with more of the plate given to the mark,
because a favicon is the one place the icon is smaller than the thing it has
to say.

**0.66 is the register, not a compromise.** A centred symbol on an Apple icon
runs between about half and two thirds of the tile — Music's note is near
0.48, Messages' bubble near 0.64, Mail's envelope near 0.66 — and the margin
around it is doing as much work as the symbol. This was 0.80 for one round
because bigger sounded better; in a grid beside real icons it read as crowded
rather than as confident.

`src/lib/brand/mark-lockup.test.ts` checks two things the eye will not:

- that the drawing's **diagonal** stays inside the 80-percent circle a
  `maskable` or `avatar` icon reserves. The diagonal, not the width: a mark
  that fits the circle across can still have a foot outside it on the corner.
- that both feet clear the squircle the system cuts, measured against the
  actual corner arc rather than a bounding box — a bounding-box check on a
  triangle is far too pessimistic and would push the mark smaller than it
  needs to be.

### The optical lift

The plated icons sit the mark 2.5 percent above the geometric centre of the
plate. The mark is a triangular mass: nearly all of its area is along the
baseline and the apex is a point, so its perceived centre is well below the
middle of its bounding box, and centred by the numbers it reads as having
sagged.

It applies to the plated icons only. The bare mark is placed by whatever is
around it — a flex row in the lockup, a host's own tile padding — and a
drawing that is secretly off-centre would fight all of them.

---

## The lockup

`MARK_SIZE` in `UpsideLogo.tsx` holds, for each place the lockup is drawn, the
box the mark gets and roughly how wide that lands in pixels.

The classes are literal because Tailwind only emits arbitrary values it can
read as literal strings at build time, and the pair has to hold the mark's own
1.2416 aspect or the browser letterboxes it and the mark silently loses height
it could have had. `src/lib/brand/mark-lockup.test.ts` fails if one drifts, and
also if a `drawnAt` stops matching the box it belongs to — that number is what
decides how hard the hairlines are cut, and a stale one cuts the mark for the
wrong size with no symptom but a logo that looks slightly off.

In the standalone lockups (`upside-lockup.svg`, `upside-badge.svg`, the email
header) the mark is **centred on the type's cap band**, not stood on its
baseline. It is a triangle: its feet are its widest part and its apex is a
point, so its optical centre sits well below its geometric one, and standing
it on the baseline leaves it looking like it is sliding off the front of the
words.

---

## Regenerating the assets

Geometry lives in **one** place, `src/lib/brand/mark.ts`.
`scripts/generate-pwa-icons.mjs` imports it directly — Node strips the types
on import — rather than rasterising a PNG out of `Images/` the way it used to.
That old route meant the icons could only ever be as good as a bitmap somebody
exported once, every output carried the trim's guesswork, and the app's own
inline logo was a second drawing kept in step by hand.

```
npm run icons
```

That writes:

| File | Use |
|---|---|
| `public/upside-mark.svg`, `.png` | The bare mark, transparent |
| `public/favicon.svg`, `public/upside-icon.svg` | Scalable tile |
| `public/favicon.ico`, `src/app/favicon.ico` | 16 + 32 |
| `public/icons/icon-{16,32,48}.png` | Favicons |
| `public/icons/icon-{192,512}.png` | Bookmark tiles, PWA `any` |
| `src/app/icon.png`, `public/upside-icon.png` | Next file-convention icon, 128px tile |
| `src/app/apple-icon.png`, `public/apple-touch-icon.png` | Apple touch: square, opaque, full-bleed |
| `public/icons/icon-1024.png` | App Store master |
| `public/icons/icon-{192,512}-maskable.png` | PWA `maskable` |
| `public/upside-fund-x-avatar.png` | Social avatar, 1024, circle-safe |
| `public/upside-badge.svg`, `public/upside-lockup.svg` | Lockups, on black and transparent |
| `public/icons/email-lockup.png` | The Sunday letter's header |
| `public/bimi.svg` | The mail client's verified-sender mark |
| `public/og.png` | Social card, 1200x630 |

Every raster is supersampled — four times over below 256px, twice above — and
scaled back down, which is what keeps the long diagonals of the facets from
stairstepping at favicon sizes.

`Images/` still holds the source PNGs the old pipeline read. Nothing reads them
any more; they are kept only as a record.

**After regenerating, bump the versions.** A favicon is one of the few things a
browser holds past a deploy:

- `?v=` on every icon entry in `src/app/layout.tsx`
- `OG_IMAGE_PATH` in `src/lib/seo-routes.ts` (and its expectation in
  `src/lib/site-metadata.test.ts`)
- the `lockup` URL in `src/lib/email-letter.ts`
- `CACHE` in `public/sw.js`, or an installed app keeps serving yesterday's
  logo out of its shell

BIMI has its own function because it has its own profile: SVG Tiny 1.2
Portable / Secure. Square, a `<title>`, `version` and `baseProfile` declared,
nothing dynamic, one flat fill per facet rather than the ramp — a mail client
draws it at about 40px inside a circle, where four gradients are invisible,
and the narrower the feature set the fewer validators have an opinion about
it. It carries the **icon** colourway, not the app's: what a reader sees next
to a verified sender should be the same thing they see on their home screen.
