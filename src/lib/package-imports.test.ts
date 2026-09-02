/**
 * A barrel import pulls in the whole library, and this repo has one.
 *
 * `radix-ui` is a single package that re-exports every primitive as a
 * namespace: its entry module is 30-odd lines of `export * as Dialog from
 * "@radix-ui/react-dialog"`, one for each of the packages listed as its
 * dependencies. Twenty-one files here import from it, and without help a
 * bundler entering that module has to enter all of them, so a file wanting
 * only the tooltip drags in the menubar, the navigation menu and the
 * one-time password field along with it.
 *
 * `experimental.optimizePackageImports` is Next's answer: it rewrites a
 * named import off a barrel into a direct import of the submodule that
 * export came from. Next carries a default list of packages it does this
 * for, `lucide-react` and `date-fns` among them, and `radix-ui` is not on
 * it, so the one barrel this app actually imports from was the one nobody
 * was optimising.
 *
 * What this guards is the two ways the option goes quiet without anything
 * failing. A name that is not a real dependency is simply never matched,
 * so a typo is inert rather than an error. And a name Next already
 * optimises by default is a restatement that will one day disagree with
 * the default list. Both leave a config that looks like it is working.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

const ROOT = join(__dirname, "..", "..");

const packageJson = JSON.parse(
  readFileSync(join(ROOT, "package.json"), "utf8"),
) as { dependencies?: Record<string, string> };

const optimized = nextConfig.experimental?.optimizePackageImports ?? [];

/**
 * Packages Next already optimises for everyone. Naming one of these
 * ourselves adds nothing and drifts the day the default list moves.
 * Both of these are imported all over this app, so the temptation is real.
 */
const NEXT_OPTIMIZES_BY_DEFAULT = ["lucide-react", "date-fns"];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full));
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const sources = sourceFiles(join(ROOT, "src")).map((file) =>
  readFileSync(file, "utf8"),
);

function isImportedSomewhere(pkg: string): boolean {
  return sources.some((text) => text.includes(`from "${pkg}"`));
}

describe("optimizePackageImports", () => {
  it("names the radix-ui barrel, which Next does not optimise by default", () => {
    expect(optimized).toContain("radix-ui");
  });

  it("names only real dependencies, since an unknown name is silently inert", () => {
    const declared = Object.keys(packageJson.dependencies ?? {});
    for (const pkg of optimized) {
      expect(declared, `${pkg} is not a dependency`).toContain(pkg);
    }
  });

  it("names only packages this app actually imports", () => {
    for (const pkg of optimized) {
      expect(isImportedSomewhere(pkg), `${pkg} is imported nowhere`).toBe(true);
    }
  });

  it("does not restate a package Next already optimises", () => {
    for (const pkg of NEXT_OPTIMIZES_BY_DEFAULT) {
      expect(optimized, `${pkg} is a Next default`).not.toContain(pkg);
      expect(isImportedSomewhere(pkg), `${pkg} is imported nowhere`).toBe(true);
    }
  });
});
