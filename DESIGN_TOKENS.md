# Design tokens — deep-black system

Source of truth: the sign-in landing page (`src/components/SignInGate.tsx`).
Its background, card, border, and radius are the *same tokens* the rest of
the app already uses (`bg-background`, `bg-card`, `border-border`,
`--radius`) — verified by reading the component source, not by eyeballing
a screenshot. So the fix here is narrower than "redesign everything": the
base (black field, card step, hairline borders, radius scale) was already
correct and already shared with the landing page. The one real gap was
`--primary`, which was gold — everything below documents that change and
nothing else moves.

## Warning/caution semantic

`--warning` (and `--chart-3`, which shared its value) was also gold-hued
(`oklch(0.769 0.188 70.08)`, hue 70°) — banned under "yellow/amber/gold in
any form," no semantic carve-out given for it the way gain/loss got one.
Moved to a true orange, hue 45° — clearly on the red/orange side of the
wheel, not the yellow/gold side, so it doesn't quietly reintroduce the
banned hue under a different name.

New: `--warning` / `--chart-3`: `oklch(0.63 0.22 45)`.

## Accent Palette (the ceiling — nothing outside this list without updating this file first)

| Color | Token(s) | Allowed for |
|---|---|---|
| Warm yellow | `--primary`, `--ring`, `--sidebar-primary`, `--sidebar-ring` | Primary buttons, focus rings, active/selected states, the main chart line/gradient, icon-badge accents (landing page bullet icons), card ring accents. This is the one brand accent. |
| Orange | `--warning`, `--chart-3` | Caution/warning states only (e.g. Pulse alert badges). Not a general-purpose accent — don't reach for it decoratively. |
| Emerald | `--gain` | Gains only. Semantic, not brand. |
| Rose | `--loss` / `--destructive` | Losses and destructive actions only. Semantic, not brand. |
| Blue | `--ambient-cool` | The ambient page glow's bottom-right counter-lobe, and nothing else — see "Ambient counter-lobe" below. Deliberately not exported as a Tailwind utility, so there is no `bg-ambient-cool` to reach for. |

Four colors total, three of them semantic single-purpose (warning/gain/loss)
and one general brand accent (warm yellow) — plus one chrome-only value
(`--ambient-cool`) that lights a corner of the room and never touches a
component. Nothing else gets a new color
without adding a row here first.

### `--loss` chroma (corrected in Round 2)

`--loss` is `oklch(0.645 0.21 16.439)`, not `0.246`. At 0.246 this
hue/lightness sits outside sRGB and browsers clipped it to
`rgb(255,32,86)` — a channel-maxed red, far louder than `--gain`'s
in-gamut `rgb(0,188,125)`. Two colours meant to carry equal weight were
not reading as equals. 0.21 resolves to `rgb(242,67,95)`. `--chart-5`,
which shares the value, moved with it. If you ever change this, verify
in-gamut by rasterising to a canvas and checking no channel pins to 0 or
255 — `oklch()` will happily accept a value the display cannot show.

## Categorical data ramp (`--cat-1` … `--cat-10`, `--cat-neutral`)

The Accent Palette above is a ceiling for **decorative** colour. It is not
workable for **categorical data**: the allocation bar encodes eleven
themes side by side, and four colours cannot tell eleven things apart. So
this is the documented exception the Accent Palette's own rule asks for —
added here first, then used.

| Token | Value | Token | Value |
|---|---|---|---|
| `--cat-1` | `oklch(0.78 0.1 195)` | `--cat-6` | `oklch(0.62 0.11 195)` |
| `--cat-2` | `oklch(0.62 0.11 230)` | `--cat-7` | `oklch(0.78 0.1 340)` |
| `--cat-3` | `oklch(0.78 0.1 125)` | `--cat-8` | `oklch(0.62 0.1 125)` |
| `--cat-4` | `oklch(0.62 0.11 340)` | `--cat-9` | `oklch(0.78 0.09 230)` |
| `--cat-5` | `oklch(0.78 0.09 260)` | `--cat-10` | `oklch(0.62 0.11 260)` |
| `--cat-neutral` | `oklch(0.62 0 0)` | | |

Rules for this ramp:

