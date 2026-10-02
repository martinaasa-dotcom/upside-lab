/*
  Renders the Upside Lab mark to every file the product ships: the favicons,
  the Apple touch icon, the Next.js file-convention icons, the PWA manifest
  icons, the App Store master, the BIMI mark, the social avatar, the email
  lockup and the OG card.

  Run with `npm run icons` after changing src/lib/brand/mark.ts.

  It used to rasterise a 172 KB PNG of the mark out of `Images/`, trim it, and
  scale it into place. That meant the icons could only ever be as good as a
  bitmap somebody exported once, every output carried the trim's guesswork,
  and the app's own inline logo was a separate drawing that had to be kept in
  step by hand. This draws from the same geometry the app draws from -- Node
  strips the types on import -- so there is exactly one mark.
*/
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

import {
  upsideBimiSvg,
  upsideIconSvg,
  upsideLockupSvg,
  upsideMarkSvg,
} from "../src/lib/brand/mark.ts";
import {
  OG_CARD_LINE,
  PRODUCT_HEADLINE,
} from "../src/lib/product.ts";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const pub = (...p) => path.join(root, "public", ...p);
const app = (...p) => path.join(root, "src", "app", ...p);

const written = [];
const note = (file) => written.push(path.relative(root, file));

/*
  Each icon SVG declares its own width and height in pixels, so at the default
  72 DPI the rasteriser draws it at exactly the target size. Asking for more
  and scaling back down is supersampling, and it is what keeps the long
  diagonals of the letter from stairstepping at favicon sizes.

  Four times over for the small icons, twice for the large ones: the App Store
  master is 1024px, and four times that is a 16-megapixel intermediate for no
  visible gain.
*/
const densityFor = (size) => 72 * (size <= 256 ? 4 : 2);

/** An opaque icon: no alpha channel at all, which is what Apple requires. */
async function opaque(preset, size, ...files) {
  const buf = await sharp(Buffer.from(upsideIconSvg(preset, size)), {
    density: densityFor(size),
  })
    .resize(size, size)
    .removeAlpha()
    .png()
    .toBuffer();
  for (const file of files) {
    await writeFile(file, buf);
    note(file);
  }
  return buf;
}

/** A shaped icon: keeps its alpha, because the rounded corners are its own. */
async function shaped(preset, size, ...files) {
  const buf = await sharp(Buffer.from(upsideIconSvg(preset, size)), {
    density: densityFor(size),
  })
    .resize(size, size)
    .png()
    .toBuffer();
  for (const file of files) {
    await writeFile(file, buf);
    note(file);
  }
  return buf;
}

async function text(file, contents) {
  await writeFile(file, contents);
  note(file);
}

/*
  PNG-in-ICO, so Chrome's habitual /favicon.ico request gets the mark. Two
  entries, 16 and 32: every browser in use picks the nearest, and the sizes
  above that are served as PNG and SVG by the <link rel="icon"> list.
*/
function packIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  const table = Buffer.alloc(16 * entries.length);
  let offset = 6 + 16 * entries.length;
  entries.forEach((entry, i) => {
    const at = i * 16;
    table.writeUInt8(entry.size >= 256 ? 0 : entry.size, at);
    table.writeUInt8(entry.size >= 256 ? 0 : entry.size, at + 1);
    table.writeUInt16LE(1, at + 4);
    table.writeUInt16LE(32, at + 6);
    table.writeUInt32LE(entry.data.length, at + 8);
    table.writeUInt32LE(offset, at + 12);
    offset += entry.data.length;
  });
  return Buffer.concat([header, table, ...entries.map((e) => e.data)]);
}

/*
  The social card is product chrome rather than the mark, so it is composed
  here. Its ambient field follows the app: the warm lobe top-left, the cool
  counter-lobe bottom-right.

  WHAT IT SAYS (2026-10-02). It used to read "Your whole portfolio, in plain
  words. And when it falls, what actually changed." over the lockup, which
  sold the product on the falls, the way the landing page did until the same
  day. It carries the landing's own headline now, "Every move, explained.",
  with the last word in the brand gold exactly as the hero sets it, and the
  idea the landing's film plays drawn beside it as a still: chips in a knot
  around the market's line, and one gold chip off on its own news.

  THE CHIPS CARRY NO NAMES AND NO FIGURES, on purpose. On the landing the
  film is labelled as a made-up week; a card pasted into a chat has no such
  label around it, so a picture reading "$NVDA +6.2%, its own news" would be
  read as a claim about a real company on a real day. The shape alone is the
  lesson, and the two labels on it say which is which.

  Set in Archivo and Geist when the machine running this has them (they are
  the site's own faces), and in whatever grotesque it does have when it does
  not. The card is rasterised outside the browser, so a webfont is not on
  offer; install the two families locally before running this if the card
  is meant to match the site.
*/
const SANS =
  "Archivo SemiBold, Archivo, Geist, ui-sans-serif, system-ui, -apple-system, Helvetica, Arial, sans-serif";
const BODY = "Geist, ui-sans-serif, system-ui, -apple-system, Helvetica, Arial, sans-serif";
const MONO = "Geist Mono, ui-monospace, Menlo, Consolas, monospace";
const GOLD = "#d4bc79";

