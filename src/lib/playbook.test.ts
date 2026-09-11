import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ratingForScore } from "@/lib/market/fear-greed";
import {
  allQuotes,
  bandCuts,
  bandForScore,
  bandWidths,
  IDEA_THEMES,
  IDEAS,
  ladderPosition,
  ownProse,
  TEMPERATURE_BANDS,
} from "@/lib/playbook";

/*
  The Playbook is the one room in this app whose whole content is opinion
  about how to invest, so it is also the one that most needs a floor under
  it. These are that floor, and each of them is a rule from the file's own
  note rather than a restatement of today's copy: an assertion that breaks
  on a reworded sentence costs more than it protects.
*/

describe("the ladder is the published one", () => {
  it("agrees with the band function for every score", () => {
    for (let score = 0; score <= 100; score++) {
      const band = bandForScore(score);
      expect(band.label.toLowerCase()).toBe(ratingForScore(score));
      expect(score).toBeGreaterThanOrEqual(band.range[0]);
      expect(score).toBeLessThanOrEqual(band.range[1]);
    }
  });

  it("covers 0 to 100 with no gap and no overlap", () => {
    let expected = 0;
    for (const band of TEMPERATURE_BANDS) {
      expect(band.range[0]).toBe(expected);
      expect(band.range[1]).toBeGreaterThan(band.range[0]);
      expected = band.range[1] + 1;
    }
    expect(expected).toBe(101);
  });

  /*
    The track paints a zone per band and a hairline at each boundary, and
    those used to be two separate sums: the widths from each band's own
    span, which totals 101 over 0 to 100 inclusive, and the hairlines from
    each band's low end. Flex shrank the zones to fit and left the
    hairlines where they were, so measured on an 800px track every divider
    sat 2 to 6 pixels to the right of the tone change it marks. One set of
    cut points feeds both now.
  */
  it("cuts between the bands, so the widths cover the track exactly", () => {
    const widths = bandWidths();
    expect(widths).toHaveLength(TEMPERATURE_BANDS.length);
    const total = widths.reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(100, 10);
    for (const w of widths) expect(w).toBeGreaterThan(0);
  });

  it("puts each cut between the bands it separates", () => {
    const cuts = bandCuts();
    expect(cuts).toHaveLength(TEMPERATURE_BANDS.length - 1);
    cuts.forEach((cut, i) => {
      expect(cut).toBeGreaterThan(TEMPERATURE_BANDS[i]!.range[1] - 1);
      expect(cut).toBeLessThan(TEMPERATURE_BANDS[i + 1]!.range[0] + 1);
    });
  });

  it("draws every score inside the zone its own band names", () => {
    const cuts = bandCuts();
    const edges = [0, ...cuts, 100];
    for (let score = 0; score <= 100; score++) {
      const i = TEMPERATURE_BANDS.indexOf(bandForScore(score));
      expect(score, `${score} falls outside the zone drawn for its band`)
        .toBeGreaterThanOrEqual(edges[i]!);
      expect(score).toBeLessThanOrEqual(edges[i + 1]!);
    }
  });

  it("puts a score where the reader can see it on the track", () => {
    expect(ladderPosition(0)).toBe(0);
    expect(ladderPosition(50)).toBe(0.5);
    expect(ladderPosition(100)).toBe(1);
    // A reading outside the published range is clamped, never drawn off it.
    expect(ladderPosition(140)).toBe(1);
    expect(ladderPosition(-8)).toBe(0);
  });
});

describe("a quotation is the app reporting what somebody said", () => {
  /*
    This is the rule the whole room rests on. Several of the best sentences
    in investing are grammatically orders, and the only thing that makes
    printing one legitimate in a product that may not give advice is that
    it carries a name a reader can go and check. A quote with no author is
    the app giving the instruction itself.
  */
  it("never prints one without an author", () => {
    for (const quote of allQuotes()) {
      expect(quote.text.trim().length).toBeGreaterThan(0);
      expect(quote.author.trim().length).toBeGreaterThan(0);
    }
  });

  it("marks an attribution that is thinner than the name suggests", () => {
    const hedged = allQuotes().filter((q) =>
      /often attributed|attributed to/i.test(q.author)
    );
    for (const quote of hedged) {
      expect(
        quote.attribution,
        `${quote.author} hedges in the name and has to say why`
      ).toBeTruthy();
    }
  });
});

