/**
 * The walkthrough gate.
 *
 * The whole reason it is a number rather than a boolean is the "behind a
 * newer one" case below: raising `WELCOME_TOUR_VERSION` has to put everybody
 * who is behind it back in front of the walkthrough, including the people who
 * finished the last one. "Reset everyone" is implemented as that raise and
 * nothing else — no migration, no script — and a boolean cannot express it.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearSeenTourVersion,
  loadSeenTourVersion,
  saveSeenTourVersion,
  screenCopy,
  STAGE_LABEL,
  tourIsDue,
  tourStages,
  WELCOME_TOUR_VERSION,
  type Stage,
} from "@/lib/welcome-tour";

describe("tourIsDue", () => {
  it("is due for anybody who has never finished one", () => {
    expect(tourIsDue(0)).toBe(true);
  });

  it("treats a missing answer as never — a profile we could not read has seen nothing", () => {
    expect(tourIsDue(null)).toBe(true);
    expect(tourIsDue(undefined)).toBe(true);
  });

  it("is not due once the current one is finished", () => {
    expect(tourIsDue(WELCOME_TOUR_VERSION)).toBe(false);
  });

  it("is due again for anybody behind a newer one", () => {
    expect(tourIsDue(WELCOME_TOUR_VERSION - 1)).toBe(true);
  });

  it("is not due for a number ahead of this deploy", () => {
    // A browser that met a newer deploy and came back to an older one. Not a
    // reason to replay a walkthrough it has already been past.
    expect(tourIsDue(WELCOME_TOUR_VERSION + 1)).toBe(false);
  });
});

/*
  The suite runs on the node environment, so there is no window unless one is
  put there. That is worth doing rather than skipping: the browser's copy is
  what stops the walkthrough flickering back between navigations, and every
  bug it can have is a bug in parsing what somebody else wrote into that key.
*/
describe("the browser's copy", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    (globalThis as { window?: unknown }).window = {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
    };
  });

  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  it("round-trips", () => {
    saveSeenTourVersion(WELCOME_TOUR_VERSION);
    expect(loadSeenTourVersion()).toBe(WELCOME_TOUR_VERSION);
    expect(tourIsDue(loadSeenTourVersion())).toBe(false);
  });

  it("reads as never when nothing is stored", () => {
    expect(loadSeenTourVersion()).toBe(0);
  });

  it("reads as never when something unparseable is stored", () => {
    window.localStorage.setItem("portfell-welcome-tour", "yes please");
    expect(loadSeenTourVersion()).toBe(0);
  });

  it("clears back to never, which is what the replay button needs", () => {
    saveSeenTourVersion(WELCOME_TOUR_VERSION);
    clearSeenTourVersion();
    expect(tourIsDue(loadSeenTourVersion())).toBe(true);
  });
});

/*
  Which screens a reader gets.

  The distinction this is protecting is the one the whole rewrite turns on:
  holdings decide what is *in* the walkthrough, and never whether it is shown.
  Wiring them back to the second question would silently restore the old
  behaviour, where the only people who ever got told what the app is were the
  ones with nothing in it.
*/
describe("tourStages", () => {
  const both = { hasHoldings: false, classroomOnly: false };

  it("asks an empty portfolio for holdings", () => {
    expect(tourStages(both)).toContain("holdings");
  });

  it("does not ask somebody who already owns things to type them in again", () => {
    expect(tourStages({ ...both, hasHoldings: true })).not.toContain("holdings");
  });

  it("does not ask a paper-class account either — the teacher provisions it", () => {
    expect(tourStages({ ...both, classroomOnly: true })).not.toContain("holdings");
  });

  it("still explains the whole app to every one of them", () => {
    const telling: Stage[] = ["what", "map", "helps", "rules"];
    for (const input of [
      both,
      { ...both, hasHoldings: true },
      { ...both, classroomOnly: true },
    ]) {
      const stages = tourStages(input);
      for (const stage of telling) expect(stages, JSON.stringify(input)).toContain(stage);
      // Explaining comes before asking, on every variant.
      expect(stages.indexOf("rules")).toBeLessThan(stages.indexOf("q1"));
      expect(stages.at(-1)).toBe("done");
    }
  });
});

describe("screenCopy", () => {
  const stages = tourStages({ hasHoldings: false, classroomOnly: false });

  it("has a heading and a sentence for every screen that can appear", () => {
    for (const stage of stages) {
      const copy = screenCopy(stage, null);
      expect(copy.title, stage).toBeTruthy();
      expect(copy.lede, stage).toBeTruthy();
    }
  });

  it("has a short step label for every screen", () => {
    for (const stage of stages) {
      expect(STAGE_LABEL[stage], stage).toBeTruthy();
      expect(STAGE_LABEL[stage].length, stage).toBeLessThanOrEqual(16);
    }
  });

  it("names the product on the first screen rather than spelling it out", () => {
    expect(screenCopy("what", null).title).toContain("Upside Lab");
  });

  it("only claims a view once a tier has actually been settled", () => {
    expect(screenCopy("done", null).title).not.toContain("Showing you");
    expect(screenCopy("done", "Comfortable investor").title).toContain(
      "Comfortable investor"
    );
  });

  it("says portfolio, never sheet or book", () => {
    const everything = stages
      .flatMap((s) => [screenCopy(s, null).title, screenCopy(s, null).lede])
      .join(" ")
      .toLowerCase();
    expect(everything).not.toMatch(/\byour book\b|\bthe book\b|\bsheet\b/);
  });
});
