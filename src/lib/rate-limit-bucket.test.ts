/**
 * A rate limit keyed on the IP is keyed on the router, and this app has
 * classrooms in it. Twenty-five students on one school network are one IP,
 * a page load makes two quote requests, and the cap is 120 a minute, so a
 * class opening the app together used to spend the whole budget in the
 * first few seconds.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  clientBucket,
  limitPublicMarketRequest,
  resetRateLimitForTests,
} from "@/lib/rate-limit";

function quoteRequest(opts: { ip?: string; session?: string } = {}): Request {
  const headers = new Headers();
  if (opts.ip) headers.set("x-forwarded-for", opts.ip);
  if (opts.session) {
    headers.set("cookie", `sb-uzrnybyggznpvgxgrvgl-auth-token=${opts.session}`);
  }
  return new Request("https://upsidelab.app/api/quotes?tickers=AAPL", {
    headers,
  });
}

beforeEach(() => resetRateLimitForTests());

describe("clientBucket", () => {
  it("tells two students on one school network apart", () => {
    const a = clientBucket(quoteRequest({ ip: "203.0.113.9", session: "aaa" }));
    const b = clientBucket(quoteRequest({ ip: "203.0.113.9", session: "bbb" }));
    expect(a).not.toBe(b);
  });

  it("gives one reader the same bucket every time", () => {
    const first = clientBucket(quoteRequest({ ip: "203.0.113.9", session: "aaa" }));
    const again = clientBucket(quoteRequest({ ip: "198.51.100.4", session: "aaa" }));
    expect(first).toBe(again);
  });

  it("falls back to the IP when nobody is signed in", () => {
    const bucket = clientBucket(quoteRequest({ ip: "203.0.113.9" }));
    expect(bucket).toBe("i:203.0.113.9");
  });

  it("cannot collide a session bucket with an IP bucket", () => {
    expect(clientBucket(quoteRequest({ session: "x" })).startsWith("s:")).toBe(true);
    expect(clientBucket(quoteRequest({ ip: "1.2.3.4" })).startsWith("i:")).toBe(true);
  });

  it("reads a chunked cookie as one session, whatever order it arrives in", () => {
    const headers = (order: string[]) => {
      const h = new Headers();
      h.set("cookie", order.join("; "));
      return new Request("https://upsidelab.app/api/quotes", { headers: h });
    };
    const forward = headers([
      "sb-ref-auth-token.0=part-one",
      "sb-ref-auth-token.1=part-two",
    ]);
    const backward = headers([
      "sb-ref-auth-token.1=part-two",
      "sb-ref-auth-token.0=part-one",
    ]);
    expect(clientBucket(forward)).toBe(clientBucket(backward));
  });

  it("ignores cookies that are not the session", () => {
    const h = new Headers();
    h.set("cookie", "portfell-locked=1; upside-active-sheet-id=abc");
    const req = new Request("https://upsidelab.app/api/quotes", { headers: h });
    expect(clientBucket(req)).toBe("i:unknown");
  });
});

describe("a class opening the app together", () => {
  it("does not spend one budget between all of them", () => {
    // Each student loads the app twenty times: forty quote requests each,
    // well inside the 120 they are individually allowed.
    const ip = "203.0.113.9";
    for (let student = 0; student < 25; student++) {
      for (let call = 0; call < 40; call++) {
        const result = limitPublicMarketRequest(
          quoteRequest({ ip, session: `student-${student}` })
        );
        expect(result?.ok).toBe(true);
      }
    }
  });

  it("still stops a scrape loop that carries no session", () => {
    const ip = "203.0.113.9";
    let refusedAt = -1;
    for (let i = 0; i < 200; i++) {
      const result = limitPublicMarketRequest(quoteRequest({ ip }));
      if (result && !result.ok) {
        refusedAt = i;
        break;
      }
    }
    expect(refusedAt).toBe(120);
  });
});