1. **Five hues at two lightness steps, not ten hues at one.** Low chroma
   throughout (0.09-0.11, near `--primary`'s own 0.09) so it reads as one
   restrained family. Ten distinguishable *hues* is not actually available
   here: the banned violet arc (270-330) plus the four hues spoken for by
   semantic colours (loss 16, warning 45, primary 90, gain 162) leave well
   under 180 degrees of usable wheel, which would space ten hues about 14
   degrees apart — indistinguishable at this chroma. Splitting the
   lightness gets ten separable steps honestly.
2. **Every hue clears all four semantic hues by at least 18 degrees, and
   none falls in 270-330.** Keep both properties if you change a value.
   This was learned the hard way: an earlier all-one-lightness version put
   crypto on hue 90 and data-center power on hue 40, so on the Circle
   bestiary the Dragon card came out the same colour as the Fox card
   (`--primary`) and the Rhino card the same colour as the Shark card
   (`--warning`). The table before *that* (`#a78bfa`, `#e879f9`,
   `#818cf8`, `#f59e0b`, hardcoded hex, no tokens) is what had put the
   banned hues on screen in the first place, as the widest strip of colour
   in the product.
3. **Chart categories and archetype chrome only.** Never status, never
   anything a person reads as good/bad — `--gain`/`--loss`/`--warning` own
   that, and a category borrowing one of them makes both meaningless.

### Who consumes this ramp

Two tables, both in `src/lib/portfolio-personality.ts`, and they agree by
construction:

- **`THEME_COLOR`** — the Lab allocation bar and its legend, one step per
  `ForecastTheme`.
- **`ANIMAL_CARD_TONE`** — the Circle bestiary cards, the pill next to a
  member's name, the tile behind the emoji, and the milestone bar.

`ANIMAL_CARD_TONE` used to be 21 hand-picked Tailwind hues — one bespoke
palette per archetype, including all four banned ones plus a
`bg-{hue}-500/10` tinted card wash apiece. Twenty-one distinguishable hues
cannot be picked tastefully; the attempt is what produced the rainbow. It
is now 13 shared tones, because the archetypes are not 21 unrelated
things:

- **Ten of them are the theme animals.** Beaver *is* AI computer builders,
  Rhino *is* data-center power, Dragon *is* crypto. They point at the same
  `--cat-*` step their theme uses in `THEME_COLOR`, so a Beaver card and
  the matching slice of the allocation bar are the same colour without
  anyone having to keep them in sync by hand.
- **The other eleven describe temperament**, which is a real three-step
  axis rather than eleven arbitrary points: steady (`--cat-neutral`),
  balanced (`--primary`), and runs hot (`--warning` — a jumpy,
  concentrated book is a caution, which is exactly what that token means).

Colour there now carries information. Identity was never the job: every
archetype already ships an emoji and a name, which are far stronger cues
than hue.

**One constraint if you touch those class strings:** they are literal
Tailwind arbitrary values (`bg-[var(--cat-2)]`,
`bg-[color-mix(in_oklch,var(--cat-2),transparent_80%)]`). The JIT scans
source for literal strings, so building them from a template literal makes
the classes silently stop existing. Verify against the compiled bundle,
not the source.

## The accent: a subtle warm yellow

An earlier saturated violet tested live and didn't land; the request was
explicitly "white, or a subtle yellowish tone." Current value: `--primary: oklch(0.8 0.09 90)` (was
`oklch(0.62 0.24 291)`). Lower chroma and a hue further from orange than
the original "Gold Delta" (`oklch(0.762 0.102 80)`, hue 80°) — this reads
as a quiet warm neutral, not a bright brand color, and sits far enough
from `--warning`'s hue 45° that the two don't get confused.
`--primary-foreground` moves back to near-black (`oklch(0.145 0 0)`), same
reasoning as the original gold: light backgrounds need dark text.

Same pass added two shared utility classes in `globals.css`. **Values below
were re-measured from the running app in the Round 2 audit — the numbers
originally written here had drifted from the code:**

- **`.glass`** — `background-color: color-mix(in oklch, var(--card),
  transparent 38%)` plus `backdrop-filter: blur(28px) saturate(1.6)`. The
  standard fill for every top-level card/panel (`BOX`, `SCORE_CELL`,
  `SHELL_TONES`, `LIST`, `Reading`, the shadcn `Card` primitive, and the
  hand-rolled `bg-card ring-1 ring-foreground/10` pattern that recurred
  across ~13 files) — translucent instead of opaque so the ambient corner
  glow shows through, blurred, instead of stopping dead at the card edge.
- **`.glass-well`** — same idea for nested `bg-muted` wells: `transparent
  50%` and `backdrop-filter: blur(16px) saturate(1.4)`. It *does* carry
  its own blur (an earlier version of this doc said it didn't).

**Write the prefixed `-webkit-backdrop-filter` first and the standard
`backdrop-filter` last in both rules.** Authored the other way round, the
CSS transform collapsed the pair and emitted only the prefixed form; Blink
does not honour that alias, so `backdrop-filter` computed to `none` and
every glass surface in the app rendered as a flat translucent tint with no
blur on desktop Chrome, Edge and Android Chrome. It was invisible in
source and only showed up in the compiled bundle — check there, not here.
- **`.card-sheen`** changed from a `--card`-to-lighter-`--card` gradient
  to a white-to-transparent specular wash. The old version's stops were
  both opaque, so layering it over `.glass`'s translucent
  `background-color` would have fully re-opaqued the card (`background-
  image` paints over `background-color`) and silently cancelled the glass
  effect. The new version never references `--card` at all, so it composes
  with either an opaque or translucent base underneath.

The ambient glow itself (`.page-frame::before`) also got stronger, since
translucent cards dilute whatever glow sits behind them and the ask was
explicitly to see it through the cards, not just in the gutters between
them. **Current measured values: a 1250x1000px key lobe at 52% off the
top-left corner (`-4% -8%`), plus a faint 1300x1000px counter-lobe at 14%
bottom-right — both in `--primary`.** (This doc previously said
30%/22% at 1600/1400px, and described a second gain-green lobe — both
wrong; see "Gradient/glow pattern" below.)

The button `default` variant's gradient changed from a two-stop
lighten-toward-white wash to a three-stop highlight/base/shadow gradient
(`white 25%` → base → `black 15%`) plus an inset top highlight
(`box-shadow: inset 0 1px 0 ...`). The old version mixed a *light* primary
toward white, which reads as almost no gradient at all — the fix for "no
button looking boxes" (Pass 2) is not the same fix as "buttons look flat
and gray" (this pass); the former was about affordance, this one is about
the gradient having enough dynamic range to read as a lit surface instead
of two adjacent shades of pale.

## Gradient/glow pattern (from the landing page, now shared app-wide)

Two large, heavily blurred radial shapes, **both in `--primary`**, shared
app-wide as `.page-frame::before` (`src/app/globals.css`).

**One colour only, on purpose.** Gain-green is a financial signal — it
means "this went up" — so it does not belong in ambient chrome that has
nothing to do with performance. The Round 2 audit found green still in two
places on the signed-out page (`bg-gain/10` at `blur(130px)`, and a
`to-gain/10` stop in the sample card's halo), measured as rgb(0,11,7) on
the right against rgb(37,34,21) warm on the left. That was the
"unexplained green glow" the design reviews kept flagging. Both are now
`--primary`.

## Why the glass is mostly *edge*, not blur (2026-08-20)

Turning the standard `backdrop-filter` back on (it had been silently
dropped from the compiled bundle — see above) produced **no visible
change**, which is worth writing down so nobody re-fixes it.

A blur can only reveal itself if the backdrop it samples has structure.
Measured behind a typical card, the ambient field varied by about **11
levels out of 255**, in a perfectly smooth radial ramp. Blurring a smooth
4% ramp is arithmetically indistinguishable from not blurring it. The
glass was working; there was nothing behind it to refract.

So on a true-black field, what actually reads as glass is, in order:

1. **The specular edge.** A bright hairline along the top where a pane
   catches the light, and a much fainter one along the bottom where light
   wraps under it. This is the strongest cue by a wide margin.
2. **A room with real dynamic range.** The key lobe was tightened and
   roughly doubled (measured page-wide spread **33 → 68** of 255), so the
   light actually ramps across a row of cards and each pane picks up the
   part of the light it sits in.
3. **The blur itself** — which mostly matters where a card overlaps other
   content rather than empty field.

Two things were tried and measured *worse*, so don't reach for them:

- **A second strong lobe** (top-right). It lit both sides evenly and
  flattened the left-to-right difference between cards from 13 to 5 —
  i.e. it made every card look the same, which is the opposite of the
  goal. One key light plus a faint counter-lobe is the composition.
- **More transparency alone.** On a flat field, a more transparent card
  is just a darker card; it does not become glassier. Transparency only
  pays off once the field behind it has something to show (point 2).

When judging a change here, measure rather than eyeball: page-wide field
spread, the left-vs-right difference between two cards in the same row,
and the top-edge lift in luminance levels.

## Dim text on a primary fill: name the fill, never a variant (2026-08-21)

`text-muted-foreground` is a grey tuned for the black field. Dropped
inside a filled `--primary` pill — a selected tab, an active chip — it
becomes mid-grey on light yellow, which is roughly invisible. That is what
happened to the count in "All portfolios 3", and `globals.css` has carried
a rule since then that re-resolves such text against
`--primary-foreground` so it stays a step quieter than the label beside it
without vanishing.

That rule shipped with two selectors:

```css
.bg-primary .text-muted-foreground,
[data-variant="default"] .text-muted-foreground { … }
```

The second one is the bug. `data-variant="default"` is not a primary fill
— it is the *default variant* of nine separate shadcn primitives, each of
which emits the attribute unconditionally: `Item`, `ItemMedia`, `Empty`,
`Field`, `Badge`, `Button`, `TabsList`, `ToggleGroup`, `DropdownMenuItem`.
Only `Badge` and `Button` actually paint `--primary` when default, and
both already carry a literal `bg-primary` class, so the first selector had
them covered. The other seven paint nothing, `bg-muted`, or the card — so
every piece of secondary text inside any of them resolved to
`--primary-foreground` (`oklch(0.145 0 0)`, near-black) at 65% alpha and
disappeared into the black field.

Measured in Chromium against the compiled bundle, before and after:

| Element | Before | After |
|---|---|---|
| Leaderboard rank number (inside `ItemMedia`) | `oklch(0.145 0 0 / 0.65)` | `oklch(0.708 0 0)` |
| "(you)" tag (inside `ItemTitle`) | `oklch(0.145 0 0 / 0.65)` | `oklch(0.708 0 0)` |
| `DropdownMenuShortcut` | `oklch(0.145 0 0 / 0.65)` | `oklch(0.708 0 0)` |
| `Empty` state copy | `oklch(0.145 0 0 / 0.65)` | `oklch(0.708 0 0)` |
| Count inside a default `Badge` | `oklch(0.145 0 0 / 0.65)` | `oklch(0.145 0 0 / 0.65)` |

The last row is the case the rule exists for, and it is unchanged. The
first four are 21 files' worth of collateral — the community leaderboard,
Account, the holding modal, Pulse, Forecast, the watchlist strip, the
ticker drawer, snapshots, invites, onboarding, and the rest.

**Rule: this selector may only ever name a fill.** If a future call site
paints `--primary` some other way (a `data-active:bg-primary` variant, an
inline style), give that element the plain `bg-primary` class too rather
than widening the selector back out to a variant name.

### Same pass: the leaderboard medals

Rank 3 in the community "Today" list was drawing its medal in
`text-caution` — i.e. `--warning`, the true orange this file reserves for
"caution/warning states only … don't reach for it decoratively." A
leaderboard row is not an alert, and third place lit up louder than first.
Gold/silver/bronze is not a palette this app has, so the three medals are
now one accent stepping down in strength — `text-primary`,
`text-primary/65`, `text-primary/40` — which reads as rank without
borrowing a semantic colour. (Rank 2's medal was previously
`text-muted-foreground`, so it was also a casualty of the selector bug
above and rendered near-black.)


## Ambient counter-lobe (`--ambient-cool`, 2026-08-21)

The `.page-frame` glow was one warm colour: a `--primary` key light off the
top-left at 52%, and a `--primary` counter-lobe off the bottom-right at 14%,
both sized in fixed pixels. Martin asked for the bottom-right to carry a
different, complementary hue, and for the whole thing to stay subtle — a
diagonal warm-to-cool read with genuine black in between, on phones as well
as desktops.

### The hue

`--ambient-cool: oklch(0.72 0.13 250)` — blue.

**Why 250 and not a teal.** Hue 250 is 160° from `--primary`'s 90 — all but the
last twenty degrees of the opponent contrast available. That matters for a
reason beyond arithmetic: colour leaves the retina encoded on two opponent
channels, and blue–yellow is one of them, so this pair is opposite *in the
visual system* rather than merely on a diagram. It is the most contrast the
eye can register per unit of colour spent, which is exactly what a wash this
faint needs.

It also clears every hue this palette has already spent — 88° from `--gain`
(162), 205° from `--warning` (45), 234° from `--loss` (16). **That margin is
the point, not a bonus.** The first version of this was a teal at hue 200,
picked while a blanket ban on violet stopped the search short of the
complement. Teal sits 38° from the emerald that means a position went up,
which is the one collision a money app cannot afford. The ban was lifted on
2026-08-21 and the hue moved with it.

Lightness 0.72 / chroma 0.13 is where hue 250 stays in sRGB with headroom.
Verified in-gamut by rasterising to a canvas: `rgb(96,170,243)`, no channel
pinned at 0 or 255.

**The two lobe alphas differ on purpose** — 28% warm, 31% cool. sRGB is not
symmetrical: its blue primary carries roughly a fourteenth of the luminance
of its green, so the cool side has far less headroom at a given lightness.
The two lobes are matched by *measurement*, not by being written the same
number. Measured bottom-right luminance is 33.8 against the warm lobe's
neighbourhood, and the old teal needed only 25% for the same result.
**Changing the cool hue means re-solving this alpha**, or the corner silently
gets brighter or dimmer than the one opposite it.

Alternatives considered, all rendered in the real stylesheet and matched to
the same measured brightness before comparing — which matters, because an
equal-alpha lineup flatters warm hues for gamut reasons that have nothing to
do with the choice:

| Hue | OKLCH | Alpha to match | ° from gold | ° from gain | Verdict |
|---|---|---|---|---|---|
| Teal 200 | `0.78 0.10 200` | 27% | 110 | **38** | Prettiest at the least alpha; too near `--gain` |
| Cyan 220 | `0.80 0.11 220` | 27% | 130 | 58 | Holds up best in a dark room (nearest the rod peak) |
| **Blue 250** | `0.72 0.13 250` | **31%** | **160** | **88** | **Chosen** |
| Violet 270 | `0.66 0.15 270` | 36% | 180 | 108 | The literal complement; reads purple, needs the most alpha |
| Indigo 285 | `0.64 0.16 285` | 37% | 165 | 123 | Starts reading as a brand colour rather than as light |
| Orchid 310 | `0.68 0.16 310` | 35% | 140 | 148 | Furthest from every semantic hue, and the most dated |

Violet at 270 is the literal opposite and remains defensible; 250 was taken
because it keeps nearly all of that contrast while staying on the blue side
of purple, needs less alpha to be felt, and reads as night and distance
rather than as a colour someone picked.

### The geometry: small corner lobes, sized in viewport units

Key light `95vw 58vh at -6% -8%`; counter-lobe `95vw 58vh at 106% 108%`. Each
falls through three stops — 28% → 12% → 4% → transparent for the warm one,
25% → 11% → 4% → transparent for the teal.

Three things are load-bearing here, and all three are measurable.

**The black between them is the design.** It is what separates the two lights
and keeps them reading as corners of a dark room rather than as a tint laid
over the page. About three quarters of the field measures under 2/255.

**`vw`/`vh`, not `px` — this is the mobile fix.** At a fixed 1250×1000 the
lobe was wider than a phone, so both lights flooded the screen and stacked
into horizontal bands. On a 390×844 viewport the *old* key light left the
top-right corner at 58/255 and the page middle at 29/255: no black anywhere,
and no diagonal. Sizing against the viewport holds the same proportion at
every width, so the corner-to-corner read survives on a phone. The test for
"is it diagonal" is the other two corners — top-right and bottom-left must
both measure 0.

**Anchored just off-screen.** At `-6% -8%` and `106% 108%` the brightest point
of each lobe sits outside the frame and only its falloff is visible. Anchored
exactly on the corner, the hottest pixel is in frame and reads as a lamp
rather than as spill.

**Three stops, not two.** A single colour-to-transparent ramp has a visible
edge — the lobe reads as a shape sitting on the page rather than as light.
Spending most of the falloff in the very dim end (28 → 12 → 4 → 0) thins the
light into the black with no boundary anywhere. Peaks and black area measure
the same either way, so this buys nothing but the look, which is the point.

Measured in headless Chromium against the compiled stylesheet, at 1440×900
with a three-card row and at 390×844 with a single column:

| | Original | Overshoot | Now |
|---|---|---|---|
| Top-left peak | 94 | 111 | **40** |
| Bottom-right peak | 28 (warm) | 68 | **34** (blue, by luminance) |
| Top-right / bottom-left, desktop | 0 / 0 | 7 / 0 | **0 / 0** |
| Top-right / bottom-left, **phone** | 58 / 17 | 88 / 53 | **0 / 0** |
| Page middle, phone | 28.9 | 74.1 | **0** |
| Field under 2/255, desktop | 36.4% | 0.6% | **68.3%** |

The "Overshoot" column is a real pass that shipped to a preview and was wrong:
1700px lobes at 60%/34%, chasing coverage on the theory that an unlit corner
gives the glass nothing to refract. It lit 99% of the field and left no black
at all, which is the opposite of the brief. Recorded here because brightening
this is the easy mistake and the metric that catches it is the share of field
under 2/255, not how good a single screenshot looks.

Verified at 1440x900, 1280x800, 834x1112 and 390x844: the peaks hold at 40 /
34-36, the opposite corners stay at 0, the middle stays at 0, and the black
share stays 66-68% at every one. That consistency is the whole reason for
sizing in viewport units.

Contrast was re-checked after dimming, since ambient light sits behind text:
muted text on glass in the hottest corner measures 8.19-8.81 across those
sizes -- better than the 7.92 this had originally, and well clear of AAA.


## The mark (2026-08-23)

One solid gold **A** — a peak — drawn from `src/lib/brand/mark.ts` and nowhere
else. It replaced a mosaic of ten bevelled facets, which was a late-2010s
idiom and, more concretely, unreadable small: nine hairlines between ten
triangles are a pixel of mud at 32px, so the favicon read as a gold smudge.

The full account — geometry, the single warm ramp, the icon plate, the Apple
rules the old icons broke, and how to regenerate every asset — is in
[`docs/BRAND_MARK.md`](docs/BRAND_MARK.md). Two things worth knowing from
here:

- **The colour is the accent's own.** The ramp runs L 0.94 to L 0.66 at
  `--primary`'s hue. It stops there because gold only reads as gold while it
  is light; taken lower it lands on khaki, which is the same reason the warm
  accent is never a dark tint (see "The warm accent cannot be a dark tint").
- **Square icons carry no corner radius.** iOS draws its own squircle, so a
  pre-rounded file gets rounded twice and shows a thin dark crescent inside
  each corner. Only the shapes nothing masks — favicons, PWA `any` — keep
  their own corners.

## Two typefaces, split by job (2026-08-21)

`--font-sans`, `--font-heading` and `--font-logo` all pointed at Geist, which
made the three tokens decorative — the `font-heading` utility was on about
twenty call sites and did nothing. They now divide real work:

| Token | Face | Carries |
|---|---|---|
| `--font-sans` | Geist | Every sentence. Unchanged. |
| `--font-mono` | Geist Mono | Every figure, percentage and share count. Unchanged. |
| `--font-heading` | **Archivo** | Headings, panel titles, ticker cells. |
| `--font-logo` | **Archivo** | The wordmark. |

**Why Archivo.** `font-heading` lands anywhere from a 14px ticker cell to a
24px hero, so a face with display-only proportions would fall apart at the
small end; Archivo is a grotesque built to hold across sizes. Against Geist's
rounder, wider neo-grotesque it reads tighter and more set — enough
separation to be a pair, not enough to look like two unrelated fonts on one
page. Loaded through `next/font`, which registers it under its real family
name and generates `Archivo Fallback` with metric overrides, so the swap
costs no layout shift. Verified against `document.fonts` in the running app
rather than assumed.

**One latent bug fixed with it.** The `h1…h4` element rule named
`--font-sans` while every deliberate heading call site used the
`font-heading` utility. With both tokens on Geist nothing gave the mismatch
away; a bare `<h2>` and a `<h2 class="font-heading">` would have rendered in
different faces the moment they diverged. The element rule now names
`--font-heading`.

**Tracking is a scale, not a constant.** It was a flat `-0.025em` at every
level. Letterfit is optical — the spacing that reads right at 14px reads
loose at 24px, because tracking is a fraction of the em and the gaps grow
with the type. Now `-0.035em` at h1, `-0.028em` at h2, `-0.02em` below, with
`PanelHeader` matching at its two sizes. `text-wrap: balance` on headings
stops a two-line title leaving one orphan word on the second line.

**What was tried and dropped.** A mono uppercase eyebrow label above panel
titles (`TODAY · CIRCLE`) was built and then removed. It looked good, but
every candidate placement repeated what the heading or the dock already
said — the Pulse panel sits on a page the dock labels "Pulse", and the
Compound results sit beside a panel titled "Growth calculator". Structure
should encode something true about the content; this encoded nothing, so it
was decoration. Worth revisiting only if a surface appears where a reader
landing mid-page genuinely cannot tell what section they are in.


## Chrome and field: the current numbers

The chrome is **one pane** — `.chrome-pane` on a single wrapper in
`AppHeader`, with every row inside it: the desktop header row, the phone top
bar, and the market strip both share. A `backdrop-filter` opens its own
sampling root, so two stacked elements each blurring 40px of what sits
behind them average different slices and land at different tones, with a
seam on the line where they meet. Desktop was merged for that reason; the
phone kept its top bar as a sibling above the pane, with an identical fill
and blur of its own, and carried the same seam until that row moved inside
too (`MobileBarRow`). **If another row ever joins the chrome, put it inside
the pane rather than beside it** — a row hides itself at the breakpoint it
does not belong to, and the pane never does. `MobileTopBar` is now a bare
row: give it a background or a blur again and the seam comes back.

`.chrome-pane` is the same material as a card — `blur(40px) saturate(1.9)`,
matching `.glass`. Without the saturation the chrome was the one translucent
surface in the app that drained the ambient colour passing under it instead
of carrying it.

Its refraction is a **`background-image` gradient**, not the inset
`box-shadow` that `.card-sheen.glass` uses, and this is the one place that
inverts the usual rule. The chrome is a band of arbitrary height — 85px on
desktop, 92px plus the safe-area inset on a phone — and a shadow spread is a
fixed pixel distance, so it would hug the top edge on one and wash half the
band on the other. A percentage gradient is height-relative and glides
across the whole band either way. Cards use shadows because `.veil-hover`
paints into `background-image` and would wipe a gradient; nothing in the
chrome hovers, so there is no paint to lose.

The fill is `--background` at 35%. `--background` is pure black, so it is a
black veil and its alpha is exactly how much of the field the chrome eats —
at `/95` the dock was effectively opaque and clipped the glow at a hard
edge. **The blur carries legibility, not the opacity.** Header text measures
18.5 contrast against it, so do not raise it back toward opaque to "fix"
contrast without measuring first. The dock keeps its own `bg-background/35`
+ `backdrop-blur-2xl`, since it is a floating card rather than a band.

The only edge the chrome carries is the one at its bottom, where it meets
the page; the market strip draws it.

There is one `<AppStatusStrip>` instance, deliberately: it holds a
one-second interval and polls quotes, so rendering it per breakpoint would
run two of each.

`PAGE_CHROME_SPACER_CLASS` reserves **85px, not 84** — the status strip's
`border-b` is part of the chrome's height. It is written as
`calc(5.25rem_+_1px)` so the arithmetic is visible, and written out
literally rather than composed from a constant, because Tailwind extracts
classes by scanning source text and a template literal yields a class that
never gets a rule.

### The field, measured

Field alone — the frame's children and the chrome hidden, and the scrollbar
gutter excluded, because that gutter is compositor paint and sampling it
reports a false black corner.

| | Desktop 1440×900 | Phone 390×844 |
|---|---|---|
| Top-left peak (warm) | **43** | **77** |
| Bottom-right peak (blue) | **55** | **99** |
| Top-right / bottom-left | 5 / 6 | 3 / 4 |
| Page middle | **7** | **1** |

The desktop corners come out identical at any width, which is the check that
sizing the lobes in `vw`/`vh` is doing its job. The phone column is a
different lamp — see "The phone is its own room".

**The black-share metric is finished.** It was the honest guard through
three widenings, and at this reach it reads 0.1% while the page still looks
like a dark room. What carries that read is the middle against the lit
corners, with the two opposite corners holding the diagonal. Judge a change
on those three. Brightness and coverage are separate dials and they fail the
same way; the failure mode is *alpha* — 60%/34% once put the middle at 32
and the corners at 111.

### Balancing the two lobes: H-K, not luminance

The two corners were matched by *measurement* for a long time and still
read wrong — the warm corner looked muted next to the blue. The
measurement was the problem, not the eye.

Three metrics, three different answers for the same pair of corners:

| | phone warm | phone cool | verdict |
|---|---|---|---|
| Brightest channel | 77 | 99 | cool much brighter |
| Relative luminance Y | 5.89 | 5.59 | **near parity** |
| CIE L\* | 29.14 | 28.35 | **near parity** |
| L\*\* (H-K corrected) | 32.51 | **38.72** | cool **+19%** |

Luminance and L\* both said the pair was balanced, which is why the old
numbers looked right on paper. What they miss is the
**Helmholtz–Kohlrausch effect**: a saturated colour appears brighter than
an achromatic one of the same luminance, and the size of that lift depends
on hue. It is near its *maximum* around blue and near its *minimum* around
yellow — so the blue lobe punches well above its luminance and the warm
one does not.

The correction used here is Fairchild & Pirrotta (1991):

    L** = L* + (2.5 − 0.025·L*) · (0.116·|sin((h_uv − 90°)/2)| + 0.085) · C*_uv

The `|sin((h − 90)/2)|` term is exactly the hue asymmetry: zero at yellow
(h = 90°), largest near blue. Our lobes sit at h_uv 68° and 245°, and the
blue also carries far more chroma (C\*_uv 29.2 vs 17.7), so it wins twice.

Both ramps were scaled to bring L\*\* to parity, with `k_warm · k_cool = 1`
so the total light in the frame is unchanged and only the *split* moves:

| | warm | cool |
|---|---|---|
| Desktop | 28% → **29.9%** | 31% → **29%** |
| Phone | 60% → **65.5%** | 66% → **60.4%** |

Measured after, field alone: phone warm `rgb(85,75,48)` L\*\* 35.87 against
cool `rgb(35,61,87)` L\*\* 34.08 — the key light now sits **5% above** the
bounce instead of 19% below it. Desktop lands at parity (−0.8%). The
middle and the two opposite corners did not move: 1/255 and 2–4 on a
phone, so the black between the corners is exactly as it was.

Note the alphas now read *warm above cool*, inverting the old pair. That
is not a mistake to "correct" later: the old ratio compensated for sRGB
blue's low luminance, and H-K more than reverses that compensation.
**Balance this on L\*\*. Brightest channel is meaningless here and
luminance is not what the eye reports.**

### The Margus button clears the dock

`CcAdvisorChat`'s FAB carried a flat `lg:bottom-8` while the dock is `fixed
bottom-0` at every width, so on desktop it sat *underneath* the dock: the
dock's blur smeared its warm fill across the corner as a yellow haze, and
clicks in that corner hit the dock, making Margus unreachable. Both were
hidden while the dock was near-opaque. Anchor to `--dock-pad`, the live
measured dock height — never a flat offset. The consent banner needs the
same clearance.

## Glass is three specular terms, and nothing in the app is flat

The edge sells glass on a near-black field, far more than the blur does —
but an edge alone gives you an evenly tinted rectangle with a bright line
on top. Real glass has a gradient: light enters the top and dies out
downward. So `.glass` and `.glass-well` carry three terms:

1. a bright hairline along the top, where the pane catches the light;
2. **a soft inset falloff hugging that top edge** — this is the refraction,
   and it is what was missing;
3. a fainter hairline along the bottom, where light wraps under.

Term 2 is an inset `box-shadow`, not a `background-image` gradient, and
that is deliberate: `.veil-hover` paints its hover into `background-image`,
so a gradient there would be wiped out on hover. Shadows compose in one
list and survive it.

**Nothing that is a surface may be a flat fill.** `bg-muted` as a container
background reads as a hole punched in the field next to a glass card beside
it. Every one of those is now `card-sheen glass-well`, including the shared
primitives that were quietly spreading it: `Card`'s tones, `TabsList`,
`Item`'s muted variant, and the `Segmented` track.

The exceptions, which stay opaque on purpose: **meter tracks**
(`rounded-full bg-muted` — a translucent 4px progress bar is pointless),
**data cells** (the seasonality heatmap, correlation grid), **skeletons**,
**step indicators**, and `focus:bg-muted` on inline-edit cells, which needs
an opaque fill to read as focused.

### A panel spaces its own children — call sites must not

`Panel` is `flex flex-col gap-5 p-4 sm:gap-6 sm:p-6`. Every direct child is
already 20/24px from the next one, so a child that also carries `mt-3`,
`mt-4` or `mb-4` gets **both**: measured on Lab, a subtitle sat 30px under
its own title and 40px above the bar it introduced, which is what the
"huge dead gap" in that card was. Fifteen call sites across Lab, Growth and
Fund did it.

Two rules come out of it:

- **A title and its subtitle are one child**, not two. As siblings the
  panel gap pushes them a full step apart, and the call site then reaches
  for a negative-feeling `mt-1.5` to pull them back. Wrap them, and let
  `mt-1.5` hug inside the wrapper.
- **A component never carries its own outer margin.** `SwatchLegend` had an
  `mt-3` baked in, and every one of its three call sites added `mt-4` on
  top because that still was not what the container wanted. Spacing is the
  container's job: inside a `Panel` the panel gap does it; inside a
  hand-spaced section the call site says `mt-4` and means it.

Auditable at runtime: any element whose parent is a column (or grid) with a
non-zero `row-gap` and which has a positive `margin-top`/`margin-bottom` is
paying twice. Negative pull-ups and `margin: auto` (see `Score`) are the
deliberate exceptions, along with a `Separator`, which wants more air than
the gap around a rule.

### Overlays are glass too, at a much heavier fill

Menus, selects, popovers, dialogs, sheets and drawers are `.glass-overlay`.
They were the last flat family in the app: an opaque `bg-popover` slab
dropped onto a page of refractive surfaces reads as a grey rectangle pasted
over it rather than a pane held above it.

They are also the one family that sits **over** content rather than in the
field, so the fill is far heavier than a card's — `--popover` at **88%**,
against a card's 45%. A menu has to stay readable over a table, a chart or a
run of figures, and the blur alone does not get you there: an element with
`backdrop-filter` does not smear content painted by *another* element that
has one, so a menu opening under the chrome sees the market strip
unblurred. Stepped through 70 / 78 / 88 / 96% against exactly that case,
88% is where the ghost of the numbers behind stops competing with the menu's
own labels while the pane still carries the ambient wash.

Fill and blur only — no `box-shadow`. Every call site already carries its
own `border`, `ring-1` and `shadow-md`/`shadow-lg`, and `box-shadow` is
atomic, so a shadow in the utility would race Tailwind's `shadow-*` inside
the same layer. The top specular is a `background-image` for the same
reason it is on `.chrome-pane`; no overlay hovers, so there is no veil to
wipe it.

`Command` carries no fill of its own: it always renders inside a
`CommandDialog`, and the `DialogContent` around it is the pane. An opaque
fill there painted a grey slab across the inside of a translucent dialog.

`Segmented` follows the same language as the glass cards: the track is a
well and an unselected item is glass. The **selected** one is the filled
`--primary` pill, the same "you are here" the dock's active cell paints.

### The accent cannot be a dark tint

The selected item used to be the `--selected` white veil with `--primary`
text, and it read flat. The reason is worth keeping, because it applies to
anything tempted to tint a surface with the brand colour:

**Yellow only reads as yellow while it is light.** A 26% white veil over a
near-black field lands on mid-grey; the ambient warm lobe pushes that to
khaki; and the app's `--primary` is a deliberately muted, low-chroma warm
yellow, so as *type* on khaki it is barely a contrast step. Rendered side
by side against the original, a warm veil at 18%, 30% and 45% were each
muddier than what they replaced — a dark yellow is olive, not gold. A
neutral veil with white type was clean but had no colour in it at all.

So the accent either arrives at **full lightness** — a fill, with
`--primary-foreground` type on it — or it stays out of the surface
entirely. There is no low-alpha middle.

### Where "selected" fills, and where it does not

| | Selected reads as | Why |
|---|---|---|
| Dock cell | filled `--primary` | The one destination you are on. |
| `Segmented` item | filled `--primary` | Framed by its own track, so it reads as the chosen one of a set, not as a loose button. |
| `WorkspaceSwitcher` room | `--selected` veil, `--foreground` type | The only one that does not fill: it sits in the header bar beside the page's real CTA, and two solid yellow controls there both shout "press me". |

The switcher's type is white rather than `--primary` for the reason above —
against siblings set in `--muted-foreground`, a raised surface plus
full-strength type says "here" clearly and stays clean.

The same rule decides **disabled**. `disabled:opacity-50` is right for every
button variant except the filled primary, where half of the accent over a
near-black field is khaki and the near-black label on top goes to a washed
brown — an empty form's "Check" read as a yellow button that had gone wrong
rather than one that is not ready yet. The `default` variant drops the
accent entirely when disabled (`bg-secondary`, `--muted-foreground` type,
`opacity-100` to undo the base) instead of dimming it.

## Label voice: mono caps, two tiers (2026-08-21)

Taken from the counter-lobe study page, which Martin asked to have applied to
the app. Two label tiers there, and the app already had surfaces for both.

**Tier one — scaffolding.** `MicroLabel`, and now every table column header.
Mono, uppercase, 11–12px, `tracking-[0.1em]`, `--muted-foreground`.

These were sentence-case sans at the same size and weight as the muted prose
beside them, so a label read as another line of copy rather than as the
structure it is. Column headers were worse: `text-foreground`, which made the
header row the loudest row in the table — the one row a reader never needs to
look at twice. Mono caps inverts that. The eye skips it when reading down a
column and finds it when scanning for one.

Tracking is `0.1em` because caps set at a face's normal tracking close up:
letterfit is drawn for mixed case, and caps have no descenders or ascenders to
open the rhythm.

Deliberately muted, not accent. This lands on eight-plus components including
four abreast in the dashboard figure row and every table header in the app;
an accent on all of them would spend the one brand colour on scaffolding.

**Tier two — annotation.** `NoteRows`, in `--primary`.

A short label in the gutter and the prose it introduces, in a
`7rem / 1fr` grid that collapses to one column on a phone. This is the tier
that gets the accent, because here the label does real work: it tells one
paragraph from another.

The first call site is the Pulse card, which stacked four paragraphs that mean
different things — Margus's reasoning, the reader's own note, an earnings
date, and the condition that would change the verdict — as four identical
grey blocks. One of them, `thesisBreak`, was already trying to label itself by
opening with the words "Breaks if". That is now the label.

`NoteRows` refuses to render as a list below two rows, and falls back to a
plain paragraph: a single labelled row is a label with nothing to distinguish
itself from. Labels are plain language — "BREAKS IF", never "INVALIDATION".


## The dock: one well, one cell per place (2026-08-21)

> *"in a way that doesnt assume that someone could have 6 sheets, usually
> they have 1, what if the whole bottom bar wasnt built around adding new
> sheets and became more uniform?"*

The desktop dock was two controls sharing a bar. On the left, a fixed
`42rem` well of app sections — icon-and-label chips in a rounded group. On
the right, taking every remaining pixel, a heading reading **Portfolios** over a
scrolling text rail of portfolio tabs, each with a 2px underline indicator,
an inline name field for creating one, and a `+ New` button.

Nothing about the two halves matched: different heights (48 vs 44), different
shapes (filled group vs bare rail), different active indicators (a filled
chip vs an underline), and a section label printed into the chrome that no
other control needed. And the split was sized for a case that almost never
happens. Measured on the running app at 1440px with an empty book:

| | Before | After |
|---|---|---|
| Dock height | 95px | **73px** |
| `--dock-pad` (page bottom clearance) | 127px | **105px** |
| Wells in the bar | 2 (672px + 464px, plus a 16px gap = the whole 1152px column) | **1 (640px)** |
| Width reserved for portfolios, with zero portfolios | **464px** (40% of the column) | **0** |

Now every destination is the same cell in the same well: the sections, then
one cell per portfolio, then Circle. One portfolio costs one cell. No
portfolios cost nothing.

### What each piece is doing

**Cells are `7.5rem`, and the well is `w-fit`, centred.** Sizing the row to
the full page column instead stretched five cells across 1152px, which left
each label floating in the middle of a 230px chip and turned the active one
into a slab of accent the width of a paragraph. Content-sized and centred,
the dock grows by exactly one cell when you add a portfolio.

**Portfolios carry a dot where sections carry a glyph.** Same 16px slot, so the
cells stay structurally identical, but a row of five identical wallet icons
would have been noise. The dot is the portfolio's direction today — emerald
`--gain`, rose `--loss`, `currentColor` at 40% when there is no quote yet —
so the slot pays for itself.

**Section labels are the phone's, not the desktop's.** Home, Pulse, Lab,
Growth, Circle. Spelling out "Overview" and "Compound" cost ~30px a cell for
no added meaning — the page header already names where you are — and it is
what pushed a four-portfolio row into truncating on a small laptop.

**`+` is a 2.5rem glyph cell, sitting with the portfolios it makes**, second to
last so Circle keeps the end. That replaces a labelled button *and* the
"Portfolios" heading *and* the inline name field: it now opens the same New
portfolio dialog the phone has always opened.

**The well is `.glass-well`, not `bg-muted`.** The dock sits over the
brightest part of the ambient field, and an opaque fill there was a hole
punched in the glow. Measured on the running app the well surface reads
`rgb(18,21,25)` — the blue lobe showing through — with foreground text at
**17.54** and muted at **7.09**, both above AAA. The mobile bar's well moved
to `.glass-well` with it, so both docks are the same material.

### No band behind it (2026-08-22)

The dock used to be a full-width bar — `bg-background/35`, `backdrop-blur-2xl`
and a `border-t` hairline — with the well sitting inside it. Two sheets of
glass stacked for one control, and the hairline drew a horizon line across the
ambient field for no reason.

Now the `nav` is a centring container with nothing in it, and the dock floats
over the page. Matching Arena's `BottomDock`, which is the same idea: the
`nav` is `fixed inset-x-0 bottom-0 flex justify-center` plus bottom padding,
and the pill carries the material.

| | Was | Now |
|---|---|---|
| `nav` | veil + blur + `border-t` | nothing, just centring |
| The pill | `.glass-well rounded-lg`, cells edge to edge | `.glass card-sheen rounded-xl p-1 gap-1 ring-1 ring-foreground/20`, cells `rounded-lg h-11` |
| Desktop dock height | 73px | **64px** |
| `--dock-pad` | 105px | **96px** |
| Phone bar height | 65px | 68px (it floats clear of the edge now) |

`.glass`, not `.glass-well`. The well is the *recessed* treatment; with
nothing around it, a recess reads as a hole. A pane floating over content
needs the raised one — sheen along the top edge, ring around it.

**Anything full-width and transparent over content needs
`pointer-events-none`.** The `nav` still spans the viewport; without it, every
click along the bottom of the page lands on an element that draws nothing. The
pill sets `pointer-events-auto` back. Verified with `elementFromPoint`: beside
the dock resolves to `main`, on a cell to the dock.

The pill's `p-1` and `gap-1` are width the cells do not get, so `PAD_PX` and
`GAP_PX` are part of the fold arithmetic in `dock-cells.ts`. At nine cells the
gaps alone come to a third of a cell — enough to push a row that "fits" into
truncating if they went uncounted.

### The width is fixed, and that is a rule with teeth

The well is `w-fit` and centred, so its width is the cell count times a
fixed cell width. That makes the **cell count** the thing that must not move
between pages: drop one cell and the whole bar resizes and re-centres, every
label sliding sideways under the cursor mid-navigation.

`hideAdd` was wired to `!onBook`, so the `+` cell vanished the moment you
left the book and a nine-cell row became eight — visible as a jump every
time you walked from a portfolio to Circle. It is account-level now
(`paperClassOnly`); paper-class accounts cannot open a real book, and that
is a fact about the account, not the route.

Measured on the two prop sets the Dashboard actually passes: left `213`,
width `1000`, 9 cells, identical labels on both. Only the highlight moves.

Route-dependent props that do *not* add or remove a cell — `activeId`, the
context-menu handlers — stay route-dependent on purpose. Guarding those too
would be a rule that isn't true. `src/lib/dock-stability.test.ts` holds the
line, and fails if a width-determining prop is wired to a route check again.

### Folding, and why it is measured rather than guessed

Two different things run out, and not at the same width:

- **Count.** Past `MAX_DOCK_CELLS` (9) the row outgrows the page column.
- **Width.** A row can fit the count and still squeeze every cell too narrow
  to read — 10 cells inside a 768px column is 74px each, and `Growth`
  truncates to `Grow…`.

So `dockFoldsSheets` (`src/lib/dock-cells.ts`) takes both, and the row
measures its own container with a `ResizeObserver` rather than reading a
breakpoint — what decides the fit is the column's width, which is the same
number at 1024px with a wide gutter as at 900px with a narrow one. Past
either limit the portfolios fold into one cell that opens a list, with
**New portfolio** at its foot.

Verified across viewports, with truncation checked per cell rather than by
eye (`scrollWidth > clientWidth`):

| Viewport | 1 portfolio | 4 portfolios | 6 portfolios |
|---|---|---|---|
| 768 | inline, 111px | **folded** | folded |
| 900 | inline, 120px | **folded** | folded |
| 1024 | inline, 120px | inline, 102px | folded |
| 1280+ | inline, 120px | inline, 120px | folded |

No section label truncates at any width in that table. `MIN_CELL_PX` (96) is
what guarantees it: `Growth` is the longest section label and measures ~90px
with its glyph, the 6px gap, and `px-2` either side.

**Before lowering `MAX_DOCK_CELLS` to make something fit, check it against a
real book.** The seed household has four portfolios, so a cap of 8 would
fold the dock for the person who asked for this.

## The phone is its own room (2026-08-22)

Everything above was measured on a desktop and then handed to the phone
unchanged. Most of it survived that; four things did not, and they compound
— which is why the report was a single one, "the yellow just bleeds into
everything and the blue doesn't stand out at all", rather than four.

### The lobes had reach and no peak

The ambient pair is sized in `vw`/`vh` precisely so it holds its proportion
at any width. That is the right instinct and it is what broke here: 170vw ×
112vh is a lobe far wider than a phone, so on a 390 × 844 field the page
middle sits about two thirds of the way along each ramp and *both* lights
reach it. The warm one washes over everything and the blue arrives at the
same middle from the other side and cancels into it. Neither corner reads
as a corner.

So below `md` the phone trades reach for peak — 130vw × 70vh, peaks up from
28%/31% to 60%/66%. Same ratio between the two (sRGB's blue primary carries
a fraction of the luminance of its green, so the cool side needs the extra
alpha to sit level), same five-stop falloff, same anchors just off the
corner.

Measured over black at 390 × 844, field alone with the frame's children
hidden:

| Sample | Desktop numbers on a phone | Phone numbers |
|---|---|---|
| top-left corner | 43 | **77** |
| bottom-right corner | 55 | **99** |
| top-right corner | ~0 | 3 |
| bottom-left corner | ~0 | 4 |
| page middle | 7 | **1** |

The middle is the number that matters. Corners nearly twice as bright *and*
a middle seven times darker is a wider spread, not a brighter page — which
is the whole difference between "lit from two corners" and "tinted".

The desktop note warns that 60%/34% was a failure once. It was, with 1700px
lobes: that lit 99% of the field and put the middle at 32. The peak was
never the problem. Reach was.

### The panes over it

On a phone the panels *are* the page — a card runs gutter to gutter, so
there is almost no bare field left for the corner lights to show up in. At
the desktop `.glass` fill (55%) the glow was visible only in the margins.
Below `md`: `.glass` 66%, `.glass-well` 74%, blur 40px → 30px (at that
opacity the extra radius buys nothing you can see and it is per-frame work
on the weakest GPU the app runs on), saturate up rather than down since the
colour getting through is the point.

A thinner fill is a weaker edge, and a card with no edge on a black field
stops being a card — so the border stroke goes to full `--border` and the
top specular a step brighter. On a phone the edge is doing even more of the
work than the desktop note describes.

### 24px of gutter on a 390px screen

`PAGE_GUTTER_CLASS` was a flat `px-6`. That is 48px of a phone's width gone
before any content starts, and it compounds with `PANEL_PAD` (another 48)
and `SCORE_CELL` (another 48) — a two-up score cell inside a panel had
about 118px to set a 24px mono figure in. Nine characters. `$1,822,306` is
ten.

All three step down one below `sm` (16px), and the figure styles step down
one size with them (`text-xl sm:text-2xl`). The page gutter now also
matches the phone chrome, which sits at 16px — the top bar's wordmark and
the dock had never lined up with the cards between them.

### Nothing may leave its box

`DISPLAY` carried `whitespace-nowrap`, so a figure that could not fit its
cell ran out through the side of the card and off the page — Circle's
"Modeled year" read as `23.0% a ye`. Wrapping is the honest answer at a
width you cannot control, so the figure styles wrap now, with `break-words`
under that as a backstop.

Wrapping is a fallback, not a plan. Where a value needs a unit, put the
number in the figure and the unit in the line below it — "23.0%" over "A
year, +8.3% vs an index fund", not "23.0% a year". And `Scoreboard` takes
`mobileCols={1}` for any row whose cells carry a sentence: two 123px
columns turn one line of explanation into eight.

### A size class on a heading now does something

`h1`–`h4` are styled by element rules in `globals.css`. Those rules used to
sit **outside any cascade layer**, and an un-layered declaration beats a
layered one whatever its specificity — while Tailwind emits `text-sm`,
`font-medium` and `tracking-tight` from `@layer utilities`. So every
typographic class written on a heading was silently discarded. Measured
before the fix: `<h3 class="text-sm font-medium tracking-tight">` computed to
16px / 600 / -0.02em; the same classes on a `<p>` worked.

**The fix is two halves, and only both together are safe.** Moving the block
into `@layer base` alone wakes 53 unreviewed call sites and most of them
*shrink* — `<h3 className="text-sm">` panel titles across Lab and Pulse drop
16px → 14px and stop reading as titles. So the same commit moved the block
**and** stripped the classes it woke, leaving every heading on the scale it
was already rendering at. Four shadcn primitives that render a real `<h2>`
(`DialogTitle`, `AlertDialogTitle`, `SheetTitle`, `DrawerTitle`) were pinned
the same way.

Verified by capturing computed size, line-height, weight, tracking, family
and wrap for all 214 headings across ten pages at two widths, before and
after. Two differ, both on purpose: `PanelHeader`'s `hero` branch (18px →
24px — an `<h2>` asking for the h1 step, which had never once got it), and
an `sr-only` `<h1>` picking up the `white-space: nowrap` that `sr-only`
always wanted.

`src/lib/heading-scale.test.ts` holds both halves: it fails if a heading
grows a typography class that disagrees with the scale, and if the rules
ever leave `@layer base`.

### Two spread rows, never two stacked columns

A Movers tile shows four things — ticker, percent, price, dollars — as
ticker/percent on one line and price/dollars on the next. Built as two
*columns* it reads identically and is wrong: columns share one width, and
here one was `shrink-0` while the other was `flex-1 min-w-0`, so the left
always gave. At 390px the tile is 157px, the percent column takes 85, and
`$640.80` was handed 32px of the 59 it needs — half a price, mid-digit, no
ellipsis. It clipped at every phone width tested.

As two *rows*, each line spreads its own two items with `justify-between`
and each sizes to its own content, so neither can starve the other.

**The general rule: when a small card has to fit two pairs of values, make
them rows.** Columns look the same until one value grows, and then one of
them silently loses.

Rows fix the starving but not the arithmetic. A phone tile has ~133px inside
its padding and the first row must hold a ticker chip and a percent: `p-3`
rather than `p-4`, a `text-xs` chip and a `text-base` percent buy it. The
last is what settled it — a minus sign is one more character, so `-2.32%`
needs 7px more than `9.23%`, and at `text-lg` that single glyph was the
difference between a tidy grid and every red tile wrapping while the green
ones did not. Both rows also `flex-wrap` as a floor.

#### The check that kept saying "clean"

Three passes of the layout audit reported this tile fine while a percent
ran 18px past its edge at the commonest phone width there is. The audit
looked for two things: an element wider than *its own* box
(`scrollWidth > clientWidth`), and an element outside the *viewport*. This
was neither. The percent's own box measured fine; it was simply drawn
outside an ancestor's `overflow: hidden`, and nothing in the chain noticed.

**Any audit of this kind needs the third check:** walk up to the nearest
clipping ancestor and compare edges against its padding box. Skip real
scrollers (`overflow-x: auto|scroll`), which are deliberate. That check is
what found this, and re-running it across every page and overlay at 320 /
360 / 390 found nothing else — which is the point of writing it down.

### A chip hangs, so its edge is what aligns

A fully-rounded chip only reaches its own box edge at one point — the
vertical middle. Above and below, the background curves away, so a chip whose
box is flush with the text below it *reads* as indented: the eye averages the
whole curve, not the single leftmost pixel. On a Movers tile the grey pill
and the `$23.56` under it were mathematically flush at the same x and still
looked out of line.

The compensation is the chip's mean left boundary. For a stadium of height h
the radius is r = h/2, the boundary at vertical offset y is
`x(y) = r − √(r² − y²)`, and its mean over the height is

    (1/2r) ∫[−r..r] (r − √(r² − y²)) dy  =  r(1 − π/4)

so pulling the chip back by `r(1 − π/4)` puts its *average* edge on the
text's edge — 2.575px for the `h-6` pill these call sites use. Same reason a
typeface overshoots its round letters past the baseline: equal measurement,
unequal appearance. Confirmed by eye at 4× against 0px and 6px: 0 sits
visibly right of the `$`, 6 visibly left.

`--chip-radius` defaults to the `h-6` case; a chip of another height sets it
(`[--chip-radius:0.625rem]` for `h-5`). It only holds for a *fully rounded*
chip, where r really is h/2.

Opt-in, never on `Badge` itself — a chip in a row of chips has no column to
align to. It puts a couple of pixels of background outside the container's
padding box, so a layout audit checking for that should skip `.chip-hang`.

### Every tap target, not just the buttons

Three earlier passes grew touch targets to the 44pt/48dp minimum and all
three searched for buttons. What they left behind:

| control | was | covered by |
|---|---|---|
| text / number fields | 326×32 | `input:not(...)` min-height |
| native `<select>` | 326×32 | `select` min-height |
| Radix select trigger | 110×32 | `[data-slot="select-trigger"]` |
| `<summary>` disclosure | 326×28 | `.touch-target` at the call site |

All on the same `(max-width: 1023px), (pointer: coarse)` gate as the button
rules, so a mouse keeps the dense control and no desktop pixel moves.

Two exclusions are load-bearing. **`.inline-edit`** is every editable cell
in the holdings and covered-call tables, whose rows are a fixed `h-10` by
design — a 44px minimum there would push every row taller and break the one
table rule that is written down. **Checkboxes, radios and ranges** are left
alone: `Checkbox` and `Switch` already carry an `after:-inset-*` hit area
and sit inside a clickable `<label>`, and widening the pseudo further would
have it reach into the rows above and below and start stealing their taps.

The summary is the interesting one. A global `summary { padding-block }`
looks right and does nothing useful: the one summary that needed fixing
sets its own `py-1`, so a *layered* rule loses to it — and an *un-layered*
rule would instead have beaten the two call sites already at `py-3`/`py-2.5`
and made those **shorter**. Either way the global rule moves the wrong
summaries. `.touch-target` at the one call site that needs it is the fix;
it sets `min-height`, which no call site names, and that summary is already
`flex items-center` so the label stays centred.

### Two bounces, one property

The phone top bar "kept going down" on a pull, and the floating tab bar cut
in half for a moment when you pushed past the end of a page. Those are the
same bug from opposite ends: WebKit translates the visual viewport during
an overscroll bounce and `fixed`/`sticky` elements ride along with it.
`overscroll-behavior-y: none` on `html, body` stops the document
overscrolling at all, and both bars stay welded to the viewport edges.
Scroll containers inside the page keep their own behaviour.
