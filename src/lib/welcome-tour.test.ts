/**
 * The walkthrough gate.
 *
 * The whole reason it is a number rather than a boolean is the "behind a
 * newer one" case below: raising `WELCOME_TOUR_VERSION` has to put everybody
 * who is behind it back in front of the walkthrough, including the people who
 * finished the last one. "Reset everyone" is implemented as that raise and
 * nothing else — no migration, no script — and a boolean cannot express it.
 */
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  TIER_HIDDEN_LAB_TABS,
  TIER_HIDDEN_META_TABS,
} from "@/lib/experience-tier";
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

  it("still shows the whole app to every one of them", () => {
    const telling: Stage[] = ["welcome", "promises"];
    for (const input of [
      both,
      { ...both, hasHoldings: true },
      { ...both, classroomOnly: true },
    ]) {
      const stages = tourStages(input);
      for (const stage of telling) {
        expect(stages, JSON.stringify(input)).toContain(stage);
      }
      // What the app is comes before what it wants from you, every variant.
      expect(stages.indexOf("promises")).toBeLessThan(stages.indexOf("you"));
      expect(stages[0]).toBe("welcome");
      expect(stages.at(-1)).toBe("week");
    }
  });

  it("is six screens for somebody with nothing in it, and no more", () => {
    /*
      It was seven, and before that eleven. Each screen is one picture, one
      title and one line now; a seventh has to earn its place against the
      reader who closes a walkthrough that will not end.
    */
    expect(tourStages(both)).toHaveLength(6);
  });
});

/**
 * Every screen the walkthrough can reach draws something.
 *
 * `tourStages` decides the running order and `WelcomeTour.tsx` renders one
 * `stage === "..."` block per screen. Two lists, in two files, kept in
 * step by nothing, which is the shape of drift this repo keeps paying for:
 * a stage added to the order with no block behind it does not crash and
 * does not fail anything. It draws the heading and the sentence the shell
 * supplies, then nothing at all, under a counter cheerfully reading "Step
 * 4 of 11".
 *
 * The copy checks below would pass through that happily, because the copy
 * would be there. This reads the component's source rather than rendering
 * it: the repo's tests run without a DOM, and the question here is whether
 * a branch was written, which source answers exactly.
 */
