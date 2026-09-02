import { describe, expect, it } from "vitest";
import { humanizeMargusText } from "@/lib/ai/humanize-copy";

/*
  A cashtag is a company's name, and the scrubber rewrites words.

  MARGUS_PERSONA tells the model to write every ticker as a cashtag, every
  mention, everywhere. One substitution turns `$spot` into "today's price",
  because a price the app could not read used to be interpolated as the
  literal word, and it is case-insensitive. So a reader holding Spotify was
  shown "today's price is up 4% today after results above what people
  expected", on every surface Margus writes.

  The same collision waits for any ticker that happens to be a word the
  scrubber rewrites, which is why the fix masks all of them rather than
  special-casing one.
*/

describe("a cashtag survives the humanizer", () => {
  it("leaves $SPOT alone", () => {
    const out = humanizeMargusText(
      "$SPOT is up 4% today after results above what people expected."
    );
    expect(
      out,
      `Spotify's ticker was rewritten into prose, so the sentence no longer ` +
        `names the company it is about.`
    ).toContain("$SPOT");
    expect(out).not.toContain("today's price is up 4%");
  });

  it("still fixes the lowercase placeholder it was written for", () => {
    // `$spot` lowercase is the interpolation failure, not a company.
    expect(humanizeMargusText("A level to think about: around $spot")).toContain(
      "today's price"
    );
    expect(humanizeMargusText("around $spot")).not.toContain("$spot");
  });

  it("leaves other word-shaped tickers alone", () => {
    for (const tag of ["$ALL", "$ON", "$IT", "$SO", "$OR", "$BOOK"]) {
      expect(humanizeMargusText(`${tag} moved today.`)).toContain(tag);
    }
  });

  it("still rewrites the words themselves when they are not tickers", () => {
    expect(humanizeMargusText("your book is up")).toContain("your portfolio");
  });
});
