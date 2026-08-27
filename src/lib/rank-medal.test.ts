import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const BOARD = readFileSync("src/components/CommunityTodayBoard.tsx", "utf8");
const MEDAL = readFileSync("src/components/RankMedal.tsx", "utf8");

function code(src: string) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("circle today medals", () => {
  it("draws filled gold, silver and bronze medals, not Lucide's Medal", () => {
    expect(BOARD).toContain("RankMedal");
    expect(BOARD).not.toMatch(/import \{[^}]*\bMedal\b[^}]*\} from "lucide-react"/);
    expect(BOARD).not.toContain("<Medal");
    expect(BOARD).toContain("Trophy");
    const drawing = code(MEDAL);
    expect(drawing).toContain("TONES.lit.from");
    expect(drawing).toContain("#f3f3f6");
    expect(drawing).toContain("#c1864c");
    expect(drawing).not.toContain("text-caution");
    expect(drawing).not.toContain("text-warning");
    expect(drawing).not.toContain("--warning");
    expect(drawing).toContain("{place}");
  });
});
