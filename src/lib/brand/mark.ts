/*
  The Upside Lab mark, as data rather than as a component.

  The same drawing is used four ways: as React in the app bar and the splash,
  as standalone SVGs in `public/`, as the plated icon compositions, and as the
  icon rasters. Keeping it in one place is what stops those drifting into four
  slightly different logos, and `scripts/generate-pwa-icons.mjs` imports this
  file directly rather than holding a second copy.

  What the mark is, and why, is in docs/BRAND_MARK.md. In short: a standing
  gold "A" cut into ten flat facets, lit from the upper right. Your portfolio
  is a thing you hold on your own, so the mark is a single object.

  Related to Arena's mark by construction rather than by colour. Arena draws
  two peaks in aqua, because Arena is a game against people you know. Same
  family, different story.
*/

export type ToneKey = "lit" | "face" | "edge" | "deep";

export type Facet = {
  /** Three points, in the 128 grid. */
  points: [number, number][];
  /** Which step of the light ramp it takes. */
  tone: ToneKey;
};

/*
  The facets, on the 128 grid the mark has always been drawn on.

  These are the original coordinates, **made exactly symmetric about x = 64**.
  They were traced rather than constructed, and the trace was up to 0.75 units
  out of true across a 105-unit-wide drawing — a visible lean at splash size,
  and a set of near-duplicate edges (56.43 against 56.53, 84.27 against 84.37)
  where one row of facets did not quite agree with itself about where it sat.
  Every mirror pair is now one offset from the centre line, applied to both
  sides, so the left and the right are the same drawing to the hundredth of a
  unit and the row edges line up. `scripts/test-invariants.ts` fails if any
  point loses its mirror.

  Nothing else about the composition moved. The silhouette, the proportions,
  the hairline gaps and which cells are filled are the mark as it was.
*/
export const MARK_FACETS: Facet[] = [
  // The apex, split down the centre line: the right half catches the light.
  { points: [[62.45, 20.27], [62.56, 56.43], [40.27, 56.53]], tone: "face" },
  { points: [[65.55, 20.27], [87.73, 56.53], [65.44, 56.43]], tone: "lit" },
  // Second band: two facets hanging either side of the counter, two standing.
  { points: [[40.64, 59.58], [62.77, 59.52], [52.0, 78.99]], tone: "edge" },
  { points: [[65.23, 59.52], [87.36, 59.58], [76.0, 78.99]], tone: "face" },
  { points: [[90.19, 60.54], [101.87, 80.32], [79.04, 80.32]], tone: "face" },
  { points: [[37.81, 60.54], [48.96, 80.32], [26.13, 80.32]], tone: "edge" },
  // Third band, the widest, and the one furthest from the light.
  { points: [[26.61, 83.41], [49.55, 83.41], [38.08, 103.2]], tone: "deep" },
  { points: [[78.45, 83.41], [101.39, 83.41], [89.92, 103.2]], tone: "edge" },
  { points: [[104.27, 84.32], [116.38, 104.64], [92.91, 104.64]], tone: "edge" },
  { points: [[23.73, 84.32], [35.09, 104.64], [11.62, 104.64]], tone: "deep" },
];

/*
  Two colourways, four steps each, and which one is right depends entirely on
  what the mark is sitting on.

  `MARK` is the app's: gold on the app's own true black, for the header
  lockup, the splash, the email header and the OG card. Four steps of one warm
  ramp running top-right to bottom-left, which is where the light comes from.
  The values are the original ten per-facet gradients, grouped -- no two of
  those were quite the same and several were within a point or two of each
  other, which is not a lighting model, it is ten hand-picked values.

  `ICON` is the home screen's, and it is the reverse. A near-black tile is the
  wrong instinct for an app icon: put one in a grid beside the icons people
  actually have and it reads as a hole rather than as an app. Every icon in
  that register is a saturated field with a simple mark on it, so Lab's icon
  is the warm accent as the *field*, with the facets in a deep espresso ink.
  The mark did not change -- same ten facets, same hairlines, same light
  direction -- the ground did.

  The light still comes from the upper right in both. A dark object lit from
  the upper right has its upper-right facets *lighter*, so `lit` stays the
  brightest step in the ink ramp too; it just means less contrast against the
  plate rather than more against the field.
*/
export type Ramp = { from: string; to: string };
export type Colourway = {
  /** The plate under it, top to bottom. Null for the transparent mark. */
  plate: [string, string] | null;
  tones: Record<ToneKey, Ramp>;
};

