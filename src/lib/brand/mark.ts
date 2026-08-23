/*
  The Upside Lab mark, as data rather than as a component.

  The same drawing is used four ways: as React in the app bar and the splash,
  as standalone SVGs in `public/`, as the plated icon compositions, and as the
  icon rasters. Keeping it in one place is what stops those drifting into four
  slightly different logos, and `scripts/generate-pwa-icons.mjs` imports this
  file directly rather than holding a second copy.

  What the mark is, and why, is in docs/BRAND_MARK.md. In short: one solid
  gold "A" — a peak. Your portfolio is a thing you hold on your own, so the
  mark is a single object.

  Related to Arena's mark by construction rather than by colour. Arena draws
  two peaks in aqua, because Arena is a game against people you know. Same
  family, different story.
*/

/*
  The letterform, on a 64 grid.

  A pointed apex, two feet on a shared baseline, and a crossbar. The bounds
  are x 8..56 and y 4.75..59.25 — 48 by 54.5, centred on the grid, so a plated
  composition can scale about (32, 32) without the drawing drifting off centre.

  This replaced a mosaic of ten bevelled facets on 2026-08-23. The facets were
  a decade-old idiom, and they had a concrete failure as well as a dated one:
  at 32px the hairlines between them were a pixel of mud and the whole mark
  read as a smudge. One solid mass reads at 16.
*/
export const APEX: [number, number] = [32, 4.75];
export const BASELINE = 59.25;

/** Where the outer edge of each foot lands. */
export const OUTER_FOOT = 24;
/** Where the inner edge of each foot lands: the leg is 11.5 wide at the base. */
export const INNER_FOOT = 12.5;
/** Where the counter's apex sits. Lower means a longer, thinner apex. */
export const INNER_APEX_Y = 24.75;

/** The crossbar, as a plain rectangle. Both ends are buried inside the legs. */
export const CROSSBAR = { x: 20.6, y: 34.75, width: 22.8, height: 8 } as const;

/** The drawing's own box, for a viewBox tight to the letter. */
export const MARK_BOX = {
  x: APEX[0] - OUTER_FOOT,
  y: APEX[1],
  width: OUTER_FOOT * 2,
  height: BASELINE - APEX[1],
} as const;

/** The tight viewBox, as the attribute string. */
export const MARK_VIEWBOX = `${MARK_BOX.x} ${MARK_BOX.y} ${MARK_BOX.width} ${MARK_BOX.height}`;

/** The letter's aspect, width over height. Lockups size the mark from this. */
export const MARK_ASPECT = MARK_BOX.width / MARK_BOX.height;

/** The outline: apex, right foot, back up the inside, down to the left foot. */
export function letterPath(): string {
  const [ax, ay] = APEX;
  return [
    `M ${ax} ${ay}`,
    `L ${ax + OUTER_FOOT} ${BASELINE}`,
    `L ${ax + INNER_FOOT} ${BASELINE}`,
    `L ${ax} ${INNER_APEX_Y}`,
    `L ${ax - INNER_FOOT} ${BASELINE}`,
    `L ${ax - OUTER_FOOT} ${BASELINE}`,
    "Z",
  ].join(" ");
}

/*
  One warm ramp, top-left to bottom-right, and one only.

  The mark used to carry ten of these, one per facet, all within a few points
  of each other — which is a lot of machinery to produce something a single
  gradient produces better. The stops are the accent's own hue: `--primary` is
  oklch(0.8 0.09 90), and these are two steps either side of it, L 0.94 down
  to L 0.66. Stated in sRGB because a raster pipeline and a mail client cannot
  do oklch.

  Gold has to stay light to read as gold. Taken much below L 0.66 it lands on
  khaki, which is the same reason `--primary` is never used as a dark tint.
  See DESIGN_TOKENS.md.
*/
export const MARK_GRADIENT = {
  id: "gold",
  x1: "10",
  y1: "4.75",
  x2: "54",
  y2: "59.25",
  from: "#f5ecc6",
  to: "#b58a41",
} as const;

/** The one flat gold, for the places that may not have a gradient at all. */
export const MARK_FLAT = "#d4bc79";

function gradientDef(): string {
  const g = MARK_GRADIENT;
  return (
    `<linearGradient id="${g.id}" x1="${g.x1}" y1="${g.y1}" x2="${g.x2}" y2="${g.y2}" gradientUnits="userSpaceOnUse">` +
    `<stop offset="0" stop-color="${g.from}"/><stop offset="1" stop-color="${g.to}"/></linearGradient>`
  );
}

function letterMarkup(fill: string): string {
  const bar = CROSSBAR;
  return (
    `<path d="${letterPath()}" fill="${fill}"/>` +
    `<rect x="${bar.x}" y="${bar.y}" width="${bar.width}" height="${bar.height}" fill="${fill}"/>`
  );
}

/** Scale the drawing about the centre of the 64 grid. */
function zoom(scale: number, inner: string): string {
  return `<g transform="translate(32 32) scale(${scale}) translate(-32 -32)">${inner}</g>`;
}

/**
 * The bare mark as a standalone SVG document, transparent and tight to the
 * letter. For `public/upside-mark.svg` and anywhere the drawing is needed
 * without a plate.
 */
export function upsideMarkSvg({
  height = 128,
  flat = false,
}: { height?: number; flat?: boolean } = {}): string {
  const width = Math.round(height * MARK_ASPECT);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${MARK_VIEWBOX}" width="${width}" height="${height}" role="img" aria-label="Upside Lab">` +
    (flat ? "" : `<defs>${gradientDef()}</defs>`) +
    letterMarkup(flat ? MARK_FLAT : `url(#${MARK_GRADIENT.id})`) +
    `</svg>`
  );
}

