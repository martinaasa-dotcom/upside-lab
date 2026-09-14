import { afterEach, describe, expect, it, vi } from "vitest";
import { resetMarketCircuits } from "./circuit-breaker";
import { yahooCall } from "./yahoo";

/*
 * `marketFetch` puts a timeout on every raw `fetch` because a hung provider
 * call must not pin a Fluid isolate. The `yahoo-finance2` library calls this
 * file wraps go around that -- they carry no timeout of their own -- so
 * `yahooCall` has to supply one itself. Without it, a stalled call never
 * settles, and this file's several single-flight maps (`quoteInFlight`,
 * `chartInFlight`, `symbolInFlight`, `ytdCloseInFlight`, and
 * `covered-call.ts`'s `chainInFlight`) would hand that same wedged promise
 * to every later caller for the same ticker, on this warm instance, forever
 * -- the same shape of bug fixed in `src/lib/ai/llm-slots.ts`, just
 * triggered by an ordinary network stall rather than a platform kill.
 */

afterEach(() => {
  resetMarketCircuits();
  vi.useRealTimers();
});

describe("yahooCall", () => {
  it("resolves normally when the call answers in time", async () => {
    await expect(yahooCall(async () => "ok")).resolves.toBe("ok");
  });

  it("times out a call that never settles, instead of hanging forever", async () => {
    vi.useFakeTimers();
    // Never resolves or rejects -- a stalled TCP connection, a provider
    // that accepted the request and never answered. `withMarketCircuit`
    // retries a transient failure, so this can time out more than once
    // before it gives up -- `runAllTimersAsync` drains the whole retry
    // loop rather than guessing how long that takes.
    const hung = () => new Promise<never>(() => {});

    const pending = yahooCall(hung);
    const assertion = expect(pending).rejects.toMatchObject({
      name: "MarketHttpError",
      status: 504,
    });
    await vi.runAllTimersAsync();
    await assertion;
  });

  it("frees the slot for the next caller after a timeout, rather than staying wedged", async () => {
    vi.useFakeTimers();
    const hung = () => new Promise<never>(() => {});

    const pending = yahooCall(hung);
    const assertion = expect(pending).rejects.toBeTruthy();
    await vi.runAllTimersAsync();
    await assertion;

    // A second, ordinary call must be able to answer -- proving the first
    // call's timeout actually released whatever it was guarding rather than
    // leaving the circuit or a caller's own single-flight map wedged on it.
    resetMarketCircuits();
    vi.useRealTimers();
    await expect(yahooCall(async () => "ok")).resolves.toBe("ok");
  });
});
