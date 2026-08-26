import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ICONS = readFileSync("src/components/CircleIcons.tsx", "utf8");
const DOCK = readFileSync("src/components/BookModeDock.tsx", "utf8");
const PHONE = readFileSync("src/components/mobile/MobileTabBar.tsx", "utf8");

describe("dock nav icons", () => {
  it("draws Circle as a dotted member ring with a solid node", () => {
    expect(ICONS).toContain("pathLength={8}");
    expect(ICONS).toContain('strokeDasharray="0.34 0.66"');
    expect(ICONS).toContain('r="10"');
    expect(ICONS).toContain('r="3"');
    expect(ICONS).toContain('fill="currentColor"');
  });

  it("uses House, TrendingUp and CircleNavIcon on both docks", () => {
    expect(DOCK).toContain("CircleNavIcon");
    expect(PHONE).toContain("CircleNavIcon");
    expect(DOCK).toContain("House");
    expect(PHONE).toContain("House");
    expect(DOCK).toContain("TrendingUp");
    expect(PHONE).toContain("TrendingUp");
    expect(DOCK).not.toContain("LayoutDashboard");
    expect(PHONE).not.toContain("LayoutDashboard");
    expect(DOCK).not.toContain("Calculator");
    expect(PHONE).not.toContain("Calculator");
    expect(DOCK).not.toContain("scale-125");
    expect(PHONE).not.toContain("scale-110");
    expect(DOCK).not.toContain('from "@/components/People"');
    expect(PHONE).not.toContain('from "@/components/People"');
  });
});
