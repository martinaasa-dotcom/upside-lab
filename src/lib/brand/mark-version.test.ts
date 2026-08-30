import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MARK_ASSET_VERSION } from "./mark-version";

/*
  The brand mark's cache-busting used to be a manual discipline: after any
  change to mark.ts, run `npm run icons`, bump every `?v=`, and rename
  CACHE in public/sw.js -- four hand edits with nothing that failed when
  one was missed. A favicon is one of the few files a browser holds past a
  deploy, so the miss ships a stale logo that outlives the redesign.

  This file is the "cannot be forgotten" version of that checklist. When
  mark.ts changes, it fails three ways, each naming its own one-line fix:
  update MARK_ASSET_VERSION (the failure prints the new value), run
  `npm run icons` (which rewrites the receipt in public/icons), and carry
  the new hash into sw.js's cache name. Everything else follows by import.
*/

const ROOT = path.resolve(__dirname, "../../..");

function markHash(): string {
  const source = readFileSync(
    path.join(ROOT, "src", "lib", "brand", "mark.ts"),
    "utf8"
  );
  return createHash("sha256").update(source.replace(/\r\n/g, "\n")).digest("hex");
}

describe("the mark and its cache-busting move together", () => {
  it("MARK_ASSET_VERSION is the hash of the mark that is actually in the tree", () => {
    const expected = markHash().slice(0, 8);
    expect(
      MARK_ASSET_VERSION,
      `mark.ts changed. Set MARK_ASSET_VERSION in src/lib/brand/mark-version.ts ` +
        `to "${expected}", run npm run icons, and put the same value in ` +
        `public/sw.js's CACHE name.`
    ).toBe(expected);
  });

  it("the generated icons were drawn from this mark (npm run icons)", () => {
    const receipt = JSON.parse(
      readFileSync(
        path.join(ROOT, "public", "icons", "mark-source.json"),
        "utf8"
      )
    ) as { markSha256?: string };
    expect(
      receipt.markSha256,
      "public/icons carries files generated from an older mark.ts. Run " +
        "npm run icons and commit what it writes."
    ).toBe(markHash());
  });

  it("the service worker's cache name carries the mark hash", () => {
    // The worker serves /icons/ cache-first, so only a renamed cache makes
    // an installed app drop yesterday's logo.
    const sw = readFileSync(path.join(ROOT, "public", "sw.js"), "utf8");
    const m = sw.match(/const CACHE = "upside-shell-v\d+-([0-9a-f]{8})"/);
    expect(
      m,
      'public/sw.js must name its cache "upside-shell-v<n>-<mark hash>".'
    ).not.toBeNull();
    expect(
      m?.[1],
      `public/sw.js's CACHE was built for another mark. Rename it to embed ` +
        `"${MARK_ASSET_VERSION}" so installed apps drop the old icons.`
    ).toBe(MARK_ASSET_VERSION);
  });

  it("no icon URL carries a hand-typed version again", () => {
    // Every ?v= imports MARK_ASSET_VERSION; a literal one is a site the
    // constant cannot bump, which is the exact hole this guard closes.
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(entry.name)) continue;
        if (/\.test\.(ts|tsx)$/.test(entry.name)) continue;
        if (/\?v=\d/.test(readFileSync(full, "utf8"))) {
          offenders.push(path.relative(ROOT, full));
        }
      }
    };
    walk(path.join(ROOT, "src"));
    expect(
      offenders,
      "These files hard-code a ?v= version. Import MARK_ASSET_VERSION from " +
        "@/lib/brand/mark-version instead so the bump cannot be missed: " +
        offenders.join(", ")
    ).toEqual([]);
  });
});
