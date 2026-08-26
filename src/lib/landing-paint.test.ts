/**
 * The signed-out hero must paint in one frame, both lamps together.
 *
 * There is no bitmap to preload. The "two halves" of the hero are two
 * radial gradients, and they used to live on a document-tall SVG-filtered
 * layer. WebKit tiles that filter; the warm top painted and the cool half
 * only rasterized once the reader scrolled. These checks are against the
 * source because the failure is a CSS shape, not a render of the settled
 * page.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const CSS = readFileSync("src/app/globals.css", "utf8");
const LANDING = readFileSync("src/components/SignedOutLanding.tsx", "utf8");
const GATE = readFileSync("src/components/SignInGate.tsx", "utf8");

function ruleOf(selector: string): string {
  const start = CSS.indexOf(`${selector} {`);
  expect(start, `${selector} is missing from globals.css`).toBeGreaterThan(-1);
  return CSS.slice(start, CSS.indexOf("}", start));
}

describe("the landing hero lamps paint as one first-screen layer", () => {
  it("boxes the dithered pair to one screen, not the document", () => {
    const rule = ruleOf(".landing-field::before");
    expect(rule).toContain("height: 100svh");
    expect(rule).toContain("position: absolute");
    expect(rule).toContain("url(#ambient-dither)");
    expect(rule).toContain("translateZ(0)");
    expect(rule).not.toMatch(/^\s*display:\s*none/m);
  });

  it("does not SVG-filter the page-tall layer", () => {
    const start = CSS.indexOf(".landing-field::after {");
    expect(start).toBeGreaterThan(-1);
    const rule = CSS.slice(start, CSS.indexOf("}", start));
    expect(rule).not.toContain("url(#ambient-dither)");
    expect(rule).not.toMatch(/^\s*filter:/m);
  });

  it("keeps both first-screen lamps on the inherited page-frame pair", () => {
    // Warm and cool on .page-frame::before, which landing-field::before
    // reuses. Two background-images in that one rule is the combined asset.
    const start = CSS.indexOf(".page-frame::before {");
    const rule = CSS.slice(start, CSS.indexOf("transparent 100%", start) + 20);
    expect(rule).toContain("--primary");
    expect(rule).toContain("--ambient-cool");
  });
});

describe("the landing does not hide itself before paint", () => {
  it("does not wait on auth ready behind a spinner", () => {
    expect(GATE).not.toContain("DashboardLoading");
    expect(GATE).not.toMatch(/if\s*\(\s*!ready\s*\)/);
    expect(GATE).toMatch(/if\s*\(\s*user\s*\)\s*return/);
  });

  it("does not run the entrance animation on the hero", () => {
    expect(LANDING).not.toMatch(/signin-rise/);
    expect(CSS).toMatch(
      /\.landing-field \.signin-rise-1,[\s\S]*animation:\s*none/
    );
  });

  it("does not fade sections in on scroll", () => {
    expect(LANDING).not.toContain("IntersectionObserver");
    expect(LANDING).not.toContain("data-reveal");
    expect(LANDING).not.toContain("REVEAL_LEAD");
    expect(CSS).not.toContain("[data-reveal]");
  });

  it("asks WebKit to paint the sample card, not skip it", () => {
    expect(LANDING).toContain("landing-still");
    expect(LANDING).toContain("landing-hero");
    expect(CSS).toMatch(
      /\.landing-hero,\s*\n\.landing-still \{\s*\n\s*content-visibility:\s*visible;/
    );
  });

  it("drops backdrop-filter on the phone landing, so the card cannot fill in", () => {
    expect(CSS).toMatch(
      /@media \(max-width: 767px\) \{[\s\S]*?\.landing-field \.glass,[\s\S]*?backdrop-filter:\s*none/
    );
  });
});