export const COLOURWAYS: Record<"MARK" | "ICON", Colourway> = {
  MARK: {
    plate: null,
    tones: {
      lit: { from: "#ead6ab", to: "#b29a6f" },
      face: { from: "#dfc59a", to: "#a6875d" },
      edge: { from: "#caac7a", to: "#8f6b3a" },
      deep: { from: "#b38e62", to: "#764b1f" },
    },
  },
  ICON: {
    plate: ["#f7e2b4", "#b8822c"],
    tones: {
      lit: { from: "#4a3512", to: "#2a1d08" },
      face: { from: "#3a2a0d", to: "#1f1506" },
      edge: { from: "#2a1d07", to: "#150e03" },
      deep: { from: "#1a1204", to: "#0b0701" },
    },
  },
};

/** The flat midpoints of the app colourway, for a place with no gradients. */
export const TONES_FLAT: Record<ToneKey, string> = {
  lit: "#d5bd8c",
  face: "#c4a67a",
  edge: "#b08c58",
  deep: "#95683e",
};

/** The app colourway's ramp, by tone. The name every caller already used. */
export const TONES = COLOURWAYS.MARK.tones;

export const TONE_KEYS = ["lit", "face", "edge", "deep"] as const;

/** Where the light comes from, in the 128 grid. Shared by every facet. */
export const LIGHT = { x1: 78, y1: 18, x2: 28, y2: 108 } as const;

/** The drawing's own box, for a viewBox tight to the mark. */
export const MARK_BOX = (() => {
  const xs = MARK_FACETS.flatMap((f) => f.points.map((p) => p[0]));
  const ys = MARK_FACETS.flatMap((f) => f.points.map((p) => p[1]));
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
})();

/** The tight viewBox, as the attribute string. */
export const MARK_VIEWBOX = `${MARK_BOX.x} ${MARK_BOX.y} ${MARK_BOX.width} ${MARK_BOX.height}`;

/** The mark's aspect, width over height — about 1.24. Lockups size from it. */
export const MARK_ASPECT = MARK_BOX.width / MARK_BOX.height;

/** The centre of the drawing, which is not the centre of the 128 grid. */
export const MARK_CENTRE: [number, number] = [
  MARK_BOX.x + MARK_BOX.width / 2,
  MARK_BOX.y + MARK_BOX.height / 2,
];

function centroid(facet: Facet): [number, number] {
  const [a, b, c] = facet.points;
  return [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3];
}

/*
  How much to swell each facet toward its own edges, given the size the mark
  will actually be drawn at.

  The hairlines between the facets are about 3.1 units on a 128 grid — a
  little under two and a half percent of the drawing's width. At 512px that is
  a crisp 12px cut and the whole point of the mark. At 32px it is three
  quarters of one pixel: anti-aliasing turns it to grey mud, and ten gold
  triangles read as one gold smudge. At 16px it is worse.

  So below 96px the facets are swelled about their own centroids until the
  gaps close, and the mark resolves into the solid standing "A" that was
  underneath the mosaic all along. It is the same drawing either way; what
  changes is how much of the cut a pixel can still carry.

  This is the mirror of Arena's `cutForSize`, which widens a hairline as its
  drawing shrinks, for exactly the same reason.
*/
export function facetScale(size: number): number {
  if (size >= 96) return 1;
  if (size >= 40) return 1.05;
  return 1.13;
}

/** The transform that swells a facet about its own centroid. */
export function facetTransform(facet: Facet, scale: number): string {
  const [cx, cy] = centroid(facet);
  return (
    `translate(${cx.toFixed(3)} ${cy.toFixed(3)}) scale(${scale}) ` +
    `translate(${(-cx).toFixed(3)} ${(-cy).toFixed(3)})`
  );
}

/** A facet's points, as the `points` attribute. */
export function facetPoints(facet: Facet): string {
  return facet.points.map(([x, y]) => `${x},${y}`).join(" ");
}

function gradientDefs(prefix: string, way: Colourway = COLOURWAYS.MARK): string {
  return TONE_KEYS.map((key) => {
    const tone = way.tones[key];
    return (
      `<linearGradient id="${prefix}${key}" x1="${LIGHT.x1}" y1="${LIGHT.y1}" x2="${LIGHT.x2}" y2="${LIGHT.y2}" gradientUnits="userSpaceOnUse">` +
      `<stop offset="0" stop-color="${tone.from}"/><stop offset="1" stop-color="${tone.to}"/></linearGradient>`
    );
  }).join("");
}

function facetsMarkup(size: number, fill: (tone: ToneKey) => string): string {
  const scale = facetScale(size);
  return MARK_FACETS.map(
    (facet) =>
      `<polygon points="${facetPoints(facet)}" fill="${fill(facet.tone)}"` +
      (scale === 1 ? "" : ` transform="${facetTransform(facet, scale)}"`) +
      `/>`
  ).join("");
}