/*
  The plate the app icon is drawn on.

  Full-bleed, opaque, and lit the way the app is: the warm lobe behind the
  mark, the cool counter-lobe (`--ambient-cool`) in the far corner, over a
  field that runs a warm near-black to true black. An icon lit like the
  product is what makes the home screen and the app feel like one thing.
*/
export const PLATE = {
  field: ["#191309", "#000000"],
  glow: "#d4bc79",
  glowOpacity: 0.26,
  counter: "#60aaf3",
  counterOpacity: 0.1,
} as const;

/*
  How big the mark is drawn inside its plate, and how hard the plate's own
  corners are cut. One entry per place an icon is actually consumed, because
  each of them crops differently and a single safe area would be wrong for all
  of them.
*/
export const ICON_PRESETS = {
  /*
    iOS, iPadOS, macOS and the App Store listing. Square and full-bleed: the
    system draws the squircle, so the file must not. This is the one that was
    wrong before — every icon in this repo shipped with a 22.5 percent radius
    baked in, so iOS rounded an already-rounded icon and left a thin dark
    crescent inside each corner.
  */
  app: { radius: 0, glyph: 0.74 },
  /*
    Favicons, bookmark tiles and the PWA "any" icons. Nothing masks these, so
    the file carries its own rounded shape, and the mark can sit larger
    because nothing is going to crop it.
  */
  tile: { radius: 0.225, glyph: 0.82 },
  /*
    Android's adaptive icons. The launcher crops to a circle of 80 percent of
    the side, and on some it is closer to a squircle, so the mark is pulled
    well inside that circle rather than to its edge.
  */
  maskable: { radius: 0, glyph: 0.52 },
  /*
    The social avatar. Square file, and every network that shows it crops it
    to a circle, so it uses the same safe area as Android's.
  */
  avatar: { radius: 0, glyph: 0.56 },
} as const;

export type IconPreset = keyof typeof ICON_PRESETS;

/**
 * A plated icon as a standalone SVG document.
 *
 * The document stays on the 64 grid; `size` only sets its pixel dimensions,
 * and the rasteriser scales it.
 */
export function upsideIconSvg(preset: IconPreset, size: number): string {
  const { radius, glyph } = ICON_PRESETS[preset];
  const rx = radius > 0 ? ` rx="${(64 * radius).toFixed(2)}"` : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}" role="img" aria-label="Upside Lab">` +
    `<defs>` +
    `<radialGradient id="upside-field" cx="0.26" cy="0.14" r="1">` +
    `<stop offset="0" stop-color="${PLATE.field[0]}"/><stop offset="1" stop-color="${PLATE.field[1]}"/>` +
    `</radialGradient>` +
    `<radialGradient id="upside-glow" cx="0.5" cy="0.5" r="0.52">` +
    `<stop offset="0" stop-color="${PLATE.glow}" stop-opacity="${PLATE.glowOpacity}"/>` +
    `<stop offset="1" stop-color="${PLATE.glow}" stop-opacity="0"/>` +
    `</radialGradient>` +
    `<radialGradient id="upside-counter" cx="0.9" cy="0.94" r="0.62">` +
    `<stop offset="0" stop-color="${PLATE.counter}" stop-opacity="${PLATE.counterOpacity}"/>` +
    `<stop offset="1" stop-color="${PLATE.counter}" stop-opacity="0"/>` +
    `</radialGradient>` +
    gradientDef() +
    `</defs>` +
    `<rect width="64" height="64"${rx} fill="url(#upside-field)"/>` +
    `<rect width="64" height="64"${rx} fill="url(#upside-counter)"/>` +
    `<rect width="64" height="64"${rx} fill="url(#upside-glow)"/>` +
    zoom(glyph, letterMarkup(`url(#${MARK_GRADIENT.id})`)) +
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
    The mark sits on the type's baseline rather than centred on it. Both are
    flat-footed, so aligning the feet is what makes them look like one object;
    centring the boxes instead leaves the letter hanging below the words,
    which reads as a mark that slipped rather than as a lockup.

    Its height is roughly twice the type's cap height, the same ratio the
    in-app lockup uses (`MARK_SIZE` in UpsideLogo).
  */
  const baseline = 71;
  const height = 46;
  const width = height * MARK_ASPECT;
  const scale = height / MARK_BOX.height;
  const left = 24;
  const stack =
    "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 540 100" width="540" height="100" role="img" aria-label="Upside Lab">` +
    `<defs>${gradientDef()}</defs>` +
    (plate ? `<rect width="540" height="100" fill="#000000"/>` : "") +
    `<g transform="translate(${left} ${baseline - height}) scale(${scale.toFixed(4)}) translate(${-MARK_BOX.x} ${-MARK_BOX.y})">` +
    letterMarkup(`url(#${MARK_GRADIENT.id})`) +
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
 * nothing dynamic. It is drawn flat rather than with the gradient: a mail
 * client renders it at about 40px inside a circle, where a ramp is invisible,
 * and the narrower the feature set the fewer validators have an opinion.
 */
export function upsideBimiSvg(): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n` +
    `<svg version="1.2" baseProfile="tiny-ps" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">\n` +
    `  <title>Upside Lab</title>\n` +
    `  <rect x="0" y="0" width="64" height="64" fill="#000000"/>\n` +
    `  ` +
    zoom(ICON_PRESETS.avatar.glyph, letterMarkup(MARK_FLAT)) +
    `\n</svg>\n`
  );
}
