import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { OG_IMAGE_PATH } from "@/lib/seo-routes";
import { OG_CARD_VERSION } from "./og-version";

/*
  The social card's URL moves whenever the card does.

  A share image is cached by URL wherever a link is unfurled, so a card
  regenerated at an unchanged URL keeps showing the old one. This is the
  same "cannot be forgotten" guard `mark-version.test.ts` keeps for the
  icons, applied to the card's own bytes.
*/
const ROOT = path.resolve(__dirname, "../../..");

describe("the social card and its URL move together", () => {
  it("OG_CARD_VERSION is the hash of the card that is actually in the tree", () => {
    const expected = createHash("sha256")
      .update(readFileSync(path.join(ROOT, "public", "og.png")))
      .digest("hex")
      .slice(0, 8);
    expect(
      OG_CARD_VERSION,
      `public/og.png changed. Set OG_CARD_VERSION in src/lib/brand/og-version.ts to "${expected}".`
    ).toBe(expected);
  });

  it("the card's URL carries that version", () => {
    expect(OG_IMAGE_PATH).toBe(`/og.png?v=${OG_CARD_VERSION}`);
  });
});
