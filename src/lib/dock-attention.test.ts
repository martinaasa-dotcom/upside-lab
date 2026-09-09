import { describe, expect, it } from "vitest";
import { DOCK_CUE_IDLE_MS, dockCueDue } from "@/lib/dock-attention";

describe("dockCueDue", () => {
  const now = 1_000_000_000_000;

  it("is due with no record at all", () => {
    expect(dockCueDue(null, now)).toBe(true);
  });

  it("is not due right after being seen", () => {
    expect(dockCueDue(now - 1000, now)).toBe(false);
  });

  it("is not due just under the idle window", () => {
    expect(dockCueDue(now - (DOCK_CUE_IDLE_MS - 1), now)).toBe(false);
  });

  it("is due exactly at the idle window", () => {
    expect(dockCueDue(now - DOCK_CUE_IDLE_MS, now)).toBe(true);
  });

  it("is due well past the idle window", () => {
    expect(dockCueDue(now - DOCK_CUE_IDLE_MS * 10, now)).toBe(true);
  });

  it("treats a non-finite record as absent", () => {
    expect(dockCueDue(Number.NaN, now)).toBe(true);
  });
});
