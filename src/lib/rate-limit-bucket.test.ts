/**
 * A rate limit keyed on the IP is keyed on the router, and this app has
 * classrooms in it. Twenty-five students on one school network are one IP,
 * a page load makes two quote requests, and the cap is 120 a minute, so a
 * class opening the app together used to spend the whole budget in the
 * first few seconds.
 *
 * The other half: a bucket per cookie value is no limit at all. The key
 * used to be whatever arrived under a cookie named like the session, so a
 * loop sending a fresh random string each time got a fresh bucket each
 * time and never tripped. A cookie earns a bucket of its own only when it
 * is shaped like the session `@supabase/ssr` writes and its token has not
 * expired; everything else is charged to the IP.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  clientBucket,
  limitMutationRequest,
  limitPublicMarketRequest,
  resetRateLimitForTests,
} from "@/lib/rate-limit";

function b64url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

/** An access token shaped as Supabase mints them. The signature is junk on purpose. */
function token(payload: Record<string, unknown>): string {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  return `${header}.${b64url(JSON.stringify(payload))}.not-a-real-signature`;
}

const IN_AN_HOUR = Math.floor(Date.now() / 1000) + 3600;

/** The cookie value `@supabase/ssr` 0.12 writes for a signed-in session. */
function session(sub: string, exp = IN_AN_HOUR): string {
  const body = JSON.stringify({
    access_token: token({ sub, exp, role: "authenticated" }),
    token_type: "bearer",
    expires_in: 3600,
    expires_at: exp,
    refresh_token: "refresh-token-value",
    user: { id: sub, aud: "authenticated" },
  });
  return `base64-${b64url(body)}`;
}

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

function withCookies(order: string[]): Request {
  const h = new Headers();
  h.set("cookie", order.join("; "));
  return new Request("https://upsidelab.app/api/quotes", { headers: h });
}

beforeEach(() => resetRateLimitForTests());

