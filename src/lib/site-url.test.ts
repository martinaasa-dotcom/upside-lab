/**
 * `safeInternalPath` decides where a browser goes after signing in, and it
 * used to read the text as typed while the redirect read it as the URL
 * parser does. The parser strips a tab or a newline before it looks at
 * anything else, so "/\t/evil.com" passed every text check and resolved to
 * https://evil.com/. Verified in node: new URL("/\t/evil.com",
 * "https://upsidelab.app").origin is "https://evil.com".
 */
import { describe, expect, it } from "vitest";
import { safeInternalPath } from "@/lib/site-url";

const ORIGIN = "https://upsidelab.app";

/** Where a redirect built from the answer would actually land. */
function landsOn(next: string): string {
  return new URL(next, ORIGIN).origin;
}

describe("safeInternalPath", () => {
  it("keeps an ordinary path and its query", () => {
    expect(safeInternalPath("/portfolio/main?x=1")).toBe("/portfolio/main?x=1");
    expect(safeInternalPath("/pulse")).toBe("/pulse");
    expect(safeInternalPath("  /growth  ")).toBe("/growth");
    // Whitespace at either end is trimmed, as a space would be. Only a
    // control character inside the path is a refusal.
    expect(safeInternalPath("/pulse\t")).toBe("/pulse");
  });

  it("lands on home for nothing, a scheme, or a protocol-relative URL", () => {
    expect(safeInternalPath(null)).toBe("/");
    expect(safeInternalPath("")).toBe("/");
    expect(safeInternalPath("https://evil.com/")).toBe("/");
    expect(safeInternalPath("//evil.com")).toBe("/");
    expect(safeInternalPath("/\\evil.com")).toBe("/");
    expect(safeInternalPath("/a\\b")).toBe("/");
    expect(safeInternalPath("/x://y")).toBe("/");
    expect(safeInternalPath("javascript:alert(1)")).toBe("/");
  });

  it("refuses a tab, carriage return or newline anywhere in the path", () => {
    for (const raw of [
      "/\t/evil.com",
      "/\n/evil.com",
      "/\r/evil.com",
      "/\r\n/evil.com",
      "/\t\\evil.com",
      "/pul\tse",
      "/\u0000/evil.com",
      "/\u007f/evil.com",
    ]) {
      expect(safeInternalPath(raw), JSON.stringify(raw)).toBe("/");
    }
  });

  it("keeps the percent-encoded forms, which the parser does not strip", () => {
    for (const raw of ["/%09/evil.com", "/%0a/evil.com", "/%0D/evil.com"]) {
      expect(safeInternalPath(raw)).toBe(raw);
      expect(landsOn(safeInternalPath(raw))).toBe(ORIGIN);
    }
  });

  it("never returns a path that resolves off this origin", () => {
    const attempts = [
      "/\t/evil.com",
      "/\n\n//evil.com",
      "/ \t//evil.com",
      "//evil.com/\t",
      "/\\/evil.com",
      "/%2F%2Fevil.com",
      "/@evil.com",
      "/pulse?next=//evil.com",
      "/#//evil.com",
    ];
    for (const raw of attempts) {
      expect(landsOn(safeInternalPath(raw)), JSON.stringify(raw)).toBe(ORIGIN);
    }
  });
});
