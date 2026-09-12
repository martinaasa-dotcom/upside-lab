import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { BestDays } from "@/components/playbook/BestDays";
import { IdeaDeck } from "@/components/playbook/IdeaDeck";
import { PlaybookTerms } from "@/components/playbook/PlaybookTerms";
import { RecoveryGap } from "@/components/playbook/RecoveryGap";
import { TemperatureLadder } from "@/components/playbook/TemperatureLadder";
import { bestDaysFromCloses } from "@/lib/market-temperature";

/*
  RENDER IT AND READ WHAT COMES OUT, BECAUSE THIS CLASS OF FAULT IS
  INVISIBLE IN THE SOURCE.

  JSX drops the newline between an expression and the text on the line
  after it, so `{read.days}` followed by `trading days` on the next line
  renders as "2514trading days". It reads correctly in the editor, every
  test passed, the typechecker is perfectly happy, and it is a figure this
  app states as fact with the next word welded onto it. It shipped in the
  first version of this room and was found in a screenshot.

  So the guard is to render the real components and read the sentences.
  Prose is what this room is mostly made of, which makes it worth having
  the check here rather than trusting anybody to remember `{" "}`.
*/

/*
  ONLY REACT'S OWN SEPARATOR JOINS WITH NOTHING. EVERY REAL TAG IS A SPACE.

  Two adjacent JSX children render as `2514<!-- -->trading days`, and a
  browser draws that with no gap at all, which is the fault this test
  exists for. Any real element between two pieces of text may be separated
  by the layout instead: a flex row's gap, a span laid out as a block, a
  paragraph break. Treating those as nothing invents welded words that a
  reader never sees, and the first two runs of this test did exactly that,
  reporting a band's label welded to its score range when a `gap-2` sits
  between them on screen.

  So the comment is the only thing that closes up. That keeps the check
  narrow enough to be trusted, and narrow is the point: it is the JSX
  whitespace trap it is here to catch, not typography in general.
*/
function textOf(markup: string): string {
  return markup
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&ldquo;|&rdquo;|&quot;/g, '"')
    .replace(/&rsquo;|&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function tenYears() {
  const closes: number[] = [100];
  const at: string[] = [];
  const start = Date.UTC(2016, 0, 4);
  let seed = 11;
  for (let i = 0; i < 2515; i++) {
    at.push(new Date(start + i * 86_400_000 * 1.45).toISOString().slice(0, 10));
    if (i === 0) continue;
    seed = (seed * 1103515245 + 12345) % 2147483648;
    closes.push(closes[i - 1]! * (1 + (seed / 2147483648 - 0.47) * 0.026));
  }
  return bestDaysFromCloses(closes, at)!;
}

const read = tenYears();

const SURFACES: Record<string, string> = {
  "the ladder": renderToStaticMarkup(
    createElement(TemperatureLadder, {
      score: 19,
      asOf: new Date().toISOString(),
    })
  ),
  "the ladder with no reading": renderToStaticMarkup(
    createElement(TemperatureLadder, { score: null })
  ),
  "the recovery gap": renderToStaticMarkup(createElement(RecoveryGap)),
  "the ten-year read": renderToStaticMarkup(
    createElement(BestDays, { read })
  ),
  "the idea deck": renderToStaticMarkup(createElement(IdeaDeck)),
  /*
    NEITHER `IdeaDeck` NOR `TemperatureLadder` EVER OPENS A CARD IN A STATIC
    RENDER, SO THE SURFACES ABOVE NEVER REACH `PlaybookTerms` AT ALL.

    A card's body is mounted only once its `useState` flips to `open`, and
    the ladder's own auto-open runs from a `useEffect`, which does not run
    under `renderToStaticMarkup`. So every card in "the idea deck" and "the
    ladder" above renders collapsed, and the words-you-can-tap row at the
    foot of an opened body -- the one surface in this whole room whose job
    is teaching a word -- had never once been rendered by this file's own
    "render it and read it" check. Rendering it directly here is what
    closes that gap, rather than trusting the two collapsed surfaces to
    cover a component they structurally cannot reach.
  */
  "the tappable words on a card": renderToStaticMarkup(
    createElement(PlaybookTerms, { terms: ["market", "recent-range"] })
  ),
  "the tappable words on a card naming one word": renderToStaticMarkup(
    createElement(PlaybookTerms, { terms: ["compounding"] })
  ),
};

describe("every sentence this room renders", () => {
  it.each(Object.keys(SURFACES))("reads as words on %s", (name) => {
    const text = textOf(SURFACES[name]!);
    expect(text.length).toBeGreaterThan(40);
    /*
      A figure with a word welded to it. Three letters or more, so a real
      unit stuck to its number ("10y", "4x") is not swept up, and case
      insensitive so a capital does not slip past.
    */
    const welded = text.match(/\d[a-z]{3,}/gi) ?? [];
    expect(welded, `run-together text in ${name}`).toEqual([]);
    // The mirror image: a word welded to the figure after it.
    const before = text.match(/[a-z]{3,}\d/gi) ?? [];
    expect(before, `run-together text in ${name}`).toEqual([]);
  });

  it.each(Object.keys(SURFACES))("uses no dash as a clause break on %s", (name) => {
    expect(textOf(SURFACES[name]!)).not.toMatch(/[—–]/);
  });
});

describe("the ten-year read states its own window", () => {
  const text = textOf(SURFACES["the ten-year read"]!);

  it("prints the dates it was worked out from", () => {
    expect(text).toContain(read.from);
    expect(text).toContain(read.to);
  });

  it("prints the worst-days figure beside the best-days one", () => {
    expect(text).toMatch(/out of the market for the best/i);
    expect(text).toMatch(/dodging the worst/i);
  });
});

describe("the ladder says whose number it is", () => {
  it("names the index and stamps the reading", () => {
    const text = textOf(SURFACES["the ladder"]!);
    expect(text).toMatch(/Fear and Greed index/i);
    expect(text).toMatch(/Read just now/i);
  });

  it("claims no reading and no stamp when none landed", () => {
    const text = textOf(SURFACES["the ladder with no reading"]!);
    expect(text).toMatch(/has not landed yet/i);
    expect(text).not.toMatch(/\bRead \d/i);
    expect(text).not.toMatch(/out of 100 today/i);
  });
});

/*
  THE LABEL HAS TO SAY WHAT THE UNDERLINE DOES, NOT JUST NAME THE WORDS.

  "Words on this one" named the row and left the dotted underline to
  explain itself, which read as unexplained clutter rather than a control:
  a reader who does not already know the underlined-word-you-can-look-up
  convention has no way to learn it from that label. The label states the
  action now, and both branches -- one word and several -- are checked
  against the real markup rather than against the source string, since a
  label that reads correctly in the file and wrong on screen is exactly
  the class of fault this test file exists to catch.
*/
describe("the tappable words say what tapping one does", () => {
  it("names the action for more than one word", () => {
    const text = textOf(SURFACES["the tappable words on a card"]!);
    expect(text).toMatch(/^Tap a word for what it means\b/);
    expect(text).toContain("The market");
    expect(text).toContain("Recent range");
  });

  it("names the action for exactly one word, and stays singular", () => {
    const text = textOf(SURFACES["the tappable words on a card naming one word"]!);
    expect(text).toMatch(/^Tap this word for what it means\b/);
    expect(text).toContain("Compounding");
  });

  it("renders each word as something you can actually open", () => {
    const markup = SURFACES["the tappable words on a card"]!;
    expect(markup).toContain('aria-label="What this means: The market"');
    expect(markup).toContain('aria-label="What this means: Recent range"');
    expect(markup).toMatch(/data-slot="explain"[^>]*>The market</);
  });
});
