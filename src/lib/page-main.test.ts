/**
 * The deferral lives in the shell now, so a page written later gets it
 * without anybody reading `auto-fold.ts`. These hold the parts of that
 * which are easy to undo by accident, and the one that would blank a
 * page if it went.
 *
 * Source-text, like `dock-stability.test.ts`, because what matters is
 * which mechanism is wired where rather than anything a render shows.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Every .tsx under src/, the way the rest of this suite walks the tree. */
function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...tsxFiles(path));
    else if (entry.name.endsWith(".tsx")) out.push(path);
  }
  return out;
}

const AUTOFOLD = readFileSync("src/components/AutoFold.tsx", "utf8");

/** Source with block and line comments removed, for rules about code. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}
const SHELL = readFileSync("src/components/PageMain.tsx", "utf8");

/*
 * The signed-in rooms. `SignInGate` draws the landing page, which has a
 * frame but its own layout and no page `main`, so it is not one of these.
 */
const PAGES = tsxFiles("src/components").filter((f) => {
  const src = readFileSync(f, "utf8");
  return src.includes("PAGE_FRAME_CLASS") && /<main id="main"|<PageMain>/.test(src);
});

describe("every page's main goes through the shell", () => {
  it("finds the pages", () => {
    expect(PAGES.length).toBeGreaterThanOrEqual(6);
  });

  it("nobody hand-rolls a main with the page class", () => {
    /*
     * A page that writes its own <main> gets no deferral and nothing
     * says so. `PageMain` is the only place the two are put together.
     */
    for (const f of PAGES) {
      const src = readFileSync(f, "utf8");
      expect(src, `${f} should use <PageMain>`).not.toMatch(
        /<main[^>]*PAGE_MAIN_CLASS/
      );
      expect(src, `${f} should use <PageMain>`).toContain("<PageMain>");
    }
  });

  it("the shell is the only user of PAGE_MAIN_CLASS", () => {
    const users = tsxFiles("src").filter((f) =>
      readFileSync(f, "utf8").includes("PAGE_MAIN_CLASS")
    );
    expect(users).toEqual(["src/components/PageMain.tsx"]);
  });
});

describe("AutoFold's safety rules", () => {
  it("withholds nothing from a render that is hydrating", () => {
    /*
     * The server cannot know how tall the reader's screen is, so it
     * renders every section, and a client that renders fewer disagrees
     * with the HTML it is hydrating.
     *
     * This must be `useSyncExternalStore`, which React guarantees hands
     * a hydrating render the server snapshot. It was first written as a
     * module flag flipped on the first `requestAnimationFrame`, and that
     * is wrong in a way that only shows up on a second visit: React 19
     * hydrates in chunks across frames, so the flag turned true part-way
     * through and everything after it rendered differently. React error
     * #418, on `/account`, once there was a memory to read.
     */
    expect(AUTOFOLD).toMatch(/useSyncExternalStore\(/);
    expect(AUTOFOLD).toMatch(/\(\) => true,\s*\(\) => false/);
    expect(AUTOFOLD).toMatch(/if \(!hydrated \|\| mustRenderWhole\(\)\) return allOpen/);
    // Code only. The comment above it records the version that was wrong,
    // which is the whole reason the rule is worth keeping.
    expect(code(AUTOFOLD), "no timing-based hydration guess").not.toMatch(
      /pastFirstPaint|requestAnimationFrame/
    );
  });

  it("renders the whole page for an anchor and with no observer", () => {
    // A section something scrolls to would arrive empty.
    expect(AUTOFOLD).toMatch(/window\.location\.hash/);
    expect(AUTOFOLD).toMatch(/typeof IntersectionObserver === "undefined"/);
  });

  it("opens everything for a print", () => {
    expect(AUTOFOLD).toMatch(/"beforeprint"/);
  });

  it("keeps the wrapper out of the layout", () => {
    /*
     * `main` is a flex column. A real box here would become the flex
     * item in the section's place, taking its `order` and its own flex
     * sizing with it.
     */
    expect(AUTOFOLD).toMatch(/display: "contents"/);
  });

  it("only ever opens more when the window changes shape", () => {
    // Closing a section because the window got shorter would take
    // content off the screen the reader is on.
    const resize = AUTOFOLD.slice(AUTOFOLD.indexOf('const reset = ()'));
    expect(resize.slice(0, 400)).toContain("openAll()");
    expect(resize.slice(0, 400)).not.toMatch(/setFold\(\{\s*count/);
  });

  it("measures only a page with nothing withheld", () => {
    /*
     * A page measured while some of it is still closed would record the
     * reserve heights as though they were real, and believe them next
     * time.
     */
    const write = AUTOFOLD.slice(AUTOFOLD.indexOf("MEASURE WHAT ACTUALLY LANDED"));
    expect(write).toMatch(/if \(count === 0 \|\| open\.size !== count\) return;/);
  });

  it("lets a page opt out without editing the shell", () => {
    expect(SHELL).toMatch(/whole\?: boolean/);
    expect(SHELL).toMatch(/whole \? children : <AutoFold>/);
  });
});
