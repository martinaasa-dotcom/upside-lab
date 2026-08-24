/**
 * `SameSite=Lax` on the session cookie is most of the CSRF defence and it
 * is a dependency's default. These are the cases the second line has to
 * get right, and the ones it must not break.
 */
import { describe, expect, it } from "vitest";
import { isMutatingRequest, isSameOriginMutation } from "@/lib/same-origin";

function post(headers: Record<string, string>): Request {
  return new Request("https://upsidelab.app/api/holdings", {
    method: "POST",
    headers,
  });
}

describe("isMutatingRequest", () => {
  it("names the methods that change something", () => {
    for (const m of ["POST", "put", "PATCH", "delete"]) {
      expect(isMutatingRequest(m)).toBe(true);
    }
    for (const m of ["GET", "head", "OPTIONS"]) {
      expect(isMutatingRequest(m)).toBe(false);
    }
  });
});

describe("isSameOriginMutation", () => {
  it("trusts Sec-Fetch-Site when the browser sent it", () => {
    expect(isSameOriginMutation(post({ "sec-fetch-site": "same-origin" }))).toBe(true);
    expect(isSameOriginMutation(post({ "sec-fetch-site": "none" }))).toBe(true);
    expect(isSameOriginMutation(post({ "sec-fetch-site": "cross-site" }))).toBe(false);
    expect(isSameOriginMutation(post({ "sec-fetch-site": "same-site" }))).toBe(false);
  });

  it("prefers Sec-Fetch-Site over an Origin that disagrees", () => {
    // Page script can write Origin through a proxy it controls; it cannot
    // write Sec-Fetch-Site at all.
    expect(
      isSameOriginMutation(
        post({
          "sec-fetch-site": "cross-site",
          origin: "https://upsidelab.app",
          host: "upsidelab.app",
        })
      )
    ).toBe(false);
  });

  it("falls back to comparing Origin against the host", () => {
    expect(
      isSameOriginMutation(
        post({ origin: "https://upsidelab.app", host: "upsidelab.app" })
      )
    ).toBe(true);
    expect(
      isSameOriginMutation(
        post({ origin: "https://evil.example", host: "upsidelab.app" })
      )
    ).toBe(false);
  });

  it("ignores the port, since a browser sends one and the host header may not", () => {
    expect(
      isSameOriginMutation(
        post({ origin: "http://localhost:3000", host: "localhost:3000" })
      )
    ).toBe(true);
  });

  it("lets a preview deployment post to itself", () => {
    const previewHost = "upside-git-branch-upthink-solutions.vercel.app";
    expect(
      isSameOriginMutation(
        post({ origin: `https://${previewHost}`, host: previewHost })
      )
    ).toBe(true);
  });

  it("allows a caller that is not a browser at all", () => {
    // Stripe's webhook is the one that matters: a signed body, no Origin,
    // no Sec-Fetch-Site, and no ambient cookie to forge with.
    expect(isSameOriginMutation(post({ host: "upsidelab.app" }))).toBe(true);
    expect(isSameOriginMutation(post({}))).toBe(true);
  });
});