/*
  How far to lift the drawing above the geometric centre of its plate, as a
  fraction of the plate.

  The mark is a triangular mass: nearly all of its area sits along the
  baseline and the apex is a point, so its perceived centre is well below the
  middle of its bounding box. Centred by the numbers, it reads as having
  sagged. Two and a half percent is enough to look centred and small enough
  that nothing measures as off.

  It applies to the plated icons only. The bare mark is placed by whatever is
  around it -- a flex row in the lockup, a host's own tile padding -- and a
  drawing that is secretly off-centre would fight all of them.
*/
const OPTICAL_LIFT = 0.02;

/** Scale the drawing about its own centre, then sit it in the middle of `box`. */
function place(scale: number, box: number, inner: string, lift = 0): string {
  const [cx, cy] = MARK_CENTRE;
  const dx = box / 2 - cx;
  const dy = box / 2 - cy - box * lift;
  return (
    `<g transform="translate(${dx.toFixed(3)} ${dy.toFixed(3)}) ` +
    `translate(${cx} ${cy}) scale(${scale.toFixed(5)}) translate(${-cx} ${-cy})">${inner}</g>`
  );
}

/**
 * The bare mark as a standalone SVG document, transparent and tight to the
 * drawing. For `public/upside-mark.svg` and anywhere it is needed unplated.
 */
export function upsideMarkSvg({
  height = 128,
  flat = false,
}: { height?: number; flat?: boolean } = {}): string {
  const width = Math.round(height * MARK_ASPECT);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${MARK_VIEWBOX}" width="${width}" height="${height}" role="img" aria-label="Upside Lab">` +
    (flat ? "" : `<defs>${gradientDefs("t-")}</defs>`) +
    facetsMarkup(height, (tone) => (flat ? TONES_FLAT[tone] : `url(#t-${tone})`)) +
    `</svg>`
  );
}

/** The icon canvas: the same 128 grid the mark is drawn on. */
export const ICON_BOX = 128;

/*
  How much of the canvas the mark's **width** takes, and how hard the plate's
  own corners are cut. One entry per place an icon is actually consumed,
  because each of them crops differently and a single safe area would be wrong
  for all of them.

  A fraction of the width rather than a raw scale factor, because the mark is
  a wide drawing and a scale factor says nothing about how close a foot lands
  to an edge.

  0.66 is not a compromise, it is the register. A centred symbol on an Apple
  icon runs between about half and two thirds of the tile -- Music's note is
  near 0.48, Messages' bubble near 0.64, Mail's envelope near 0.66 -- and the
  margin around it is doing as much work as the symbol. An earlier pass had
  this at 0.80 because bigger sounded better; in a grid beside real icons it
  read as crowded rather than as confident.
*/
export const ICON_PRESETS = {
  /*
    iOS, iPadOS, macOS and the App Store listing. Square and full-bleed: the
    system draws the squircle, so the file must not. This is the one that was
    wrong before — every icon in this repo shipped with a 22.5 percent radius
    baked in, so iOS rounded an already-rounded icon and left a thin dark
    crescent inside each corner.
  */
  app: { radius: 0, glyph: 0.66 },
  /*
    Favicons, bookmark tiles and the PWA "any" icons. Nothing masks these, so
    the file carries its own rounded shape, and the mark can sit larger
    because nothing is going to crop it.
  */
  tile: { radius: 0.225, glyph: 0.7 },
  /*
    Android's adaptive icons. The launcher crops to a circle of 80 percent of
    the side, and on some it is closer to a squircle, so the mark is pulled
    well inside that circle rather than to its edge.
  */
  maskable: { radius: 0, glyph: 0.55 },
  /*
    The social avatar. Square file, and every network that shows it crops it
    to a circle, so it uses the same safe area as Android's.
  */
  avatar: { radius: 0, glyph: 0.58 },
} as const;

export type IconPreset = keyof typeof ICON_PRESETS;

/** A preset's scale factor: what `glyph` means once the mark's width is known. */
export function presetScale(preset: IconPreset): number {
  return (ICON_BOX * ICON_PRESETS[preset].glyph) / MARK_BOX.width;
}

/**
 * A plated icon as a standalone SVG document.
 *
 * The document stays on the 128 grid; `size` sets its pixel dimensions and
 * decides how hard the facets are swelled, and the rasteriser scales it.
 */
