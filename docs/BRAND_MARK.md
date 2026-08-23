# The Upside Lab mark

Upside Lab's mark is one solid gold **A** — a peak. It ships in
`src/components/UpsideLogo.tsx`, drawn from `src/lib/brand/mark.ts`.

This document records what was decided and why, so the next person does not
have to reconstruct it from the branch history.

---

## What it is

A single letter: a pointed apex, two feet on a shared baseline, a crossbar.
One mass, one warm ramp, no bevel and no mosaic.

**One** peak, and the count is the point. Your portfolio is something you hold
on your own — nobody else is in it — so the mark is a single object. Upside
Arena, the sibling product, draws **two** peaks in aqua, because Arena is a
game against people you know. Same construction, same grid, same light; the
count and the metal carry the difference.

### What it replaced, and why

Ten bevelled facets in gold, arranged as an ascending mosaic. It went on
2026-08-23, for two reasons that are worth keeping separate.

The dated one: a faceted, bevelled mosaic is a late-2010s idiom. Nothing Apple
ships looks like that any more, and neither does anything else people put on a
home screen next to it.

The concrete one: it did not work small. Ten facets meant nine hairlines, and
at 32px each of those was a pixel of mud. The mark stopped being ten triangles
and became a gold smudge — and 32px is a favicon, which is where most people
meet a mark for the first time. One solid mass reads at 16.

### Geometry

On a 64 grid, all of it in `src/lib/brand/mark.ts`.

| | Value |
|---|---|
| Apex | `(32, 4.75)` |
| Baseline | `59.25` |
| Foot, outer edge | 24 either side of centre |
| Foot, inner edge | 12.5 either side of centre — so a leg is 11.5 wide at the base |
| Counter's apex | `y = 24.75` |
| Crossbar | `x 20.6, y 34.75, 22.8 x 8` |

The drawing spans x 8–56 and y 4.75–59.25: 48 by 54.5, **centred on the
grid**, so a plated composition can scale about `(32, 32)` without the letter
drifting off centre.

The crossbar is a plain rectangle whose two ends are buried inside the legs.
Only the part crossing the counter is ever visible, which is why it can be a
rect rather than a trapezoid anybody has to maintain.

`MARK_BOX` and `MARK_VIEWBOX` are derived from those numbers, and
`MARK_ASPECT` (0.881) from the box. The lockups size the mark from the aspect
rather than from typed-out widths — see below.

### The colour: one warm ramp

| | From | To |
|---|---|---|
| `MARK_GRADIENT` | `#f5ecc6` | `#b58a41` |
| `MARK_FLAT` | `#d4bc79` | — |

Two steps either side of `--primary` (`oklch(0.8 0.09 90)`), running L 0.94 to
L 0.66, top-left to bottom-right. Stated in sRGB because a raster pipeline and
a mail client cannot do oklch.

The mark used to carry **ten** gradients, one per facet, all within a few
points of each other — a lot of machinery to produce something one gradient
produces better.

The bottom stop does not go lower on purpose. Gold only reads as gold while it
is light; much below L 0.66 it lands on khaki. That is the same rule
`DESIGN_TOKENS.md` states for `--primary` never being used as a dark tint.

`MARK_FLAT` exists for the two places a gradient is not worth having: the BIMI
mark, which a mail client draws at about 40px inside a circle, and any future
single-colour reproduction.

---

## The app icon

The mark is not the icon. The icon is the mark on a plate, and the plate is
where the Apple rules live. `PLATE` and `ICON_PRESETS` hold both.

### The plate

Full-bleed, opaque, and lit the way the app is: the warm lobe behind the
letter, the cool counter-lobe (`--ambient-cool`, hue 250) in the far corner,
over a field that runs a warm near-black to true black. An icon lit like the
product is what makes the home screen and the app feel like one thing rather
than two.

What it deliberately does **not** carry:

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

| Preset | Corner | Mark scale | Where it goes |
|---|---|---|---|
| `app` | square | 0.74 | Apple touch icon, App Store master |
| `tile` | 22.5% | 0.82 | favicons, bookmark tiles, PWA `any` |
| `maskable` | square | 0.52 | Android adaptive icons |
| `avatar` | square | 0.56 | the social avatar, cropped to a circle |

