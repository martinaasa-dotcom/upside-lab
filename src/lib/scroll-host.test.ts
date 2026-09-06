/**
 * Scrollbars sit in a reserved track, never on a field.
 *
 * Overlay bars (macOS, iOS) ignore `scrollbar-gutter` and paint on the
 * content. The walkthrough scroller had no inline-end inset, so a full-width
 * input ran under the bar.
 *
 * `.scroll-host` is the only custom track. Firefox 153 answers true for
 * `@supports selector(::-webkit-scrollbar)` without implementing thumb
 * styling, so padding must not be gated on that query. Clearance is 1rem
 * in `@layer base` so a `p-6` on the same node still wins. Nested overflow
 * wells are not hosts. Asserted against the source because the failure is a
 * class and a cascade layer, not a number a render would show.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const CSS = readFileSync("src/app/scroll-host.css", "utf8");
const GLOBALS = readFileSync("src/app/globals.css", "utf8");

function stripComments(block: string): string {
  return block.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Layout rules for `.scroll-host` inside `@layer base`. */
function hostLayout(): string {
  const padAt = CSS.indexOf("padding-inline-end: var(--scroll-clearance)");
  if (padAt < 0) throw new Error("layered .scroll-host padding is missing");
  const layerAt = CSS.lastIndexOf("@layer base", padAt);
  if (layerAt < 0) {
    throw new Error(
      "the 1rem inset has to stay in @layer base so a padding utility on the same node still wins",
    );
  }
  const from = CSS.slice(layerAt);
  const match = from.match(/\.scroll-host\s*\{([\s\S]*?)\n\s*\}/);
  if (!match) throw new Error("no layered .scroll-host rule");
  return stripComments(match[1]);
}

const HOSTS = [
  "src/components/WelcomeTour.tsx",
  "src/components/FeedbackModal.tsx",
  "src/components/HoldingModal.tsx",
  "src/components/CsvImportModal.tsx",
  "src/components/CostBasisModal.tsx",
  "src/components/CashModal.tsx",
  "src/components/InvitePartnerModal.tsx",
  "src/components/YtdAnchorModal.tsx",
  "src/components/RenameSheetModal.tsx",
  "src/components/SnapshotsModal.tsx",
  "src/components/CommunitiesList.tsx",
  "src/components/CommunityView.tsx",
  "src/components/AccountPage.tsx",
  "src/components/CcAdvisorChat.tsx",
];

describe("scroll hosts keep the bar off the fields", () => {
  it("is imported from the global stylesheet", () => {
    expect(GLOBALS).toMatch(/@import "\.\/scroll-host\.css"/);
  });

  it("aliases no-scrollbar next to the rail hide, so the command list stays bar-free", () => {
    expect(GLOBALS).toMatch(
      /\.scrollbar-none,\s*\n\s*\.no-scrollbar\s*\{/,
    );
  });

  it("reserves a gutter on every vertical scroller", () => {
    expect(CSS).toMatch(
      /\[class\*="overflow-y-auto"\]:not\(\.scrollbar-none\):not\(\.no-scrollbar\)[\s\S]*?scrollbar-gutter:\s*stable/,
    );
  });

  it("styles only .scroll-host, with one track size and one thumb", () => {
    expect(CSS).toMatch(/--scroll-track:\s*0.5rem/);
    expect(CSS).toMatch(/--scroll-clearance:\s*1rem/);
    expect(CSS).toMatch(/\.scroll-host::-webkit-scrollbar\s*\{/);
    expect(CSS).toMatch(/width:\s*var\(--scroll-track/);
    expect(CSS).toMatch(/scrollbar-color:\s*var\(--scroll-thumb\)\s+transparent/);
    expect(CSS).toMatch(/--scroll-thumb-hover:/);
    expect(CSS).not.toMatch(
      /\[role="dialog"\][\s\S]{0,120}\[class\*="overflow-y-auto"\]/,
    );
  });

  it("does not gate padding on the Firefox 153 webkit-scrollbar lie", () => {
    expect(stripComments(CSS)).not.toMatch(
      /@supports\s+selector\(::-webkit-scrollbar\)\s*\{/,
    );
  });

  it("keeps 1rem from field to track, in @layer base", () => {
    const layout = hostLayout();
    expect(layout).toMatch(/padding-inline-end:\s*var\(--scroll-clearance\)/);
    expect(layout).toMatch(/touch-action:\s*pan-y/);
    expect(layout).toMatch(/scrollbar-gutter:\s*stable/);
    expect(layout).toMatch(/overflow-y:\s*auto/);
  });

  it("does not clamp every input in the app to 100%", () => {
    expect(CSS).toMatch(
      /\.scroll-host :is\(input, textarea, select\),[\s\S]*?max-width:\s*100%/,
    );
    expect(CSS).not.toMatch(
      /(?:^|\n):is\(input, textarea, select\)\s*\{[\s\S]*?max-width/,
    );
  });

  it("does not put overflow back on html", () => {
    const match = GLOBALS.match(/(?:^|\n)html\s*\{([\s\S]*?)\n\}/);
    expect(match, "no top-level html rule").not.toBeNull();
    const rule = stripComments(match![1]);
    expect(rule).not.toMatch(/(^|\s)overflow(-x|-y)?\s*:/);
    expect(rule).toMatch(/scrollbar-gutter:\s*stable/);
  });

  it("parks the walkthrough track in the card pad, so fields line up with the progress", () => {
    const tour = readFileSync("src/components/WelcomeTour.tsx", "utf8");
    expect(tour).toMatch(/scroll-host -mx-4 px-4 sm:-mx-6 sm:px-6/);
  });

  for (const path of HOSTS) {
    it(`${path} marks its form scroller as a scroll-host`, () => {
      expect(readFileSync(path, "utf8")).toContain("scroll-host");
    });
  }
});
