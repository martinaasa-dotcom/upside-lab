import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/*
  An error-level event that never reaches portfell_error_log is an alarm
  wired to a room nobody sits in.

  `logEvent(..., "error")` prints to the platform's log stream, which is
  searchable and unread; `logError` writes the row that /admin shows and
  the daily error digest mails. The audit's second-ranked gap was exactly
  this split, and after the digest landed the first thing found was that
  the new alarms themselves (the fund backlog, the Sunday untrusted rate,
  the deletion-time Stripe failures, the disaster-recovery warnings) were
  on the wrong side of it.

  So the rule: a bare error-level logEvent is allowed only where the same
  fault provably produces a row anyway, and each such place is named
  below with its reason. A new console-only alarm fails here until its
  author either routes it through logError or writes down why the row
  already exists. Stale entries fail too, so the list cannot become a
  parking space.

  This is a floor, not a ceiling: it reads literals, so a level passed
  through a variable is beyond it and on whoever writes it.
*/

const ROOT = path.resolve(__dirname, "../..");

const ALLOWED: Record<string, string> = {
  // logError's own emit: every call here is beside the row it writes.
  "src/lib/error-log.ts":
    "the event printed here accompanies the portfell_error_log insert",
  // route_throw logs and rethrows; the rethrow reaches instrumentation's
  // onRequestError, which writes the row for the same fault.
  "src/lib/observe-route.ts":
    "the rethrown error lands in onRequestError, which writes the row",
  // Webhook sync failures are backstopped by the daily billing-reconcile
  // cron, whose own failures do write rows; a Stripe blip here would
  // otherwise write a row per delivery attempt.
  "src/app/api/billing/webhook/route.ts":
    "billing-reconcile self-heals within a day and its failures write rows",
};

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function filesWithBareErrorEvents(): string[] {
  const flagged: string[] = [];
  for (const file of walk(path.join(ROOT, "src"))) {
    const source = readFileSync(file, "utf8");
    let at = source.indexOf("logEvent(");
    let hit = false;
    while (at !== -1 && !hit) {
      // Calls only; the definition in telemetry.ts is not an alarm.
      const isDefinition = source.slice(Math.max(0, at - 9), at) === "function ";
      if (!isDefinition) {
        const window = source.slice(at, at + 500);
        if (/"error"\s*\)/.test(window)) hit = true;
      }
      at = source.indexOf("logEvent(", at + 9);
    }
    if (hit) flagged.push(path.relative(ROOT, file).replace(/\\/g, "/"));
  }
  return flagged.sort();
}

describe("error-level events reach the error log", () => {
  const flagged = filesWithBareErrorEvents();

  it("every bare error-level logEvent site is named here with its reason", () => {
    const unexplained = flagged.filter((f) => !(f in ALLOWED));
    expect(
      unexplained,
      `These files raise an error-level event that never becomes a ` +
        `portfell_error_log row, so /admin and the daily digest cannot ` +
        `see it. Route it through logError (which keeps the console ` +
        `signal), or add the file here with the reason a row already ` +
        `exists: ${unexplained.join(", ")}`
    ).toEqual([]);
  });

  it("the allowlist stays honest", () => {
    for (const entry of Object.keys(ALLOWED)) {
      expect(
        existsSync(path.join(ROOT, entry)),
        `${entry} is allowlisted but no longer exists`
      ).toBe(true);
      expect(
        flagged.includes(entry),
        `${entry} is allowlisted but no longer raises a bare error-level ` +
          `event; remove the entry so the list cannot become a parking space`
      ).toBe(true);
    }
  });
});