Each of them crops differently, which is why one safe area would be wrong for
all of them.

`src/lib/brand/mark-lockup.test.ts` fails if the drawing's **diagonal** leaves
the 80-percent circle a `maskable` or `avatar` icon reserves. The diagonal is
what matters and not the width: a letter that fits the circle across can still
have a foot outside it on the corner.

The touch icon is also the **only** Apple entry in the metadata now. A 192 PWA
icon used to sit alongside it, and that one carries its own rounded corners —
iOS picking it is another way to end up rounded twice.

---

## The lockup

`MARK_SIZE` in `UpsideLogo.tsx` holds a height and a width for each place the
lockup is drawn, as literal Tailwind classes. Literals, because Tailwind only
emits arbitrary values it can read as literal strings at build time.

A literal cannot follow the geometry, so `src/lib/brand/mark-lockup.test.ts`
makes it follow: move a foot in `mark.ts` and the test fails until the classes
catch up. Without it the failure is silent and ugly — the mark keeps its box,
the drawing letterboxes inside it, and the letter shrinks and drifts a couple
of pixels off the lockup's optical centre. Enough to look wrong in the app
bar; never enough to look like a bug.

The old mark needed a `-translate-y-[0.1em]` nudge because it sat in a square
viewBox with a third of the box as padding below it. The viewBox is tight to
the letter now, so centring the two boxes lands the apex and the cap line
together and the nudge is gone.

In the standalone lockups (`upside-lockup.svg`, `upside-badge.svg`, the email
header) the mark sits **on the type's baseline** rather than centred on it.
Both are flat-footed, so aligning the feet is what makes them look like one
object; centring the boxes leaves the letter hanging below the words, which
reads as a mark that slipped.

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
| `public/upside-mark.svg`, `.png` | The bare letter, transparent |
| `public/favicon.svg`, `public/upside-icon.svg` | Scalable tile |
| `public/favicon.ico`, `src/app/favicon.ico` | 16 + 32 |
| `public/icons/icon-{32,48,192,512}.png` | Favicons, bookmark tiles, PWA `any` |
| `src/app/icon.png`, `public/upside-icon.png` | Next file-convention icon, 128px tile |
| `src/app/apple-icon.png`, `public/apple-touch-icon.png` | Apple touch: square, opaque, full-bleed |
| `public/icons/icon-1024.png` | App Store master |
| `public/icons/icon-512-maskable.png` | PWA `maskable` |
| `public/upside-fund-x-avatar.png` | Social avatar, 1024, circle-safe |
| `public/upside-badge.svg`, `public/upside-lockup.svg` | Lockups, on black and transparent |
| `public/icons/email-lockup.png` | The Sunday letter's header |
| `public/bimi.svg` | The mail client's verified-sender mark |
| `public/og.png` | Social card, 1200x630 |

Every raster is supersampled — four times over below 256px, twice above — and
scaled back down, which is what keeps the long diagonals of the letter from
stairstepping at favicon sizes.

`Images/` still holds the source PNGs the old pipeline read. Nothing reads
them any more; they are the previous mark and are kept only as a record.

**After regenerating, bump the versions.** A favicon is one of the few things
a browser holds past a deploy:

- `?v=` on every icon entry in `src/app/layout.tsx`
- `OG_IMAGE_PATH` in `src/lib/seo-routes.ts` (and its expectation in
  `src/lib/site-metadata.test.ts`)
- the `lockup` URL in `src/lib/email-letter.ts`
- `CACHE` in `public/sw.js`, or an installed app keeps serving yesterday's
  logo out of its shell

`scripts/test-invariants.ts` checks the mark's viewBox against the geometry,
the lockup classes against the aspect, and that the generator has not gone
back to compositing a rounded mask over every output.

BIMI has its own function because it has its own profile: SVG Tiny 1.2
Portable / Secure. Square, a `<title>`, `version` and `baseProfile` declared,
flat fill, nothing dynamic. The narrower the feature set, the fewer validators
have an opinion.
