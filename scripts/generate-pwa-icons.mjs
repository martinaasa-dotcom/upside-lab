/*
  Renders the Upside Lab mark to every file the product ships: the favicons,
  the Apple touch icon, the Next.js file-convention icons, the PWA manifest
  icons, the App Store master, the BIMI mark, the social avatar, the email
  lockup and the OG card.

  Run with `npm run icons` after changing src/lib/brand/mark.ts.

  It used to rasterise a 172 KB PNG of the old faceted mark out of `Images/`,
  trim it, and scale it into place. That meant the icons could only ever be as
  good as a bitmap somebody exported once, every output carried the trim's
  guesswork, and the app's own inline logo was a separate drawing that had to
  be kept in step by hand. This draws from the same geometry the app draws
  from -- Node strips the types on import -- so there is exactly one mark.
*/
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

import {
  upsideBimiSvg,
  upsideIconSvg,
  upsideLockupSvg,
  upsideMarkSvg,
} from "../src/lib/brand/mark.ts";
import { PRODUCT_NAME, PRODUCT_SENTENCE } from "../src/lib/product.ts";

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

  Set in whatever grotesque the build host happens to have rather than in
  Archivo. The card is rasterised outside the browser, so a webfont is not on
  offer and the stack falls back honestly instead of pretending.
*/
const SANS =
  "Archivo, Geist, ui-sans-serif, system-ui, -apple-system, Helvetica, Arial, sans-serif";

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
  </defs>
  <rect width="1200" height="630" fill="#000000"/>
  <rect width="1200" height="630" fill="url(#og-warm)"/>
  <rect width="1200" height="630" fill="url(#og-cool)"/>
  <g transform="translate(98 168)">${upsideMarkSvg({ height: 112 })}</g>
  <text x="222" y="248" font-family="${SANS}" font-size="38" letter-spacing="2.5" fill="#fafafa">
    <tspan font-weight="700">UPSIDE</tspan><tspan font-weight="400" dx="14">LAB</tspan>
  </text>
  <text x="98" y="392" font-family="${SANS}" font-size="50" font-weight="600" letter-spacing="-1.3" fill="#fafafa">
    See what your portfolio did.
  </text>
  <text x="98" y="450" font-family="${SANS}" font-size="50" font-weight="600" letter-spacing="-1.3" fill="#fafafa">
    Ask Margus if the thesis still holds.
  </text>
  <text x="98" y="512" font-family="${SANS}" font-size="28" fill="#a1a1a1">
    ${PRODUCT_NAME} — educational scenarios, never financial advice.
  </text>
</svg>`;

if (!PRODUCT_SENTENCE) throw new Error("the product sentence went missing");

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

const ico16 = await sharp(Buffer.from(upsideIconSvg("tile", 16)), {
  density: densityFor(16),
})
  .resize(16, 16)
  .png()
  .toBuffer();
const ico32 = await shaped("tile", 32, pub("icons", "icon-32.png"));
await shaped("tile", 48, pub("icons", "icon-48.png"));
await shaped("tile", 128, pub("upside-icon.png"));
await shaped("tile", 192, pub("icons", "icon-192.png"));
await shaped("tile", 512, pub("icons", "icon-512.png"), app("icon.png"));

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

/* Android adaptive: full-bleed, and the mark well inside the crop. */
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

console.log(written.map((f) => `wrote ${f}`).join("\n"));