describe("clientBucket", () => {
  it("tells two students on one school network apart", () => {
    const a = clientBucket(quoteRequest({ ip: "203.0.113.9", session: session("user-a") }));
    const b = clientBucket(quoteRequest({ ip: "203.0.113.9", session: session("user-b") }));
    expect(a).not.toBe(b);
  });

  it("gives one reader the same bucket every time, whatever the network", () => {
    const first = clientBucket(quoteRequest({ ip: "203.0.113.9", session: session("user-a") }));
    const again = clientBucket(quoteRequest({ ip: "198.51.100.4", session: session("user-a") }));
    expect(first).toBe(again);
  });

  it("charges the account, not the cookie bytes, so a refreshed token is the same reader", () => {
    const before = clientBucket(quoteRequest({ session: session("user-a", IN_AN_HOUR) }));
    const after = clientBucket(quoteRequest({ session: session("user-a", IN_AN_HOUR + 3600) }));
    expect(before).toBe(after);
  });

  it("falls back to the IP when nobody is signed in", () => {
    const bucket = clientBucket(quoteRequest({ ip: "203.0.113.9" }));
    expect(bucket).toBe("i:203.0.113.9");
  });

  it("cannot collide a session bucket with an IP bucket", () => {
    expect(clientBucket(quoteRequest({ session: session("x") })).startsWith("s:")).toBe(true);
    expect(clientBucket(quoteRequest({ ip: "1.2.3.4" })).startsWith("i:")).toBe(true);
  });

  it("charges a random value under the session cookie's name to the IP", () => {
    for (const junk of ["aaa", "x", Math.random().toString(36), "base64-!!!", "a.b.c"]) {
      expect(clientBucket(quoteRequest({ ip: "203.0.113.9", session: junk }))).toBe(
        "i:203.0.113.9"
      );
    }
  });

  it("charges an expired token to the IP", () => {
    const stale = session("user-a", Math.floor(Date.now() / 1000) - 60);
    expect(clientBucket(quoteRequest({ ip: "203.0.113.9", session: stale }))).toBe(
      "i:203.0.113.9"
    );
  });

  it("charges a token with no subject, or an absurd one, to the IP", () => {
    const wrap = (payload: Record<string, unknown>) =>
      `base64-${b64url(JSON.stringify({ access_token: token(payload) }))}`;
    expect(
      clientBucket(quoteRequest({ ip: "203.0.113.9", session: wrap({ exp: IN_AN_HOUR }) }))
    ).toBe("i:203.0.113.9");
    expect(
      clientBucket(
        quoteRequest({ ip: "203.0.113.9", session: wrap({ sub: "", exp: IN_AN_HOUR }) })
      )
    ).toBe("i:203.0.113.9");
    expect(
      clientBucket(
        quoteRequest({
          ip: "203.0.113.9",
          session: wrap({ sub: "x".repeat(200), exp: IN_AN_HOUR }),
        })
      )
    ).toBe("i:203.0.113.9");
    expect(
      clientBucket(quoteRequest({ ip: "203.0.113.9", session: wrap({ sub: "user-a" }) }))
    ).toBe("i:203.0.113.9");
  });

  it("reads a bare token and the older bare-JSON cookie as the same account", () => {
    const jwt = token({ sub: "user-a", exp: IN_AN_HOUR });
    const raw = clientBucket(quoteRequest({ session: jwt }));
    const json = clientBucket(
      quoteRequest({
        session: encodeURIComponent(JSON.stringify({ access_token: jwt })),
      })
    );
    const current = clientBucket(quoteRequest({ session: session("user-a") }));
    expect(raw).toBe(current);
    expect(json).toBe(current);
  });

  it("reads a chunked cookie as one session, whatever order it arrives in", () => {
    const value = session("user-a");
    const cut = Math.floor(value.length / 2);
    const forward = withCookies([
      `sb-ref-auth-token.0=${value.slice(0, cut)}`,
      `sb-ref-auth-token.1=${value.slice(cut)}`,
    ]);
    const backward = withCookies([
      `sb-ref-auth-token.1=${value.slice(cut)}`,
      `sb-ref-auth-token.0=${value.slice(0, cut)}`,
    ]);
    const whole = withCookies([`sb-ref-auth-token=${value}`]);
    expect(clientBucket(forward)).toBe(clientBucket(whole));
    expect(clientBucket(backward)).toBe(clientBucket(whole));
    expect(clientBucket(whole).startsWith("s:")).toBe(true);
  });

  it("ignores cookies that are not the session", () => {
    const req = withCookies(["portfell-locked=1", "upside-active-sheet-id=abc"]);
    expect(clientBucket(req)).toBe("i:unknown");
  });
});

describe("a class opening the app together", () => {
  it("does not spend one budget between all of them", () => {
    // Each student loads the app twenty times: forty quote requests each,
    // well inside the 120 they are individually allowed.
    const ip = "203.0.113.9";
    const cookies = Array.from({ length: 25 }, (_, i) => session(`student-${i}`));
    for (const cookie of cookies) {
      for (let call = 0; call < 40; call++) {
        const result = limitPublicMarketRequest(quoteRequest({ ip, session: cookie }));
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

  it("still stops a scrape loop that sends a new random cookie every time", () => {
    const ip = "203.0.113.9";
    let refusedAt = -1;
    for (let i = 0; i < 200; i++) {
      const result = limitPublicMarketRequest(
        quoteRequest({ ip, session: `junk-${i}-${Math.random().toString(36)}` })
      );
      if (result && !result.ok) {
        refusedAt = i;
        break;
      }
    }
    expect(refusedAt).toBe(120);
  });

  it("still caps mutations from a loop rotating a random cookie", () => {
    const ip = "203.0.113.9";
    let refusedAt = -1;
    for (let i = 0; i < 200; i++) {
      const headers = new Headers({
        "x-forwarded-for": ip,
        cookie: `sb-uzrnybyggznpvgxgrvgl-auth-token=junk-${i}`,
      });
      const result = limitMutationRequest(
        new Request("https://upsidelab.app/api/holdings", { method: "POST", headers })
      );
      if (result && !result.ok) {
        refusedAt = i;
        break;
      }
    }
    expect(refusedAt).toBe(120);
  });
});