/* The headline's last word is the gold one, the way the landing sets it. */
const [OG_LEAD, OG_GOLD] = (() => {
  const line = PRODUCT_HEADLINE[0];
  const cut = line.lastIndexOf(" ");
  return cut > 0 ? [line.slice(0, cut), line.slice(cut + 1)] : [line, ""];
})();

/*
  The still: a card on the right holding the film's picture. Positions are
  laid out here by hand because this is a drawing rather than data, and
  nothing on it is a figure.
*/
const CARD = { x: 744, y: 136, w: 372, h: 356 };
const TRACK_Y = CARD.y + 282;
const MARKET_X = CARD.x + 128;
const chip = (cx, cy, standout = false) => {
  const w = standout ? 104 : 98;
  const h = 32;
  const x = cx - w / 2;
  const y = cy - h / 2;
  const halo = standout
    ? `<rect x="${x - 7}" y="${y - 7}" width="${w + 14}" height="${h + 14}" rx="${(h + 14) / 2}" fill="none" stroke="${GOLD}" stroke-opacity="0.38"/>
    <rect x="${x - 15}" y="${y - 15}" width="${w + 30}" height="${h + 30}" rx="${(h + 30) / 2}" fill="none" stroke="${GOLD}" stroke-opacity="0.14"/>`
    : "";
  return `${halo}
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="#141414" stroke="${standout ? GOLD : "#ffffff"}" stroke-opacity="${standout ? 0.95 : 0.22}" stroke-width="${standout ? 1.6 : 1}"/>
    <circle cx="${x + 17}" cy="${cy}" r="5" fill="${standout ? GOLD : "#7a7a7a"}"/>
    <rect x="${x + 30}" y="${cy - 3}" width="${w - 48}" height="6" rx="3" fill="${standout ? GOLD : "#ffffff"}" fill-opacity="${standout ? 0.55 : 0.16}"/>`;
};
const grid = [0, 1, 2, 3, 4, 5]
  .map((i) => {
    const x = CARD.x + 34 + i * 61;
    return `<line x1="${x}" y1="${CARD.y + 70}" x2="${x}" y2="${TRACK_Y}" stroke="#ffffff" stroke-opacity="${x === MARKET_X ? 0 : 0.05}"/>`;
  })
  .join("");

const ogSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <defs>
    <radialGradient id="og-warm" cx="0" cy="0" r="1">
      <stop offset="0%" stop-color="#d4bc79" stop-opacity="0.30"/>
      <stop offset="66%" stop-color="#d4bc79" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="og-cool" cx="1" cy="1" r="1">
      <stop offset="0%" stop-color="#60aaf3" stop-opacity="0.18"/>
      <stop offset="72%" stop-color="#60aaf3" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="og-rim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#fff6dd" stop-opacity="0.38"/>
      <stop offset="45%" stop-color="#ffffff" stop-opacity="0.12"/>
      <stop offset="100%" stop-color="#cfe2ff" stop-opacity="0.18"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="#000000"/>
  <rect width="1200" height="630" fill="url(#og-warm)"/>
  <rect width="1200" height="630" fill="url(#og-cool)"/>

  <g transform="translate(98 66)">${upsideMarkSvg({ height: 52 })}</g>
  <text x="172" y="103" font-family="${SANS}" font-size="28" letter-spacing="2" fill="#fafafa">
    <tspan font-weight="700">UPSIDE</tspan><tspan font-weight="400" dx="10">LAB</tspan>
  </text>

  <text x="94" y="300" font-family="${SANS}" font-size="104" font-weight="600" letter-spacing="-4.6" fill="#fafafa">${OG_LEAD}</text>
  <text x="94" y="404" font-family="${SANS}" font-size="104" font-weight="600" letter-spacing="-4.6" fill="${GOLD}">${OG_GOLD}</text>
  <text x="98" y="468" font-family="${BODY}" font-size="31" fill="#a6a6a6">${PRODUCT_HEADLINE[1]}</text>
  <text x="98" y="566" font-family="${BODY}" font-size="19" fill="#6e6e6e">${OG_CARD_LINE}</text>

  <rect x="${CARD.x}" y="${CARD.y}" width="${CARD.w}" height="${CARD.h}" rx="26" fill="#0a0a0a" fill-opacity="0.82"/>
  <rect x="${CARD.x + 0.5}" y="${CARD.y + 0.5}" width="${CARD.w - 1}" height="${CARD.h - 1}" rx="25.5" fill="none" stroke="url(#og-rim)"/>
  ${grid}
  <text x="${MARKET_X}" y="${CARD.y + 58}" text-anchor="middle" font-family="${MONO}" font-size="15" letter-spacing="2.2" fill="#a6a6a6">THE MARKET</text>
  <line x1="${MARKET_X}" y1="${CARD.y + 70}" x2="${MARKET_X}" y2="${TRACK_Y}" stroke="#ffffff" stroke-opacity="0.55" stroke-width="1.4"/>
  ${chip(MARKET_X + 18, TRACK_Y - 26)}
  ${chip(MARKET_X - 10, TRACK_Y - 66)}
  ${chip(MARKET_X + 22, TRACK_Y - 106)}
  ${chip(MARKET_X - 6, TRACK_Y - 146)}
  <text x="${CARD.x + CARD.w - 92}" y="${TRACK_Y - 70}" text-anchor="middle" font-family="${MONO}" font-size="15" letter-spacing="2.2" fill="${GOLD}">ITS OWN NEWS</text>
  ${chip(CARD.x + CARD.w - 92, TRACK_Y - 26, true)}
  <line x1="${CARD.x + 30}" y1="${TRACK_Y}" x2="${CARD.x + CARD.w - 30}" y2="${TRACK_Y}" stroke="#ffffff" stroke-opacity="0.28" stroke-width="1.2"/>
  <rect x="${MARKET_X + 52}" y="${TRACK_Y - 7}" width="14" height="14" rx="2.5" fill="${GOLD}" stroke="#000000" stroke-width="4" paint-order="stroke" transform="rotate(45 ${MARKET_X + 59} ${TRACK_Y})"/>
  <text x="${MARKET_X + 59}" y="${TRACK_Y + 36}" text-anchor="middle" font-family="${MONO}" font-size="15" letter-spacing="2.2" fill="${GOLD}">YOU</text>
