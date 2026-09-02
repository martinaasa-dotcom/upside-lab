import { describe, expect, it } from "vitest";

import { escapeLike, likeCanBeExact } from "@/lib/escape-like";

/*
  The unsubscribe route switches off the Sunday letter for every profile
  whose address matches the one on the row the link named, and it asks with
  an ILIKE so the match is case-insensitive. An address holding a wildcard
  would then switch it off for other people.
*/
describe("escapeLike", () => {
  it("leaves an ordinary address alone", () => {
    expect(escapeLike("martin.aasa@upthink.ee")).toBe("martin.aasa@upthink.ee");
  });

  it("escapes the two LIKE wildcards", () => {
    expect(escapeLike("a%b@x.com")).toBe("a\\%b@x.com");
    expect(escapeLike("first_last@x.com")).toBe("first\\_last@x.com");
  });

  it("escapes the escape character first, so a backslash cannot unescape a wildcard", () => {
    // Unescaped, `\%` would read as a literal percent and the following
    // `_` would still be a wildcard. Escaped, both are literal.
    expect(escapeLike("a\\_b@x.com")).toBe("a\\\\\\_b@x.com");
  });

  it("escapes every occurrence, not the first", () => {
    expect(escapeLike("%_%_")).toBe("\\%\\_\\%\\_");
  });
});

describe("likeCanBeExact", () => {
  it("accepts the addresses people actually have", () => {
    expect(likeCanBeExact("martin.aasa@upthink.ee")).toBe(true);
    expect(likeCanBeExact("first_last@x.com")).toBe(true);
  });

  it("refuses a star, because PostgREST turns it into a wildcard after escaping", () => {
    expect(likeCanBeExact("a*b@x.com")).toBe(false);
  });
});
