import { describe, expect, it } from "vitest";
import { isAbortError, isRequestAbort } from "@/lib/abort";

describe("isAbortError", () => {
  it("recognises AbortController cancellation", () => {
    const err = new Error("The operation was aborted.");
    err.name = "AbortError";
    expect(isAbortError(err)).toBe(true);
    expect(isAbortError(new DOMException("Aborted", "AbortError"))).toBe(true);
  });

  it("does not treat a plain crash as cancellation", () => {
    expect(isAbortError(new Error("aborted"))).toBe(false);
    expect(isAbortError(new Error("Cannot read properties of undefined"))).toBe(
      false
    );
  });
});

describe("isRequestAbort", () => {
  it("treats Node hanging up a sendBeacon as an abort", () => {
    expect(isRequestAbort(new Error("aborted"))).toBe(true);
    expect(isRequestAbort("aborted")).toBe(true);
    expect(isRequestAbort({ message: "aborted" })).toBe(true);
  });

  it("covers the browser and undici wordings", () => {
    expect(isRequestAbort(new Error("This operation was aborted."))).toBe(true);
    expect(isRequestAbort(new Error("The user aborted a request."))).toBe(true);
    expect(isRequestAbort({ code: "UND_ERR_ABORTED", message: "boom" })).toBe(
      true
    );
  });

  it("does not swallow a real crash", () => {
    expect(isRequestAbort(new Error("Cannot read properties of undefined"))).toBe(
      false
    );
    expect(isRequestAbort(new Error("portfell_rate_take failed"))).toBe(false);
    expect(isRequestAbort(null)).toBe(false);
  });
});