</svg>`;

if (PRODUCT_HEADLINE.length !== 2) {
  throw new Error("the OG card is two lines");
}
if (!OG_CARD_LINE) throw new Error("the OG card line went missing");

await mkdir(pub("icons"), { recursive: true });

/* The bare mark, transparent, for anywhere that needs it without a plate. */
await text(pub("upside-mark.svg"), upsideMarkSvg({ height: 512 }));
await sharp(Buffer.from(upsideMarkSvg({ height: 512 })), { density: 144 })
  .png()
  .toFile(pub("upside-mark.png"));
note(pub("upside-mark.png"));

/*
  Favicons, bookmark tiles and the PWA "any" icons. Nothing masks these, so
  they carry their own rounded shape and the mark can sit larger.
*/
await text(pub("favicon.svg"), upsideIconSvg("tile", 128));
await text(pub("upside-icon.svg"), upsideIconSvg("tile", 128));

const ico16 = await shaped("favicon", 16, pub("icons", "icon-16.png"));
const ico32 = await shaped("favicon", 32, pub("icons", "icon-32.png"));
await shaped("favicon", 48, pub("icons", "icon-48.png"));
await shaped("tile", 128, pub("upside-icon.png"));
await shaped("tile", 192, pub("icons", "icon-192.png"));
await shaped("tile", 512, pub("icons", "icon-512.png"), app("icon.png"));

/* Android adaptive, at both densities the launcher asks for. */
await opaque("maskable", 192, pub("icons", "icon-192-maskable.png"));

const ico = packIco([
  { size: 16, data: ico16 },
  { size: 32, data: ico32 },
]);
await text(pub("favicon.ico"), ico);
await text(app("favicon.ico"), ico);

/*
  The Apple touch icon and the App Store master. Square, full-bleed and with
  no alpha: iOS draws the squircle itself, and an icon that arrives already
  rounded gets rounded twice. Every icon in this repo used to.
*/
await opaque("app", 180, app("apple-icon.png"), pub("apple-touch-icon.png"));
await opaque("app", 1024, pub("icons", "icon-1024.png"));

await opaque("maskable", 512, pub("icons", "icon-512-maskable.png"));

/* The social avatar, which every network crops to a circle. */
await opaque("avatar", 1024, pub("upside-fund-x-avatar.png"));

/* The lockups: one on the black plate, one transparent. */
await text(pub("upside-badge.svg"), upsideLockupSvg({ plate: true }));
await text(pub("upside-lockup.svg"), upsideLockupSvg({ plate: false }));

await sharp(Buffer.from(upsideLockupSvg({ plate: true })), { density: 288 })
  .resize(540, 100)
  .removeAlpha()
  .png()
  .toFile(pub("icons", "email-lockup.png"));
note(pub("icons", "email-lockup.png"));

/* The mail client's verified-sender mark. */
await text(pub("bimi.svg"), upsideBimiSvg());

await sharp(Buffer.from(ogSvg), { density: 192 })
  .resize(1200, 630)
  .removeAlpha()
  .png()
  .toFile(pub("og.png"));
note(pub("og.png"));

/*
  A receipt saying which mark these files were drawn from.

  mark-version.test.ts compares this hash against the current mark.ts, so
  a mark change with stale generated icons fails CI by name instead of
  shipping. Line endings are normalized before hashing so a checkout that
  rewrites them does not read as a redesign.
*/
const markSource = await readFile(
  path.join(root, "src", "lib", "brand", "mark.ts"),
  "utf8"
);
const markSha256 = createHash("sha256")
  .update(markSource.replace(/\r\n/g, "\n"))
  .digest("hex");
const receipt = pub("icons", "mark-source.json");
await writeFile(receipt, `${JSON.stringify({ markSha256 }, null, 2)}\n`);
note(receipt);

console.log(written.map((f) => `wrote ${f}`).join("\n"));