describe("every screen in the walkthrough is actually built", () => {
  const rendered = new Set(
    [
      ...readFileSync("src/components/WelcomeTour.tsx", "utf8").matchAll(
        /stage === "([a-z0-9]+)"/g
      ),
    ].map((m) => m[1])
  );

  it("renders a block for every stage that can appear", () => {
    for (const variant of [
      tourStages({ hasHoldings: false, classroomOnly: false }),
      tourStages({ hasHoldings: true, classroomOnly: false }),
      tourStages({ hasHoldings: false, classroomOnly: true }),
    ]) {
      for (const stage of variant) {
        expect(rendered.has(stage), `${stage} has no block in WelcomeTour`).toBe(
          true
        );
      }
    }
  });

  it("does not carry a block for a screen nothing can reach", () => {
    const reachable = new Set([
      ...tourStages({ hasHoldings: false, classroomOnly: false }),
      ...tourStages({ hasHoldings: true, classroomOnly: false }),
      ...tourStages({ hasHoldings: false, classroomOnly: true }),
    ]);
    for (const stage of rendered) {
      expect(reachable.has(stage as never), `${stage} is drawn but unreachable`).toBe(
        true
      );
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
    expect(screenCopy("welcome", null).title).toContain("Upside Lab");
  });

  it("says the first screen is made up, on the first screen", () => {
    // Real companies, invented share counts, an invented week. If that stops
    // being said out loud, the screen reads as a record of something that
    // happened to a real company.
    expect(screenCopy("welcome", null).lede.toLowerCase()).toMatch(/made[ -]up/);
  });

  it("only claims a view once a tier has actually been settled", () => {
    expect(screenCopy("week", null).lede).not.toMatch(/set up for/i);
    expect(screenCopy("week", "Comfortable investor").lede).toContain(
      "Comfortable investor"
    );
  });

  it("keeps every line under the title to one short sentence or two", () => {
    /*
      The walkthrough before this one ran three-sentence ledes over screens
      that then explained themselves again, which is what made it a wall of
      text. The screen is the explanation; the line says what to do with it.
    */
    for (const stage of stages) {
      const { lede } = screenCopy(stage, "Comfortable investor");
      expect(lede.length, stage).toBeLessThanOrEqual(90);
      expect(lede.split(/[.?!](\s|$)/).filter((x) => x && x.trim()).length, stage)
        .toBeLessThanOrEqual(2);
    }
  });

  it("never tells the reader to skip, because Skip leaves the walkthrough", () => {
    // The footer's one skip button is the way out of the whole thing, so a
    // lede saying "skip this" sends somebody out of the screens after it.
    for (const stage of stages) {
      expect(screenCopy(stage, null).lede.toLowerCase(), stage).not.toContain(
        "skip"
      );
    }
  });

  it("calls a company a company, never a name", () => {
    const everything = stages
      .flatMap((s) => [screenCopy(s, null).title, screenCopy(s, null).lede])
      .join(" ");
    expect(everything).not.toMatch(/\bnames you\b|\bthe names\b/i);
  });

  it("says portfolio, never sheet or book", () => {
    const everything = stages
      .flatMap((s) => [screenCopy(s, null).title, screenCopy(s, null).lede])
      .join(" ")
      .toLowerCase();
    expect(everything).not.toMatch(/\byour book\b|\bthe book\b|\bsheet\b/);
  });
});

/*
  The walkthrough may not describe a gate that does not exist.

  `TIER_HIDDEN_META_TABS` and `TIER_HIDDEN_LAB_TABS` are empty on every tier
  (experience-tier.ts): no room is hidden from anybody, and AGENTS.md records
  that as a decision rather than an oversight. `AboutYouScreen` reads those
  tables so its dock preview cannot drift, and that was taken to mean the
  walkthrough as a whole was safe. It was not. Two pieces of hand-written
  copy still promised a locked room: `RoomsScreen`'s Lab description said it
  "arrives once you say you are comfortable, and a Risk view once you say
  very experienced", and the first answer's own detail line said "Lab waits
  until you ask for it". Both told somebody who had just called themselves
  new that a room was being withheld, which is a thing they can find out is
  untrue by pressing it.

  What the first answer really decides is which panels start folded away.
  This fails if a tour file starts promising otherwise again.
*/
describe("the tour never promises a room that is already there", () => {
  const TOUR_FILES = [
    "src/components/tour/AboutYouScreen.tsx",
    "src/components/tour/PromisesScreen.tsx",
    "src/components/tour/FirstWeekScreen.tsx",
    "src/components/WelcomeTour.tsx",
    "src/lib/welcome-tour.ts",
  ];

  it("has no tier gate left to describe", () => {
    for (const tier of ["novice", "investor", "advanced"] as const) {
      expect(TIER_HIDDEN_META_TABS[tier]).toEqual([]);
      expect(TIER_HIDDEN_LAB_TABS[tier]).toEqual([]);
    }
  });

  for (const file of TOUR_FILES) {
    it(`${file} does not say a room waits, arrives or is off the bar`, () => {
      const src = readFileSync(file, "utf8");
      // Strings only: the comments in these files discuss the removed gate
      // on purpose, so that the next person to want one meets the argument.
      const strings = [...src.matchAll(/"([^"\\]{12,})"/g)].map((m) => m[1]);
      for (const line of strings) {
        expect(
          line,
          `${file}: no room is hidden on any tier, so the walkthrough cannot promise one arrives later`
        ).not.toMatch(
          /\b(lab|risk|a room|every room)\b[^.]*\b(waits|arrives|unlocks|off the bar|once you)\b/i
        );
      }
    });
  }
});

/*
  One way forward, and it is the footer's.

  The ground rules screen used to keep its own place in a sequence and draw
  its own "Next one" button inside its card, while the footer carried the
  big "Next" under the thumb. Two forward affordances, and the big one
  jumped the whole stage, throwing away every claim after the first, which
  is what happened to the first person who read it. That screen is gone,
  and the rule it taught stays: no screen draws a forward button of its
  own, and the walkthrough's only way forward is the footer.
*/
describe("the walkthrough has one way forward", () => {
  const SHELL = readFileSync("src/components/WelcomeTour.tsx", "utf8");

  it("draws Next and Finish once each, in the footer", () => {
    expect(SHELL.match(/\{nextLabel\}/g) ?? []).toHaveLength(1);
    expect(SHELL.match(/"Finish"/g) ?? []).toHaveLength(1);
  });

  for (const file of [
    "src/components/tour/PromisesScreen.tsx",
    "src/components/tour/AboutYouScreen.tsx",
    "src/components/tour/FirstWeekScreen.tsx",
  ]) {
    it(`${file} draws no forward button of its own`, () => {
      const src = readFileSync(file, "utf8");
      expect(src).not.toMatch(/>\s*(Next|Continue|Next one)\s*</);
    });
  }
});
