/**
 * The first painted frame belongs to whoever is refreshing.
 *
 * Every gated route in this app is statically rendered with no user, so
 * the HTML in the cache for `/`, `/pulse`, `/portfolio/<slug>` and the
 * rest is the signed-out landing. `AuthProvider` puts the last session
 * back in a `useLayoutEffect`, which is after hydration: warm, that is a
 * few milliseconds, which is why nobody caught it; cold, the reader
 * watches the page that sells the product they are already inside.
 *
 * These checks are against the source, because the failure is a shape
 * rather than a value: a script that is not in the head, a mark nothing
 * spends, or a mark nothing corrects when the session turns out to be
 * gone, and the flash is back with every test still green.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  LAST_USER_KEY,
  SESSION_HINT_ATTR,
  SESSION_HINT_SCRIPT,
  markSessionHint,
} from "@/lib/session-hint";

const CSS = readFileSync("src/app/globals.css", "utf8");
const LAYOUT = readFileSync("src/app/layout.tsx", "utf8");
const GATE = readFileSync("src/components/SignInGate.tsx", "utf8");
const PROVIDER = readFileSync("src/components/AuthProvider.tsx", "utf8");
const LAST_SESSION = readFileSync("src/lib/last-session.ts", "utf8");
const SHELL = readFileSync("src/components/SessionResumeShell.tsx", "utf8");

describe("the session hint the browser writes before it paints", () => {
  it("reads the key the app actually writes", () => {
    // Not a second copy of the string: the script and the module that
    // writes that key cannot be allowed to drift.
    expect(SESSION_HINT_SCRIPT).toContain(`"${LAST_USER_KEY}"`);
    expect(LAST_SESSION).toContain("LAST_USER_KEY as KEY");
  });

  it("marks the root element and survives a browser with no storage", () => {
    expect(SESSION_HINT_SCRIPT).toContain("document.documentElement");
    expect(SESSION_HINT_SCRIPT).toContain(`"${SESSION_HINT_ATTR}","in"`);
    // Private mode throws on localStorage. A blank page would be a far
    // worse failure than the flash this exists to fix.
    expect(SESSION_HINT_SCRIPT).toMatch(/^try\{/);
    expect(SESSION_HINT_SCRIPT).toMatch(/catch\(e\)\{\}$/);
    // One statement, no newlines: it blocks parsing of everything under it.
    expect(SESSION_HINT_SCRIPT).not.toContain("\n");
  });

  it("runs in the head, before the body is parsed", () => {
    expect(LAYOUT).toContain("SESSION_HINT_SCRIPT");
    const head = LAYOUT.indexOf("<head>");
    const script = LAYOUT.indexOf("SESSION_HINT_SCRIPT }}");
    const body = LAYOUT.indexOf('<body className="antialiased">');
    expect(head).toBeGreaterThan(-1);
    expect(script).toBeGreaterThan(head);
    expect(script).toBeLessThan(body);
    // The script writes an attribute React did not render.
    expect(LAYOUT).toContain("suppressHydrationWarning");
  });

  it("does not read the session cookie in the layout", () => {
    // That is the other way to answer this, and it makes every route in
    // the product dynamic to learn something the browser already knows.
    expect(LAYOUT).not.toMatch(/\bcookies\(\)/);
  });
});

describe("what the mark is spent on", () => {
  it("hides the signed-out view and shows the resume shell", () => {
    expect(GATE).toContain("data-signed-out-view");
    expect(SHELL).toContain("data-session-resume");
    expect(CSS).toMatch(
      /\[data-session-resume\] \{\s*display: none;\s*\}/
    );
    expect(CSS).toMatch(
      /html\[data-session="in"\] \[data-session-resume\] \{\s*display: block;\s*\}/
    );
    expect(CSS).toMatch(
      /html\[data-session="in"\] \[data-signed-out-view\] \{\s*display: none;\s*\}/
    );
  });

  it("keeps those rules unlayered, so a utility cannot win display back", () => {
    // An unlayered rule beats every layered one whatever the specificity,
    // and Tailwind's utilities are a layer. Inside `@layer utilities` a
    // `flex` on the signed-out frame could win the display back.
    const at = CSS.indexOf("[data-session-resume] {");
    expect(at).toBeGreaterThan(-1);
    const before = CSS.slice(0, at);
    const depth =
      (before.match(/\{/g) ?? []).length - (before.match(/\}/g) ?? []).length;
    expect(depth).toBe(0);
  });

  it("shows the reader the loading state they are about to get anyway", () => {
    // A different placeholder trades one visible swap for another.
    expect(SHELL).toContain("DashboardLoading");
    expect(SHELL).toContain("DEFAULT_LOADING_MESSAGE");
    // The shell is a sibling of the signed-out view, never inside it: CSS
    // is about to switch that subtree off.
    expect(GATE).toMatch(/<SessionResumeShell \/>\s*\n\s*\{signedOutView\}/);
  });
});

describe("the mark is a hint, and the app corrects it", () => {
  it("is rewritten wherever the last user is", () => {
    // saveLastUser is the one place that writes the key the script reads:
    // a resolved session, a resolved absence, a sign-out and an account
    // switch all pass through it.
    expect(LAST_SESSION).toMatch(
      /markSessionHint\(Boolean\(user\)\);[\s\S]*localStorage\.removeItem/
    );
    // And re-applied on mount, because React's dev remount clears
    // attributes on <html> that it did not render itself.
    expect(PROVIDER).toContain("markSessionHint(Boolean(last))");
  });

  it("says out loud which way it went", () => {
    const el: Record<string, string> = {};
    const doc = {
      documentElement: {
        setAttribute: (k: string, v: string) => {
          el[k] = v;
        },
      },
    };
    const prior = (globalThis as { document?: unknown }).document;
    (globalThis as { document?: unknown }).document = doc;
    try {
      markSessionHint(true);
      expect(el[SESSION_HINT_ATTR]).toBe("in");
      // An expired session has to reach the landing, not a shell that
      // waits forever.
      markSessionHint(false);
      expect(el[SESSION_HINT_ATTR]).toBe("out");
    } finally {
      if (prior === undefined) {
        delete (globalThis as { document?: unknown }).document;
      } else {
        (globalThis as { document?: unknown }).document = prior;
      }
    }
  });
});
