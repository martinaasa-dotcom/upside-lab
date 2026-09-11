import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { BestDays } from "@/components/playbook/BestDays";
import { IdeaDeck } from "@/components/playbook/IdeaDeck";
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
