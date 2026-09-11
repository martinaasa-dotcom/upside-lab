import { describe, expect, it } from "vitest";
import { nextExpandedAfterRemove } from "./WatchlistStrip";

describe("nextExpandedAfterRemove", () => {
  it("closes the accordion when the open row's own ticker is removed", () => {
    expect(nextExpandedAfterRemove("AAPL", "AAPL")).toBeNull();
  });

  it("leaves an unrelated open row alone", () => {
    expect(nextExpandedAfterRemove("AAPL", "NVDA")).toBe("AAPL");
  });

  it("stays closed when nothing was open", () => {
    expect(nextExpandedAfterRemove(null, "NVDA")).toBeNull();
  });
});