export function upsideIconSvg(preset: IconPreset, size: number): string {
  const { radius, glyph } = ICON_PRESETS[preset];
  const way = COLOURWAYS.ICON;
  const plate = way.plate!;
  const rx = radius > 0 ? ` rx="${(ICON_BOX * radius).toFixed(2)}"` : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ICON_BOX} ${ICON_BOX}" width="${size}" height="${size}" role="img" aria-label="Upside Lab">` +
    `<defs>` +
    /*
      One linear gradient, top to bottom, and nothing else. This used to be a
      radial field with a warm lobe behind the mark and a cool counter-lobe in
      the far corner -- the app's own ambient lighting, moved onto a 128px
      tile where it read as a smudge. An icon plate is a flat colour with a
      gentle fall, the way every icon it will sit beside is.
    */
    `<linearGradient id="upside-plate" x1="0" y1="0" x2="0" y2="${ICON_BOX}" gradientUnits="userSpaceOnUse">` +
    `<stop offset="0" stop-color="${plate[0]}"/><stop offset="1" stop-color="${plate[1]}"/>` +
    `</linearGradient>` +
    gradientDefs("t-", way) +
    `</defs>` +
    `<rect width="${ICON_BOX}" height="${ICON_BOX}"${rx} fill="url(#upside-plate)"/>` +
    /*
      The facets are swelled from the size the mark itself lands at, not from
      the size of the file: a 512px maskable icon draws the mark 282px wide,
      and asking it for a 512px cut would leave a hairline nobody can see.
    */
    place(
      presetScale(preset),
      ICON_BOX,
      facetsMarkup(size * glyph, (tone) => `url(#t-${tone})`),
      OPTICAL_LIFT
    ) +
    `</svg>`
  );
}

/**
 * The horizontal lockup — mark, then UPSIDE LAB — as a standalone SVG.
 *
 * 540 by 100, which is the size the email header and the social banner have
 * always been. Set in whatever grotesque the reader has rather than in
 * Archivo: these are read by mail clients and by image viewers, neither of
 * which will load a webfont, so the stack falls back rather than pretending.
 */
export function upsideLockupSvg({ plate = true }: { plate?: boolean } = {}): string {
  /*
    The mark is centred on the type's cap band rather than stood on its
    baseline. The drawing is a triangle: its feet are its widest part and its
    apex is a point, so its optical centre sits well below its geometric one,
    and standing it on the baseline leaves it looking like it is sliding off
    the front of the words.

    Its height is roughly twice the type's cap height, the same ratio the
    in-app lockup uses (`MARK_SIZE` in UpsideLogo).
  */
  const baseline = 68;
  const capHeight = 24.5;
  const height = 48;
  const width = height * MARK_ASPECT;
  const scale = height / MARK_BOX.height;
  const left = 26;
  const top = baseline - capHeight / 2 - height / 2;
  const stack =
    "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 540 100" width="540" height="100" role="img" aria-label="Upside Lab">` +
    `<defs>${gradientDefs("t-")}</defs>` +
    (plate ? `<rect width="540" height="100" fill="#000000"/>` : "") +
    `<g transform="translate(${left} ${top.toFixed(2)}) scale(${scale.toFixed(4)}) translate(${-MARK_BOX.x} ${-MARK_BOX.y})">` +
    facetsMarkup(height, (tone) => `url(#t-${tone})`) +
    `</g>` +
    `<text x="${(left + width + 26).toFixed(1)}" y="${baseline}" font-family="${stack}" font-size="34" fill="#f4f1ea">` +
    `<tspan font-weight="700">UPSIDE</tspan><tspan font-weight="400" dx="10">LAB</tspan>` +
    `</text>` +
    `</svg>`
  );
}

/**
 * The BIMI mark: the logo a mail client draws next to a verified sender.
 *
 * Its own function because BIMI is its own profile — SVG Tiny 1.2 Portable /
 * Secure. Square, a `<title>`, `version` and `baseProfile` declared, and
 * nothing dynamic. It carries the **icon** colourway rather than the app's,
 * because what a reader sees next to a verified sender should be the same
 * thing they see on their home screen. One flat fill per facet rather than
 * the ramp: a mail client draws this at about 40px inside a circle, where
 * four gradients are invisible, and the narrower the feature set the fewer
 * validators have an opinion about it.
 */
export function upsideBimiSvg(): string {
  const way = COLOURWAYS.ICON;
  const plate = way.plate!;
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n` +
    `<svg version="1.2" baseProfile="tiny-ps" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ICON_BOX} ${ICON_BOX}" width="${ICON_BOX}" height="${ICON_BOX}">\n` +
    `  <title>Upside Lab</title>\n` +
    `  <linearGradient id="p" x1="0" y1="0" x2="0" y2="${ICON_BOX}" gradientUnits="userSpaceOnUse">` +
    `<stop offset="0" stop-color="${plate[0]}"/><stop offset="1" stop-color="${plate[1]}"/></linearGradient>\n` +
    `  <rect x="0" y="0" width="${ICON_BOX}" height="${ICON_BOX}" fill="url(#p)"/>\n  ` +
    place(
      presetScale("avatar"),
      ICON_BOX,
      facetsMarkup(40, (tone) => way.tones[tone].to),
      OPTICAL_LIFT
    ) +
    `\n</svg>\n`
  );
}
