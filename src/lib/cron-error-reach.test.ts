import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/*
  A cron that catches its own failure is a cron nobody hears fail.

  `observeRoute` logs and rethrows, and instrumentation's `onRequestError`
  turns that throw into a `portfell_error_log` row, which is what /admin
  shows and the daily digest mails. A route that catches instead and
  answers 500 never throws, so none of that runs: the heartbeat flips the
  check to DOWN and the only account of what happened is a console line in
  a log stream nobody reads.

  This is not hypothetical. The nightly snapshot check went down on 3
  September 2026 and stayed down; the error digest four days later named
  only disaster-recovery, because disaster-recovery was the one cron that
  wrote a row. Its message ("JWT issued at future", PostgREST's PGRST303)
  was at least a sentence somebody could act on. The snapshot's was
  nowhere.

  So: a cron route that turns a caught error into a 5xx must also call
  `logError`. A route that lets the error throw needs nothing, because the
  row is written for it. Sibling of `error-log-reach.test.ts`, which holds
  the same rule for error-level `logEvent` calls.

  It reads text, so a catch that hands off to a helper is beyond it and on
  whoever writes it. A floor, not a ceiling.
*/

const CRON_DIR = path.resolve(__dirname, "../app/api/cron");

/** Every `catch (` block body, to the handler's own closing brace column. */
function catchBlocks(source: string): string[] {
  const blocks: string[] = [];
  const re = /\bcatch\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    const open = source.indexOf("{", m.index);
    if (open === -1) continue;
    let depth = 0;
    let i = open;
    for (; i < source.length; i += 1) {
      if (source[i] === "{") depth += 1;
      else if (source[i] === "}") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    blocks.push(source.slice(open, i + 1));
  }
  return blocks;
}

function swallowsWithoutRow(source: string): boolean {
  return catchBlocks(source).some(
    (block) => /status:\s*5\d\d/.test(block) && !/logError\s*\(/.test(block)
  );
}

describe("a cron that swallows its failure still writes an error row", () => {
  const routes = readdirSync(CRON_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => `${e.name}/route.ts`);

  it("has cron routes to check", () => {
    expect(routes.length).toBeGreaterThan(5);
  });

  it("no cron route answers 5xx from a catch without logError", () => {
    const offenders = routes.filter((rel) =>
      swallowsWithoutRow(readFileSync(path.join(CRON_DIR, rel), "utf8"))
    );
    expect(
      offenders,
      `These cron routes catch their own failure and answer 5xx, so ` +
        `nothing is thrown and onRequestError never writes the row: the ` +
        `run is invisible to /admin and to the daily digest. Call ` +
        `logError in the catch, or let the error throw: ` +
        offenders.join(", ")
    ).toEqual([]);
  });
});
