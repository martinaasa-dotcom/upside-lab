/**
 * A ticker is stored data, and two import paths write one without checking
 * its shape, so anything can end up on a holding. `scanLineBody` used to
 * build a regular expression out of it, which meant a holding saved as
 * "A(B" threw while Pulse rendered and took the room down for the reader
 * and every co-owner of the portfolio.
 */
import { describe, expect, it } from "vitest";
import { scanLineBody } from "@/lib/thesis-pulse";

describe("scanLineBody", () => {
  it("survives a ticker carrying regular expression punctuation", () => {
    for (const ticker of ["A(B", "A)B", "A[B", "A*B", "A+B", "A?B", "A\\B", "A|B"]) {
      expect(() => scanLineBody(ticker, "Something happened"), ticker).not.toThrow();
      expect(scanLineBody(ticker, "Something happened")).toBe("Something happened");
    }
  });

  it("still strips the cashtag the line opens with", () => {
    expect(scanLineBody("NBIS", "$NBIS  Looks like a chase.")).toBe(
      "Looks like a chase"
    );
    expect(scanLineBody("VUAA.DE", "VUAA.DE  Steady week.")).toBe("Steady week");
  });

  it("matches the cashtag whatever case the model wrote it in", () => {
    expect(scanLineBody("NBIS", "$nbis  A strong day.")).toBe("A strong day");
  });

  it("leaves a line that only starts with the same letters alone", () => {
    // $NBIS is a prefix of $NBISX, and stripping it would leave "X ...".
    expect(scanLineBody("NBIS", "$NBISX moved today")).toBe("$NBISX moved today");
  });

  it("keeps the whole line when stripping would leave nothing", () => {
    expect(scanLineBody("NBIS", "$NBIS")).toBe("$NBIS");
  });
});
