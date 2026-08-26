import { describe, expect, it } from "vitest";
import { safeHttpUrl } from "@/lib/safe-url";

describe("safeHttpUrl", () => {
  it("keeps ordinary http and https links", () => {
    expect(safeHttpUrl("https://finance.yahoo.com/news/x")).toBe(
      "https://finance.yahoo.com/news/x"
    );
    expect(safeHttpUrl("http://example.com/a")).toBe("http://example.com/a");
  });

  it("drops javascript, data, and protocol-relative strings", () => {
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpUrl("JAVASCRIPT:alert(1)")).toBeNull();
    expect(safeHttpUrl("data:text/html,<h1>x</h1>")).toBeNull();
    expect(safeHttpUrl("//evil.example/phish")).toBeNull();
    expect(safeHttpUrl("/internal")).toBeNull();
    expect(safeHttpUrl("https://ok.example\njavascript:alert(1)")).toBeNull();
  });

  it("can require https", () => {
    expect(safeHttpUrl("http://lh3.googleusercontent.com/a", { httpsOnly: true })).toBeNull();
    expect(
      safeHttpUrl("https://lh3.googleusercontent.com/a", { httpsOnly: true })
    ).toBe("https://lh3.googleusercontent.com/a");
  });

  it("drops credentials in the URL", () => {
    expect(safeHttpUrl("https://user:pass@evil.example/")).toBeNull();
  });
});
