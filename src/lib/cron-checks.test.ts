import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CRON_CHECK_DESC,
  CRON_GRACE_SECONDS,
  WORST_MEASURED_LATENESS_SECONDS,
  buildCronCheckPlan,
  cronFiringsPerYear,
  parseCron,
  slugFromCronPath,
  type VercelCron,
} from "./cron-checks";

/*
  A check that expects a run at the wrong hour is worse than no check.

  It alerts on a day nothing was wrong, and the person it wakes learns that
  this alarm does not mean anything, which is exactly the state you do not
  want to be in on the day a cron really does stop firing. The schedule is
  therefore derived from vercel.json and never restated; what this file
  guards is everything that cannot be derived: that every cron has a grace
  and a sentence, that no leftover entry names a cron that no longer
  exists, that each grace still clears its route's own maxDuration, and
  that the runbook's table has not drifted from what the script would do.
*/

const ROOT = path.resolve(__dirname, "../..");

function vercelCrons(): VercelCron[] {
  const parsed = JSON.parse(
    readFileSync(path.join(ROOT, "vercel.json"), "utf8"),
  ) as { crons?: VercelCron[] };
  return parsed.crons ?? [];
}

function scheduledSlugs(): string[] {
  return [
    ...new Set(
      vercelCrons().flatMap((c) => {
        const slug = slugFromCronPath(c.path);
        return slug ? [slug] : [];
      }),
    ),
  ].sort();
}

/** `export const maxDuration = 90;` out of a cron route. */
function maxDurationOf(slug: string): number {
  const src = readFileSync(
    path.join(ROOT, "src", "app", "api", "cron", slug, "route.ts"),
    "utf8",
  );
  const m = src.match(/export const maxDuration\s*=\s*(\d+)/);
  return m ? Number(m[1]) : 0;
}

describe("every cron has a check, and every check has a cron", () => {
  it("names a grace for each one", () => {
    for (const slug of scheduledSlugs()) {
      expect(
        CRON_GRACE_SECONDS[slug],
        `The cron "${slug}" has no entry in CRON_GRACE_SECONDS, so no check ` +
          `would be created for it and a scheduler that stopped invoking it ` +
          `would be invisible.`,
      ).toBeTypeOf("number");
    }
  });

  it("names a sentence for each one", () => {
    for (const slug of scheduledSlugs()) {
      expect(
        (CRON_CHECK_DESC[slug] ?? "").length,
        `The cron "${slug}" has no entry in CRON_CHECK_DESC. That sentence ` +
          `is what somebody reads at the moment the alert arrives, so it ` +
          `has to say what stops working, not just which route it was.`,
      ).toBeGreaterThan(10);
    }
  });

  it("keeps no entry for a cron that no longer exists", () => {
    const live = new Set(scheduledSlugs());
    for (const table of [CRON_GRACE_SECONDS, CRON_CHECK_DESC]) {
      for (const slug of Object.keys(table)) {
        expect(
          live.has(slug),
          `"${slug}" is listed in src/lib/cron-checks.ts but vercel.json ` +
            `schedules no such cron. Remove it, or the setup script keeps ` +
            `creating a check nothing will ever ping and it alerts forever.`,
        ).toBe(true);
      }
    }
  });
});

describe("a grace period covers the work it waits on", () => {
  it("clears the route's own maxDuration with room to retry", () => {
    for (const slug of scheduledSlugs()) {
      const grace = CRON_GRACE_SECONDS[slug]!;
      const maxDuration = maxDurationOf(slug);
      expect(
        grace,
        `The grace for "${slug}" is ${grace}s but the route may legitimately ` +
          `run for ${maxDuration}s. A grace that does not clear its own ` +
          `maxDuration alerts on a slow run that was going to succeed.`,
      ).toBeGreaterThan(maxDuration * 2);
    }
  });

  it("clears the lateness the scheduler was measured to have", () => {
    /*
      The first version of this table assumed the cron fires at the minute
      named. Measured against production, it arrives 3 to 59 minutes late,
      and nine of fourteen snapshot runs were past the half hour the table
      then allowed, so it would have raised a false alarm most days. An
      alarm that cries wolf is worse than none, which is the whole reason
      the switch exists, so the floor is the worst arrival plus the route's
      own maxDuration.
    */
    for (const slug of scheduledSlugs()) {
      const grace = CRON_GRACE_SECONDS[slug]!;
      const floor = WORST_MEASURED_LATENESS_SECONDS + maxDurationOf(slug);
      expect(
        grace,
        `The grace for "${slug}" is ${grace}s, inside the ${floor}s a run ` +
          `can legitimately take to arrive (the scheduler has been measured ` +
          `up to ${WORST_MEASURED_LATENESS_SECONDS}s late, plus this route's ` +
          `own maxDuration). Re-measure before tightening one.`
      ).toBeGreaterThan(floor);
    }
  });

  it("stays inside what the service accepts", () => {
    for (const grace of Object.values(CRON_GRACE_SECONDS)) {
      expect(grace).toBeGreaterThanOrEqual(60);
      expect(grace).toBeLessThanOrEqual(31_536_000);
    }
  });
});

