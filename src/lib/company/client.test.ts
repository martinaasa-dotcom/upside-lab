import { afterEach, describe, expect, it, vi } from "vitest";
import { FETCH_TIMEOUT_MS, fetchCompanyPage } from "@/lib/company/client";

/*
  `/stock/<ticker>` was reported stuck on its loading skeleton forever: the
  browser's own `fetch` to `/api/company/[ticker]` has no timeout of its
  own, so a request that never gets a response at all (a dropped
  connection, a proxy that swallows the close) left `loading` true and
  `error` null forever, since `fetchCompanyPage`'s promise never settled.
  Every await inside `buildCompanyPage` on the server is already bounded,
  but a reader's own room has no business trusting that from the other end
  of a network connection.

  A real short timeout (not fake timers) proves the actual code path fires,
  rather than asserting on the ms constant alone.
*/
describe("a company page fetch that never settles turns into a retryable error", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("gives up and throws once its own timeout passes", async () => {
    // A dropped connection: the promise itself never resolves or rejects on
    // its own, exactly like `neverSettles` here, so the only thing that can
    // ever end the wait is the abort signal firing — real `fetch` listens
    // for that itself, which this stand-in has to do too.
    const neverSettles = vi.fn(
      (_input: unknown, init?: { signal?: AbortSignal }) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation timed out.", "TimeoutError"));
          });
        })
    );
    vi.stubGlobal("fetch", neverSettles as unknown as typeof fetch);

    await expect(fetchCompanyPage("NBIS", undefined, 20)).rejects.toThrow(
      "That took too long to load. Try again in a moment."
    );
  });

  it("still resolves normally well inside the timeout", async () => {
    const page = { facts: { ticker: "NBIS" } };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => page })) as unknown as typeof fetch
    );

    await expect(fetchCompanyPage("NBIS", undefined, 20)).resolves.toEqual(page);
  });

  it("does not relabel the caller's own abort as a timeout", async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    const fetchMock = vi.fn(() => {
      const err = new DOMException("The user aborted a request.", "AbortError");
      return Promise.reject(err);
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    // The room's own abort (unmount, ticker change) must still read as an
    // ordinary AbortError, not as "That took too long to load" — StockRoom
    // treats those two very differently (silent return vs. a shown error).
    await expect(
      fetchCompanyPage("NBIS", ctrl.signal, 20_000)
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("surfaces the server's own error message on an ordinary failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        json: async () => ({ error: "Nothing came back for that symbol." }),
      })) as unknown as typeof fetch
    );

    await expect(fetchCompanyPage("NBIS", undefined, 20)).rejects.toThrow(
      "Nothing came back for that symbol."
    );
  });

  it("keeps a generous production timeout, well past the route's own worst case", () => {
    // LLM_BUDGET_MS (page-build.ts) is 80s and the route's maxDuration is
    // 120s; this has to clear the model's own budget with room for the
    // rest of the build, or a legitimately slow-but-working run gets cut
    // off before the server had a chance to answer.
    expect(FETCH_TIMEOUT_MS).toBeGreaterThan(80_000);
  });
});
