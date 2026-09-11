import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const SRC = readFileSync("src/components/TrendsPanel.tsx", "utf8");

/*
  Trends is the one Lab tab that cannot answer on the sample: it reads four
  years of closes and asks a model whether a trend has turned, so
  `/api/trends` requires a session, and it should -- a stranger walking the
  sample must not be able to spend a model call.

  What was wrong was what the sample reader saw. Measured on the running
  app, the tab offered a "Recheck" button that could only fail, put a 401
  on the wire, and then printed the shared sign-in copy, "You're signed
  out. Sign in again to see this", to somebody who has never signed in --
  while the gate on the rooms that really are closed tells that same reader
  "The portfolio, Pulse, Lab and Growth are all open on the sample".
*/
describe("the one Lab tab that needs an account says so", () => {
  it("decides from a settled session, never from a missing one", () => {
    /*
      `authReady` is load-bearing in both directions. Without it, the gate
      would close for the first frames of every signed-in visit; and were
      it read the other way, a reader whose session never resolves would
      sit forever on a spinner rather than being told why.
    */
    expect(SRC).toMatch(/needsAccount\s*=\s*authReady\s*&&\s*!user/);
  });

  it("does not put a request on the wire that can only be refused", () => {
    expect(SRC).toMatch(/if \(!key \|\| needsAccountRef\.current\)/);
  });

  it("offers no control that can only fail", () => {
    expect(SRC).toMatch(/hidden=\{needsAccount\}/);
  });

  it("never shows the lapsed-session wording to somebody who never signed in", () => {
    expect(SRC).toMatch(/\{error && !needsAccount &&/);
  });

  it("says what is missing in the product's own words", () => {
    expect(SRC).toMatch(/This part needs an account/);
    // And it does not leave the reader thinking the rest of Lab is shut.
    expect(SRC).toMatch(/Everything else here answers on the sample/);
  });
});
