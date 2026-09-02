/**
 * Create the dead-man's-switch checks, one per cron, from vercel.json.
 *
 *   npx tsx scripts/setup-healthchecks.ts --dry-run
 *   HEALTHCHECKS_API_KEY=... npx tsx scripts/setup-healthchecks.ts
 *
 * The account and the project have to be made by a person: they need an
 * email nobody else holds and a payment-free signup nobody can do on
 * somebody's behalf. Everything after that is mechanical, and this is it.
 *
 * Idempotent by design. Each check is upserted on its slug, so running it
 * again after a schedule moves in vercel.json updates the check in place
 * rather than making a second one, and running it twice changes nothing.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildCronCheckPlan, type VercelCron } from "../src/lib/cron-checks";

const API_BASE = (
  process.env.HEALTHCHECKS_API_BASE ?? "https://healthchecks.io/api/v3"
).replace(/\/+$/, "");

function readCrons(): VercelCron[] {
  const file = path.resolve(__dirname, "..", "vercel.json");
  const parsed = JSON.parse(readFileSync(file, "utf8")) as {
    crons?: VercelCron[];
  };
  return parsed.crons ?? [];
}

function hours(seconds: number): string {
  return seconds >= 3600
    ? `${seconds / 3600} h`
    : `${Math.round(seconds / 60)} min`;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const plan = buildCronCheckPlan(readCrons());

  console.log(`${plan.length} checks, from vercel.json:\n`);
  for (const check of plan) {
    const extra = check.alsoPingedBy.length
      ? `  (also pinged by ${check.alsoPingedBy.join(", ")})`
      : "";
    console.log(
      `  ${check.slug.padEnd(19)} ${check.schedule.padEnd(16)} ` +
        `grace ${hours(check.grace)}${extra}`,
    );
  }
  console.log("");

  if (dryRun) {
    console.log("Dry run, nothing sent.");
    return;
  }

  const key = process.env.HEALTHCHECKS_API_KEY?.trim();
  if (!key) {
    console.error(
      "Set HEALTHCHECKS_API_KEY to the project's read-write API key " +
        "(Healthchecks: Project Settings, API keys). That is a different " +
        "value from the ping key that goes in CRON_HEARTBEAT_BASE.\n" +
        "Pass --dry-run to see the plan without it.",
    );
    process.exitCode = 1;
    return;
  }

  let created = 0;
  let updated = 0;
  for (const check of plan) {
    const res = await fetch(`${API_BASE}/checks/`, {
      method: "POST",
      headers: { "X-Api-Key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: check.slug,
        slug: check.slug,
        schedule: check.schedule,
        tz: "UTC",
        grace: check.grace,
        desc: check.desc,
        tags: "upside-lab cron",
        // Every integration the project has. A check created with no
        // alert channel is monitoring that cannot tell anybody, which is
        // the one failure this whole feature exists to avoid.
        channels: "*",
        unique: ["slug"],
      }),
    });
    if (res.status === 201) created += 1;
    else if (res.status === 200) updated += 1;
    else {
      console.error(
        `  ${check.slug}: ${res.status} ${await res.text().catch(() => "")}`,
      );
      process.exitCode = 1;
      continue;
    }
    console.log(
      `  ${check.slug}: ${res.status === 201 ? "created" : "updated"}`,
    );
  }

  console.log(`\n${created} created, ${updated} updated.`);
  console.log(
    "\nLast step, which this script deliberately does not do: set\n" +
      "  CRON_HEARTBEAT_BASE=https://hc-ping.com/<ping-key>\n" +
      "in Vercel, production environment only. The ping key is in the\n" +
      "project's settings and is write-only; previews and CI stay unset so\n" +
      "a branch build cannot silence a real missed run.",
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
