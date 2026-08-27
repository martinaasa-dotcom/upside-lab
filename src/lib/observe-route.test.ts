import { beforeEach, describe, expect, it, vi } from "vitest";

const logEvent = vi.fn();

vi.mock("@/lib/telemetry", () => ({
  logEvent: (...args: unknown[]) => logEvent(...args),
  routeMeta: () => ({}),
  SLOW_ROUTE_MS: 1000,
}));

const { observeRoute } = await import("@/lib/observe-route");

beforeEach(() => {
  logEvent.mockReset();
});

describe("observeRoute", () => {
  it("does not log a client disconnect as a route crash", async () => {
    const wrapped = observeRoute(async () => {
      throw new Error("aborted");
    }, "/api/internal/telemetry");
    await expect(wrapped()).rejects.toThrow("aborted");
    expect(logEvent).not.toHaveBeenCalled();
  });

  it("still logs a real throw", async () => {
    const wrapped = observeRoute(async () => {
      throw new Error("portfell_rate_take failed");
    }, "/api/internal/telemetry");
    await expect(wrapped()).rejects.toThrow("portfell_rate_take failed");
    expect(logEvent).toHaveBeenCalledWith(
      "route_throw",
      expect.objectContaining({
        message: "portfell_rate_take failed",
        route: "/api/internal/telemetry",
      }),
      "error"
    );
  });
});
