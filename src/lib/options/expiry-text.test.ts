import { describe, expect, it } from "vitest";
import { parseExpiryText } from "@/lib/options/expiry-text";

describe("reading a pasted expiry", () => {
  it("takes this app's own date", () => {
    expect(parseExpiryText("2026-11-20")).toBe("2026-11-20");
  });
  it("takes a day-first date field", () => {
    expect(parseExpiryText("20.11.2026")).toBe("2026-11-20");
  });
  it("takes a broker's contract line", () => {
    expect(parseExpiryText("NOV 20 '26 250 Call")).toBe("2026-11-20");
    expect(parseExpiryText("Jan 15, 2027")).toBe("2027-01-15");
    expect(parseExpiryText("16 Jun 2028")).toBe("2028-06-16");
  });
  it("refuses a slash date, which reads two ways", () => {
    expect(parseExpiryText("11/10/2026")).toBeNull();
  });
  it("refuses a day that does not exist", () => {
    expect(parseExpiryText("2026-02-30")).toBeNull();
    expect(parseExpiryText("nothing here")).toBeNull();
  });
});