/*
  `ownProse()` is the content module. The room's panel headings and
  subtitles are written in the component, so the copy rules below would
  have run over everything except the sentences a reader meets first. Both
  of the claims-about-the-reader this suite now refuses were in exactly
  that gap.
*/
function surfaceProse(): string[] {
  const panel = readFileSync(
    join(process.cwd(), "src/components/playbook/PlaybookPanel.tsx"),
    "utf8"
  );
  const subtitles = [...panel.matchAll(/(?:title|subtitle)="([^"]+)"/g)].map(
    (m) => m[1] ?? ""
  );
  expect(subtitles.length).toBeGreaterThan(4);
  return [...ownProse(), ...subtitles];
}

describe("the app's own prose never instructs", () => {
  /*
    Deliberately runs over `ownProse()`, which excludes quotations by
    construction. An instruction word inside quotation marks with a name on
    it is a report. The same word in the app's own voice is advice, which
    this product may not give.
  */
  const INSTRUCTION =
    /\b(you should|you must|we recommend|buy now|sell now|sell everything|buy the dip|time to buy|time to sell|guaranteed)\b/i;
  const VERDICT =
    /\b(undervalued|overvalued|a strong buy|a strong sell|cheap right now)\b/i;

  it("uses no instruction word", () => {
    const bad = surfaceProse().filter((line) => INSTRUCTION.test(line));
    expect(bad).toEqual([]);
  });

  it("uses no verdict word", () => {
    const bad = surfaceProse().filter((line) => VERDICT.test(line));
    expect(bad).toEqual([]);
  });

  /*
    A CLAIM ABOUT THE READER IS THE ONE THING NOBODY CAN CHECK.

    The whole premise of this room is that every sentence in it is either a
    figure a reader can verify or an argument they can argue with. "It
    takes about ten seconds to understand" and "it changes how most people
    think about risk for good" are neither: they are the app telling
    somebody what they are about to feel, they flatter the writing rather
    than the reader, and being wrong about them is invisible. Both shipped
    in the first draft. What replaced them were the figures themselves, a
    quarter off needing a third back and half off needing a double.
  */
  const ABOUT_THE_READER =
    /\b(takes (?:about )?(?:a few |ten |five |thirty )?seconds|changes how (?:you|most people|anybody) think|you(?:'ll| will) never look at|will blow your mind|life[- ]changing|once you see (?:it|this))\b/i;

  it("never tells the reader what they are about to feel", () => {
    const bad = surfaceProse().filter((line) => ABOUT_THE_READER.test(line));
    expect(bad).toEqual([]);
  });

  it("uses no dash as a clause break", () => {
    const bad = [...surfaceProse(), ...allQuotes().map((q) => q.text)].filter(
      (line) => /[—–]/.test(line)
    );
    expect(bad).toEqual([]);
  });
});

describe("every principle carries the way it goes wrong", () => {
  /*
    Not a nicety and not a hedge. A principle printed without its opposite
    is a reason to do the thing the reader already wanted to do, which is
    the whole failure mode of investing quotations. If a band or an idea
    can be added here without one, the room stops teaching and starts
    flattering.
  */
  it("on every band", () => {
    for (const band of TEMPERATURE_BANDS) {
      expect(band.goesWrong.trim().length, band.id).toBeGreaterThan(60);
      expect(band.check.trim().length, band.id).toBeGreaterThan(20);
      expect(band.idea.trim().length, band.id).toBeGreaterThan(60);
    }
  });

  it("on every idea", () => {
    for (const idea of IDEAS) {
      expect(idea.goesWrong.trim().length, idea.id).toBeGreaterThan(60);
      expect(idea.meaning.trim().length, idea.id).toBeGreaterThan(60);
      expect(idea.inPractice.trim().length, idea.id).toBeGreaterThan(20);
    }
  });
});

describe("the deck is navigable", () => {
  it("gives every idea a unique id and a theme with a heading", () => {
    const ids = new Set(IDEAS.map((i) => i.id));
    expect(ids.size).toBe(IDEAS.length);
    for (const idea of IDEAS) {
      expect(
        IDEA_THEMES.some((t) => t.id === idea.theme),
        `${idea.id} has theme ${idea.theme}`
      ).toBe(true);
    }
  });

  /*
    Two ideas, not one. The subjects are headings rather than a filter, so a
    theme with a single card under it draws a heading over one thing, which
    reads as a section whose content failed to arrive rather than as a short
    answer. Cost and The crowd were both in that state when the filter was
    removed, and the fix was the ideas each was missing (what holding cash
    quietly costs, what trading often costs) rather than dropping a subject.
  */
  it("leaves no theme heading standing over fewer than two cards", () => {
    for (const theme of IDEA_THEMES) {
      const count = IDEAS.filter((i) => i.theme === theme.id).length;
      expect(count, `${theme.id} has ${count} idea(s) under its heading`)
        .toBeGreaterThan(1);
    }
  });
});

describe("market words are only printed where they are being defined", () => {
  /*
    The standing ban is off in this room in exactly the narrow way
    AGENTS.md allows: the plain phrase is the sentence and the outside word
    arrives after it, named as somebody else's word, in a clause the reader
    can skip. So the word may appear only in the shape "called X", never on
    its own, and never in a title, which is a heading rather than a lesson.
  */
  const TEACHABLE = /\b(volatility|correction|liquidity|leverage)\b/gi;

  it("introduces one only as something you will see it called", () => {
    for (const line of ownProse()) {
      for (const match of line.matchAll(TEACHABLE)) {
        const before = line.slice(Math.max(0, match.index - 30), match.index);
        expect(
          /\bcalled\s(a\s)?$/i.test(before),
          `"${match[0]}" is printed without being introduced: ...${before}${match[0]}`
        ).toBe(true);
      }
    }
  });

  it("never puts one in a heading", () => {
    for (const idea of IDEAS) {
      expect(TEACHABLE.test(idea.title), idea.id).toBe(false);
      TEACHABLE.lastIndex = 0;
    }
  });
});

/*
  A CROSS-REFERENCE THAT SENDS SOMEBODY THE WRONG WAY IS WORSE THAN NONE.

  Two ideas pointed "further down this page" at the two arithmetic
  sections, which sit ABOVE the idea deck, so a reader following either one
  scrolled to the end, found nothing, and had no reason to trust the next
  pointer. Naming the section instead is both correct and stable under
  reordering, and this is what stops the name drifting away from the
  heading it claims to be.
*/
describe("a pointer at another section names one that exists", () => {
  const panel = readFileSync(
    join(process.cwd(), "src/components/playbook/PlaybookPanel.tsx"),
    "utf8"
  );
  const titles = [...panel.matchAll(/title="([^"]+)"/g)].map((m) =>
    (m[1] ?? "").toLowerCase()
  );

  it("finds the panel's own headings to check against", () => {
    expect(titles.length).toBeGreaterThan(2);
  });

  it("points only at headings this room actually has", () => {
    const pointers = ownProse().flatMap((line) =>
      [...line.matchAll(/on this page, under ([^,.:]+)/gi)].map((m) =>
        (m[1] ?? "").trim().toLowerCase()
      )
    );
    expect(pointers.length).toBeGreaterThan(0);
    for (const pointer of pointers) {
      expect(titles, `"${pointer}" is not a heading in this room`).toContain(
        pointer
      );
    }
  });

  it("never sends a reader up the page by calling it down", () => {
    const bad = ownProse().filter((line) => /further down this page/i.test(line));
    expect(bad).toEqual([]);
  });
});

/*
  The one door a beginner meets. It is on the market-reading card because
  that card has just raised the question the Playbook answers, and it is
  the one panel Home draws for an empty portfolio as well as a full one.
  Read from source rather than rendered, which is what the rest of this
  repo does for a wiring rule: the point is that the wiring cannot be
  quietly removed, not that a particular pixel is in a particular place.
*/
describe("Home has a door into this room", () => {
  const read = (f: string) => readFileSync(join(process.cwd(), f), "utf8");
  const widget = read("src/components/MarketSentimentWidget.tsx");
  const home = read("src/components/OverviewDashboard.tsx");
  const lab = read("src/components/LabSheet.tsx");

  it("draws the door on the card an empty portfolio still gets", () => {
    expect(widget).toMatch(/PlaybookDoor/);
    expect(widget).toMatch(/bandForScore/);
  });

  it("is handed a way to open the room, and draws nothing without one", () => {
    expect(widget).toMatch(/onOpenPlaybook \? \(/);
    expect(home).toMatch(/onOpenPlaybook=\{/);
    expect(home).toMatch(/onOpenLab\("playbook"\)/);
  });

  it("lands on the tab it names", () => {
    expect(lab).toMatch(/playbook: "playbook"/);
  });

  it("never turns the door's own label into an instruction", () => {
    const label = widget.slice(widget.indexOf("function PlaybookDoor"));
    expect(label).not.toMatch(
      /\b(you should|buy now|sell now|time to buy|time to sell)\b/i
    );
  });
});

/*
  The fetcher decides whether to store a snapshot. `preferSentimentSnapshot`
  can hand back a merge that is neither of its inputs, so the test has to be
  against the row already held, never against the raw fetch. See the
  matching case in `market-temperature.test.ts` for why it is reachable.
*/
describe("the market snapshot still caches a merged reading", () => {
  it("compares the answer against the cached row, not the raw fetch", () => {
    const src = readFileSync(
      join(process.cwd(), "src/lib/market/sentiment-fetch.ts"),
      "utf8"
    );
    // Only the positive assertion. The note above that line in the source
    // quotes the old, wrong test to explain it, so a scan for the absence
    // of that spelling fails on the comment that exists to prevent it.
    expect(src).toMatch(/chosen !== prev/);
  });
});

/*
  A body opened by a button says which button opened it, or a reader on a
  screen reader lands in a block of prose with nothing tying it to the
  control they pressed. `aria-expanded` alone says a control opens
  something and not what.
*/
describe("the accordions name what they open", () => {
  const read = (f: string) => readFileSync(join(process.cwd(), f), "utf8");
  const files = [
    "src/components/playbook/TemperatureLadder.tsx",
    "src/components/playbook/IdeaDeck.tsx",
  ];

  it.each(files)("associates the button and its body in %s", (file) => {
    const src = read(file);
    expect(src).toMatch(/aria-expanded=\{open\}/);
    expect(src).toMatch(/aria-controls=\{bodyId\}/);
    expect(src).toMatch(/id=\{headId\}/);
    expect(src).toMatch(/role="region"/);
    expect(src).toMatch(/aria-labelledby=\{headId\}/);
  });

  /*
    The repo's accordion idiom for a transition a reader did not ask for.
    `motion-reduce:duration-0` is what `AlertCards` uses; the glyph turning
    is the only motion in this room and it has to stand down with the rest.
  */
  it.each(files)("stands its one moving glyph down under reduced motion in %s", (file) => {
    const src = read(file);
    const turns = [...src.matchAll(/transition-transform[^"]*/g)].map((m) => m[0]);
    expect(turns.length).toBeGreaterThan(0);
    for (const cls of turns) {
      expect(cls, `"${cls}" keeps animating under reduced motion`).toMatch(
        /motion-reduce:duration-0/
      );
    }
  });
});

/*
  Lab already prints its own heading, its tab row and a sentence
  introducing whichever tab is open, so a hero panel inside the room is a
  second heading and a second subtitle for one thing.
*/
describe("this room does not print a second heading over Lab's own", () => {
  it("has no hero panel", () => {
    const src = readFileSync(
      join(process.cwd(), "src/components/playbook/PlaybookPanel.tsx"),
      "utf8"
    );
    expect(src).not.toMatch(/\bhero\b\s*$/m);
    expect(src).not.toMatch(/title="Playbook"/);
  });

  it("keeps the tab's own introduction, which is what the hero said", () => {
    const lab = readFileSync(
      join(process.cwd(), "src/components/LabSheet.tsx"),
      "utf8"
    );
    expect(lab).toMatch(/playbook:\s*\n?\s*"/);
  });
});
