import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cronRoute, cronSlugFromRoute, pingCronHeartbeat } from "./cron-heartbeat";

/*
  The dead-man's-switch only works if every scheduled route is on it.

  Everything else that guards the crons (claim tables, idempotency keys,
  the sent marker) runs inside a request, so none of it can notice the
  request never arriving. The heartbeat ping is the one signal that can,
  and it is wired per route, which makes it exactly the kind of decision
  that is made once and then forgotten when the next cron is added. So the
  first half of this file is a floor: a route under src/app/api/cron/ that
  does not export through `cronRoute` fails here, by name.

  The second half pins the ping's own contract, because each rule exists
  for a reason: an unauthorized caller must not be able to mark the check
  either way, a monitoring outage must never fail the work it watches, and
  with no CRON_HEARTBEAT_BASE configured the whole feature has to stay a
  no-op.
*/

const ROOT = path.resolve(__dirname, "../..");
const CRON_DIR = path.join(ROOT, "src", "app", "api", "cron");

function cronRouteDirs(): string[] {
  return readdirSync(CRON_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

describe("every cron route is on the heartbeat", () => {
  it("exports GET through cronRoute, never bare observeRoute", () => {
    for (const dir of cronRouteDirs()) {
      const file = path.join(CRON_DIR, dir, "route.ts");
      const src = readFileSync(file, "utf8");
      expect(
        src.includes("cronRoute("),
        `src/app/api/cron/${dir}/route.ts does not use cronRoute, so a ` +
          `scheduler that stops invoking it is invisible. Import cronRoute ` +
          `from @/lib/cron-heartbeat and export the handler through it.`
      ).toBe(true);
      expect(
        src.includes("observeRoute("),
        `src/app/api/cron/${dir}/route.ts wraps with observeRoute directly. ` +
          `cronRoute already includes it; a second wrapper double-logs.`
      ).toBe(false);
    }
  });

  it("names its route so the slug resolves", () => {
    for (const dir of cronRouteDirs()) {
      const src = readFileSync(path.join(CRON_DIR, dir, "route.ts"), "utf8");
      expect(
        src.includes(`/api/cron/${dir}`),
        `src/app/api/cron/${dir}/route.ts passes a route string that does ` +
          `not match its own path, so its heartbeat check would be named ` +
          `after some other cron.`
      ).toBe(true);
    }
  });

  it("matches vercel.json's crons block in both directions", () => {
    const vercel = JSON.parse(
      readFileSync(path.join(ROOT, "vercel.json"), "utf8")
    ) as { crons?: Array<{ path: string }> };
    const scheduled = new Set(
      (vercel.crons ?? []).map((cron) => {
        const clean = cron.path.split("?")[0];
        return cronSlugFromRoute(clean) ?? clean;
      })
    );
    const dirs = new Set(cronRouteDirs());
    for (const slug of scheduled) {
      expect(
        dirs.has(slug),
        `vercel.json schedules /api/cron/${slug} but no such route exists.`
      ).toBe(true);
    }
    for (const dir of dirs) {
      expect(
        scheduled.has(dir),
        `src/app/api/cron/${dir} exists but vercel.json never schedules it. ` +
          `Either add the schedule or, for a deliberately manual route, ` +
          `record the decision here.`
      ).toBe(true);
    }
  });
});

describe("cronSlugFromRoute", () => {
  it("takes the route's own directory name", () => {
    expect(cronSlugFromRoute("/api/cron/snapshot")).toBe("snapshot");
    expect(cronSlugFromRoute("/api/cron/sunday-note")).toBe("sunday-note");
  });

  it("refuses anything that is not a cron path", () => {
    expect(cronSlugFromRoute("/api/portfolios")).toBeNull();
    expect(cronSlugFromRoute("/api/cron/../auth")).toBeNull();
  });
});

describe("pingCronHeartbeat", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("is a no-op with no CRON_HEARTBEAT_BASE", async () => {
    vi.stubEnv("CRON_HEARTBEAT_BASE", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await pingCronHeartbeat("snapshot", "ok");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("pings <base>/<slug> on success and appends /fail on failure", async () => {
    vi.stubEnv("CRON_HEARTBEAT_BASE", "https://hc-ping.example/key/");
    const fetchMock = vi.fn().mockResolvedValue(new Response("OK"));
    vi.stubGlobal("fetch", fetchMock);
    await pingCronHeartbeat("splits", "ok");
    await pingCronHeartbeat("splits", "fail");
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      "https://hc-ping.example/key/splits",
      "https://hc-ping.example/key/splits/fail",
    ]);
  });

  it("swallows an unreachable monitoring service", async () => {
    vi.stubEnv("CRON_HEARTBEAT_BASE", "https://hc-ping.example/key");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    await expect(pingCronHeartbeat("splits", "ok")).resolves.toBeUndefined();
  });
});

describe("cronRoute outcomes", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  function withPings() {
    vi.stubEnv("CRON_HEARTBEAT_BASE", "https://hc-ping.example/key");
    const fetchMock = vi.fn().mockResolvedValue(new Response("OK"));
    vi.stubGlobal("fetch", fetchMock);
    return () => fetchMock.mock.calls.map((c) => String(c[0]));
  }

  it("a 2xx answer pings success", async () => {
    const pings = withPings();
    const wrapped = cronRoute(
      async () => Response.json({ ok: true }),
      "/api/cron/snapshot"
    );
    await wrapped();
    expect(pings()).toEqual(["https://hc-ping.example/key/snapshot"]);
  });

  it("a 5xx answer pings failure", async () => {
    const pings = withPings();
    const wrapped = cronRoute(
      async () => Response.json({ error: "no" }, { status: 500 }),
      "/api/cron/snapshot"
    );
    await wrapped();
    expect(pings()).toEqual(["https://hc-ping.example/key/snapshot/fail"]);
  });

  it("a config-shaped 503 pings failure too", async () => {
    const pings = withPings();
    const wrapped = cronRoute(
      async () => Response.json({ error: "no key" }, { status: 503 }),
      "/api/cron/sunday-note"
    );
    await wrapped();
    expect(pings()).toEqual(["https://hc-ping.example/key/sunday-note/fail"]);
  });

  it("a refused caller pings nothing at all", async () => {
    const pings = withPings();
    for (const status of [401, 403]) {
      const wrapped = cronRoute(
        async () => Response.json({ error: "who" }, { status }),
        "/api/cron/snapshot"
      );
      await wrapped();
    }
    expect(pings()).toEqual([]);
  });

  it("a thrown error pings failure and is rethrown", async () => {
    const pings = withPings();
    const wrapped = cronRoute(async () => {
      throw new Error("boom");
    }, "/api/cron/splits");
    await expect(wrapped()).rejects.toThrow("boom");
    expect(pings()).toEqual(["https://hc-ping.example/key/splits/fail"]);
  });
});
