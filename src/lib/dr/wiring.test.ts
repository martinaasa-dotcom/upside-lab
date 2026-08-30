import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "../../..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("DR wiring", () => {
  it("schedules the cron and documents the operator commands", () => {
    const vercel = read("vercel.json");
    const pkg = read("package.json");
    const envExample = read(".env.example");
    const cron = read("src/app/api/cron/disaster-recovery/route.ts");
    expect(vercel).toMatch(/\/api\/cron\/disaster-recovery/);
    expect(vercel).toMatch(/0 3 \* \* \*/);
    expect(cron).toMatch(/runDisasterRecoveryJob/);
    // cronRoute carries observeRoute's timing plus the heartbeat ping
    // (docs/CRON_MONITORING.md); cron-heartbeat.test.ts enforces it for
    // every cron route, this just keeps the DR one's wiring readable here.
    expect(cron).toMatch(/cronRoute/);
    expect(pkg).toMatch(/"dr:export"/);
    expect(pkg).toMatch(/"dr:restore"/);
    expect(pkg).toMatch(/"migrate:online"/);
    expect(envExample).toMatch(/SNAPSHOT_ENCRYPTION_KEY=/);
    expect(envExample).toMatch(/DR_S3_ENDPOINT=/);
  });
});