describe("reading a cron expression", () => {
  it("counts a year of firings", () => {
    expect(cronFiringsPerYear("0 2 * * *")).toBe(365);
    expect(cronFiringsPerYear("0 4 * * 0")).toBe(52);
    expect(cronFiringsPerYear("0 7 1 * *")).toBe(12);
    expect(cronFiringsPerYear("0 15 * * 1-5")).toBe(261);
    expect(cronFiringsPerYear("0 11 * * 1-6")).toBe(313);
  });

  it("reads Sunday as 0 or 7", () => {
    expect([...parseCron("0 4 * * 7").daysOfWeek]).toEqual([0]);
  });

  it("refuses an expression it cannot read rather than guessing", () => {
    expect(() => parseCron("0 4 * *")).toThrow(/five fields/);
    expect(() => parseCron("0 99 * * *")).toThrow(/outside/);
  });
});

describe("the plan", () => {
  it("gives a route with several slots one check, on its widest", () => {
    const plan = buildCronCheckPlan([
      { path: "/api/cron/margus-fund", schedule: "30 23 * * 1-5" },
      { path: "/api/cron/margus-fund", schedule: "0 11 * * 1-6" },
    ]);
    expect(plan).toHaveLength(1);
    expect(plan[0]!.schedule).toBe("0 11 * * 1-6");
    expect(plan[0]!.alsoPingedBy).toEqual(["30 23 * * 1-5"]);
  });

  it("takes the earliest slot when two are equally wide", () => {
    const plan = buildCronCheckPlan([
      { path: "/api/cron/sunday-note", schedule: "40 4 * * 0" },
      { path: "/api/cron/sunday-note", schedule: "0 4 * * 0" },
      { path: "/api/cron/sunday-note?resume=1", schedule: "20 4 * * 0" },
    ]);
    expect(plan[0]!.schedule).toBe("0 4 * * 0");
  });

  it("reads a slug through its query string", () => {
    expect(slugFromCronPath("/api/cron/sunday-note?resume=1")).toBe(
      "sunday-note",
    );
    expect(slugFromCronPath("/api/portfolios")).toBeNull();
  });

  it("refuses to plan a cron nobody has judged a grace for", () => {
    expect(() =>
      buildCronCheckPlan([
        { path: "/api/cron/brand-new", schedule: "0 1 * * *" },
      ]),
    ).toThrow(/No grace period/);
  });
});

describe("the runbook agrees with the script", () => {
  it("lists the same slug, schedule and grace the script would send", () => {
    const doc = readFileSync(
      path.join(ROOT, "docs", "CRON_MONITORING.md"),
      "utf8",
    );
    const plan = buildCronCheckPlan(vercelCrons());
    for (const check of plan) {
      const row = doc
        .split("\n")
        .find((line) => line.trim().startsWith(`| \`${check.slug}\``));
      expect(
        row,
        `docs/CRON_MONITORING.md has no row for the cron "${check.slug}".`,
      ).toBeTruthy();
      expect(
        row,
        `The row for "${check.slug}" in docs/CRON_MONITORING.md does not ` +
          `carry its schedule from vercel.json, "${check.schedule}". A ` +
          `runbook that names the wrong hour is what produces the false ` +
          `alert nobody trusts afterwards.`,
      ).toContain(`\`${check.schedule}\``);
      const grace =
        check.grace >= 3600
          ? `${check.grace / 3600} h`
          : `${check.grace / 60} min`;
      expect(
        row,
        `The row for "${check.slug}" does not name its grace, ${grace}.`,
      ).toContain(grace);
    }
  });
});
