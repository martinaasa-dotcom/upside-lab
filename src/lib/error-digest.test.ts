import { describe, expect, it } from "vitest";
import {
  decideDigest,
  digestEmail,
  errorClassOf,
  groupErrorClasses,
  type ErrorRow,
} from "./error-digest";

/*
  The digest only helps if two occurrences of one fault land in one class
  and two different faults never do. The folding rules are the whole of
  that, so they are pinned here with the messages this app actually
  produces, and the send decision is pinned so a quiet day stays quiet.
*/

function row(message: string, path = "/api/portfolios"): ErrorRow {
  return { source: "server", message, path, created_at: "2026-08-30T05:00:00Z" };
}

describe("errorClassOf", () => {
  it("folds the parts that vary between occurrences of one fault", () => {
    const a = errorClassOf(
      "server",
      'duplicate key value violates unique constraint "portfell_holdings_portfolio_id_ticker_key"'
    );
    const b = errorClassOf(
      "server",
      'duplicate key value violates unique constraint "portfell_profiles_pkey"'
    );
    // Quoted identifiers fold: the sentence is the fault, the sample in
    // the mail carries the exact text.
    expect(a).toBe(b);

    expect(
      errorClassOf(
        "server",
        "portfolio 4c9f2a51-9b1c-4f6f-9d3a-1b2c3d4e5f60 not found"
      )
    ).toBe(
      errorClassOf(
        "server",
        "portfolio 11111111-2222-3333-4444-555555555555 not found"
      )
    );

    expect(errorClassOf("server", "quote fetch failed after 3 tries")).toBe(
      errorClassOf("server", "quote fetch failed after 12 tries")
    );

    expect(
      errorClassOf("server", "letter to carol@example.com bounced")
    ).toBe(errorClassOf("server", "letter to dave@work.example bounced"));
  });

  it("keeps different faults apart", () => {
    expect(errorClassOf("server", "quote fetch failed")).not.toBe(
      errorClassOf("server", "snapshot write failed")
    );
    // The same sentence from the client and the server is two classes:
    // they have different owners and different fixes.
    expect(errorClassOf("client", "boom")).not.toBe(
      errorClassOf("server", "boom")
    );
  });
});

describe("groupErrorClasses", () => {
  it("counts a class across occurrences and keeps a real sample", () => {
    const classes = groupErrorClasses([
      row("portfolio 4c9f2a51-9b1c-4f6f-9d3a-1b2c3d4e5f60 not found"),
      row("portfolio 11111111-2222-3333-4444-555555555555 not found", "/pulse"),
      row("snapshot write failed"),
    ]);
    expect(classes).toHaveLength(2);
    expect(classes[0].count).toBe(2);
    expect(classes[0].sample).toContain("4c9f2a51");
    expect(classes[0].paths).toEqual(["/api/portfolios", "/pulse"]);
  });

  it("ignores rows with no message rather than inventing a class", () => {
    expect(
      groupErrorClasses([
        { source: "server", message: "  ", path: null, created_at: null },
      ])
    ).toEqual([]);
  });
});

describe("decideDigest", () => {
  const known = groupErrorClasses([row("quote fetch failed after 3 tries")]);

  it("a quiet day sends nothing", () => {
    const decision = decideDigest(known, known);
    expect(decision.newClasses).toEqual([]);
    expect(decision.spike).toBe(false);
    expect(decision.shouldSend).toBe(false);
  });

  it("a new class sends, however small", () => {
    const current = groupErrorClasses([
      row("quote fetch failed after 3 tries"),
      row("snapshot write failed"),
    ]);
    const decision = decideDigest(current, known);
    expect(decision.newClasses.map((c) => c.sample)).toEqual([
      "snapshot write failed",
    ]);
    expect(decision.shouldSend).toBe(true);
  });

  it("a volume jump sends even with no new class", () => {
    const current = groupErrorClasses(
      Array.from({ length: 30 }, () => row("quote fetch failed after 3 tries"))
    );
    const decision = decideDigest(current, known);
    expect(decision.newClasses).toEqual([]);
    expect(decision.spike).toBe(true);
    expect(decision.shouldSend).toBe(true);
  });

  it("ordinary growth below the floor stays quiet", () => {
    const current = groupErrorClasses(
      Array.from({ length: 10 }, () => row("quote fetch failed after 3 tries"))
    );
    expect(decideDigest(current, known).shouldSend).toBe(false);
  });
});

describe("digestEmail", () => {
  it("leads with the new kinds and never uses an em dash", () => {
    const current = groupErrorClasses([
      row("snapshot write failed"),
      row("quote fetch failed after 3 tries"),
    ]);
    const prior = groupErrorClasses([row("quote fetch failed after 9 tries")]);
    const mail = digestEmail(decideDigest(current, prior), "2026-08-30");
    expect(mail.subject).toContain("1 new kind");
    expect(mail.text).toContain("snapshot write failed");
    expect(mail.text).toContain("Still occurring");
    expect(mail.subject).not.toMatch(/[–—]/);
    expect(mail.text).not.toMatch(/[–—]/);
  });
});
