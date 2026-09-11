import { describe, expect, it } from "vitest";

import { describeCompany } from "@/lib/company-label";
import { SAMPLE_HOLDINGS } from "@/lib/sample-portfolio";

describe("describeCompany", () => {
  it("describes most of the sample a stranger is shown, not two of it", () => {
    /*
      Pulse read one thirty-name table and printed a line under $NVDA and
      $AAPL and nothing at all under the other six, on the portfolio the
      landing page hands to anybody who presses "Look around". The words
      were already written and already shipping in the Risk room; this is
      the room that could not see them.

      Six of the eight, not all eight. Nike and Disney are in none of this
      app's tables, so they still get no line, which is the rule working
      rather than the rule failing: nothing here guesses. They are worth
      knowing about, because the Risk room reasons about them from its own
      catch-all for the same reason.
    */
    const described = SAMPLE_HOLDINGS.filter(
      (row) => describeCompany(row.ticker) !== ""
    );
    expect(described.length).toBe(6);
    expect(
      SAMPLE_HOLDINGS.filter((row) => describeCompany(row.ticker) === "").map(
        (row) => row.ticker
      )
    ).toEqual(["NKE", "DIS"]);
  });

  it("describes the ordinary large companies a beginner actually owns", () => {
    expect(describeCompany("KO")).toBe("Everyday household goods");
    expect(describeCompany("MSFT")).toBe("Cloud computing for businesses");
    expect(describeCompany("AMZN")).toBe("Online shopping and cloud computing");
    expect(describeCompany("JPM")).toBe("A large bank");
    expect(describeCompany("XOM")).toBe("Oil and gas");
  });

  it("prefers the hand-written entry where there is one", () => {
    // `TICKER_SECTORS` was written about this company; the Risk table's
    // "Phones and computers" is the broader answer and loses.
    expect(describeCompany("AAPL")).toBe("Phones, computers and software");
  });

  it("says nothing rather than guessing", () => {
    /*
      The catch-all the Risk table falls back to is not a description, so
      it is dropped. A bare cashtag is better than a sentence that is
      wrong about somebody's money, which is the rule Pulse already
      carried and this keeps.
    */
    expect(describeCompany("ZZZZ")).toBe("");
    expect(describeCompany("")).toBe("");
    expect(describeCompany("   ")).toBe("");
  });

  it("names a coin by its stored symbol, never by a bare alias", () => {
    /*
      A holding is stored as the full symbol, and the bare alias is a
      different instrument: BTC on its own is a Grayscale trust, SOL is
      Emeren Group and LINK is Interlink Electronics. Calling a bare BTC
      "Bitcoin" is the mislabelling this app already guards against
      elsewhere, so it must not start here.
    */
    expect(describeCompany("BTC-USD")).toBe("Bitcoin");
    expect(describeCompany("BTC")).not.toBe("Bitcoin");
    expect(describeCompany("VOO")).toMatch(/fund/i);
  });
});

describe("describeCompany with the provider's sector", () => {
  it("describes the two the sample could not, and the rest of the market", () => {
    /*
      Nike and Disney are in none of this app's hand-kept tables, so they
      got no line at all on Pulse -- on the portfolio every stranger is
      shown first. The provider knows what they are, and the profile for
      that kind of business was already written.
    */
    expect(describeCompany("NKE", "Shops, brands and travel")).toBe(
      "Shops, brands and travel"
    );
    expect(describeCompany("DIS", "Media, telecoms and internet")).toBe(
      "Media, telecoms and internet"
    );
    expect(describeCompany("O", "Property")).toBe("Property companies");
    expect(describeCompany("NEE", "Electricity, water and gas")).toBe(
      "Water, gas and electricity"
    );
  });

  it("keeps the finer hand-written answer where there is one", () => {
    /*
      A sector is the coarsest true thing about a company. Where this app
      has written a sentence about the company itself, that wins: the
      provider would only say "Technology and software" for both of these.
    */
    expect(describeCompany("MSFT", "Technology and software")).toBe(
      "Cloud computing for businesses"
    );
    expect(describeCompany("AAPL", "Technology and software")).toBe(
      "Phones, computers and software"
    );
  });

  it("still says nothing when the provider had nothing either", () => {
    expect(describeCompany("ZZZZ", null)).toBe("");
    expect(describeCompany("ZZZZ", undefined)).toBe("");
  });
});
