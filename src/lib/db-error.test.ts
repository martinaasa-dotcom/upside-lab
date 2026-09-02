import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DB_ERROR_MESSAGE, dbError } from "@/lib/db-error";
import { plainError } from "@/lib/plain-error";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("dbError", () => {
  it("keeps the driver's sentence out of what it returns", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const returned = dbError(
      {
        message:
          'duplicate key value violates unique constraint "portfell_holdings_portfolio_id_ticker_key"',
      },
      "/api/holdings"
    );

    expect(returned).toBe(DB_ERROR_MESSAGE);
    expect(returned).not.toContain("portfell_holdings");
    expect(returned).not.toContain("constraint");
  });

  /*
    The detail is not thrown away, it is moved. Whoever can act on a
    constraint violation is reading the server log, not the response body.
  */
  it("writes the real error to the server log with its route", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    dbError({ message: 'column "buy_price" does not exist' }, "/api/holdings");

    expect(logged).toHaveBeenCalledTimes(1);
    const line = String(logged.mock.calls[0]?.[0]);
    expect(line).toContain("/api/holdings");
    expect(line).toContain('column "buy_price" does not exist');
  });

  it("says something rather than nothing when the driver said nothing", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(dbError(null, "/api/lab")).toBe(DB_ERROR_MESSAGE);
    expect(dbError({}, "/api/lab")).toBe(DB_ERROR_MESSAGE);
  });

  /*
    A `catch` hands over `unknown`. `readAll(..., "throw")` rethrows the
    driver's error as an `Error`, a cron run can throw a bare string, and
    both have to be logged whole and answered with the same safe word, or
    the route shapes the value itself and is back to reading `.message`.
  */
  it("takes whatever a catch caught and keeps the detail in the log", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    const thrown: unknown = new Error(
      'relation "portfell_holdings" does not exist'
    );
    expect(dbError(thrown, "GET /api/portfolios")).toBe(DB_ERROR_MESSAGE);
    expect(String(logged.mock.calls[0]?.[0])).toContain(
      'relation "portfell_holdings" does not exist'
    );

    const bare: unknown = "snapshot bucket unreachable";
    expect(dbError(bare, "GET /api/cron/snapshot")).toBe(DB_ERROR_MESSAGE);
    expect(String(logged.mock.calls[1]?.[0])).toContain(
      "snapshot bucket unreachable"
    );

    expect(dbError(42, "/api/lab")).toBe(DB_ERROR_MESSAGE);
    expect(String(logged.mock.calls[2]?.[0])).toContain(
      "unknown database error"
    );
  });

  /*
    The reader must not notice this change.

    Before, a technical string reached `plainError` and was routed to the
    caller's fallback by its markers. The replacement has to be routed the
    same way, or the reader trades a contextual line ("Couldn't save your
    holding.") for a bare "Database error", which is a regression wearing
    a fix's clothes.
  */
  it("still leaves the reader with the caller's own line", () => {
    const fallback = "Couldn't save your holding.";

    expect(plainError(DB_ERROR_MESSAGE, fallback)).toBe(fallback);
    expect(
      plainError(
        'duplicate key value violates unique constraint "x"',
        fallback
      )
    ).toBe(fallback);
  });
});

/*
  The guard. Sixty-odd call sites were converted at once, and the way that
  decays is one new route written from the shape of an old one.
*/
describe("no API route sends a database error verbatim", () => {
  const files = execFileSync(
    "grep",
    ["-rl", "--include=route.ts", "-e", "", "src/app/api"],
    { encoding: "utf8" }
  )
    .trim()
    .split("\n");

  it("returns dbError() rather than the driver's message", () => {
    const offenders: string[] = [];

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      /*
        Two spellings of one leak. `error: err.message` is the driver's
        object put straight into the body; `error: err instanceof Error ?
        err.message : "..."` is a `catch` doing the same with what
        `readAll(..., "throw")` rethrew, and that shape was standing in
        nine routes after the first sweep, none of them matched by a
        pattern that only knew the first.
      */
      const re =
        /error:\s*([A-Za-z_][A-Za-z0-9_]*)(?:\s+instanceof\s+Error\s*\?\s*\1)?\.message/g;
      let m: RegExpExecArray | null;

      while ((m = re.exec(source))) {
        // `verdict` is this app's own validation wording, written to be
        // read, and it is the one `.message` that belongs in a response.
        if (m[1] === "verdict") continue;
        const line = source.slice(0, m.index).split("\n").length;
        offenders.push(`${file}:${line} (${m[1]})`);
      }

      /*
        The third spelling parks the message in a variable first and
        sends the variable. Flag the pair, not the variable alone, since
        `error: message` on its own is how a route sends its own wording.
      */
      const staged =
        /const\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([A-Za-z_][A-Za-z0-9_]*)\s+instanceof\s+Error\s*\?\s*\2\.message/g;
      while ((m = staged.exec(source))) {
        const sent = new RegExp(`error:\\s*${m[1]}\\b`);
        if (!sent.test(source.slice(m.index))) continue;
        const line = source.slice(0, m.index).split("\n").length;
        offenders.push(`${file}:${line} (${m[1]} staged from ${m[2]})`);
      }
    }

    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});
