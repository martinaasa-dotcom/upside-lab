import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/*
  Nine cards, one model name, and eight of them wrong.

  A Pulse report is mostly cache hits. Nine names on screen can be eight
  entries up to four hours old, several written for a DIFFERENT signed-in
  reader under the shared `:nothesis` key, and one fresh model call. The
  report carried a single `writtenBy` and a single `generatedAt`, and the
  card stamped both across every row, so the provenance eye said a model had
  written a sentence it had never seen and that it was written "just now"
  when it was written before lunch.

  That panel is the one surface whose entire purpose is answering "where did
  this come from", and it is the one place a wrong answer costs the most:
  `describeModelRun` returns null rather than guessing precisely so the
  section can be hidden instead of lying. The row-level answer is the same
  argument `fallback` already won on this type.
*/

function read(rel: string) {
  return readFileSync(path.resolve(__dirname, rel), "utf8");
}

const CACHE = read("./thesis-pulse-server-cache.ts");
const TYPES = read("./thesis-pulse.ts");
const ROUTE = read("../app/api/thesis/pulse/route.ts");
const CARD = read("../components/PulsePage.tsx");

describe("a Pulse check says who wrote it", () => {
  it("keeps the model run on the cache entry", () => {
    expect(
      CACHE.includes("writtenBy"),
      `The server cache no longer remembers which model wrote an entry, so ` +
        `a cached check can only be credited to whichever run served it.`
    ).toBe(true);
  });

  it("carries it on the row, the way fallback is carried", () => {
    expect(TYPES).toMatch(/writtenBy\?: ModelRun \| null;/);
    expect(TYPES).toMatch(/checkedAt\?: string;/);
  });

  it("stores the run that answered when a check is written fresh", () => {
    expect(ROUTE).toMatch(/candidate\.effectivePct,\s*\n\s*answeredBy\s*\n\s*\);/);
  });

  it("reads the row's own answer before the run's", () => {
    expect(
      CARD.includes("check?.writtenBy ?? writtenBy"),
      `The card credits the current run rather than the row, which is wrong ` +
        `for every cache hit on the screen.`
    ).toBe(true);
    expect(CARD).toContain("check?.checkedAt ?? checkedAt");
  });

  it("still falls back to the run rather than showing nothing", () => {
    /*
      An entry cached before this existed has no writtenBy, and a panel that
      loses its model line is worse than one naming the run that served it.
    */
    expect(CARD).toContain("?? writtenBy");
    expect(CARD).toContain("?? checkedAt");
  });
});
