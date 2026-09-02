import { readFileSync } from "node:fs";
import { join } from "node:path";

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  The one question asked between proving a mailbox and being signed in with it.

  A Google sign-in with an address somebody had added to their account used to
  mint the session on the spot, so the person at the keyboard proved one
  mailbox and landed in an account named by another, with nothing on screen
  saying whose. Read the other way round, anybody who had once talked a
  stranger into confirming a link owned that stranger's sign-ins from then on.
*/

process.env.SUPABASE_SERVICE_ROLE_KEY = "a-service-role-key";

const consumeEmailLogin = vi.fn();
const magicTokenFor = vi.fn();
const verifyOtp = vi.fn();

vi.mock("@/lib/auth/email-login", () => ({
  consumeEmailLogin: (token: string) => consumeEmailLogin(token),
}));

vi.mock("@/lib/auth/linked-addresses", () => ({
  magicTokenFor: (email: string) => magicTokenFor(email),
}));

vi.mock("@/lib/auth/ensure-profile", () => ({
  ensureProfileAndClaims: async () => undefined,
}));

vi.mock("@/lib/supabase/server-auth", () => ({
  createSupabaseAuthForResponse: async () => ({
    auth: { verifyOtp: (args: unknown) => verifyOtp(args) },
  }),
}));

const { CONTINUE_COOKIE, sealContinue } = await import("@/lib/auth/continue-session");
const { GET, POST } = await import("@/app/auth/continue/route");

const HERE = "http://localhost:3000/auth/continue";

const PASS = {
  address: "second@x.com",
  primaryEmail: "martin@upthink.ee",
  next: "/pulse",
};

function request(sealed: string | null, method: "GET" | "POST") {
  const req = new NextRequest(HERE, { method });
  if (sealed) req.cookies.set(CONTINUE_COOKIE, sealed);
  return req;
}

beforeEach(() => {
  consumeEmailLogin.mockReset();
  magicTokenFor.mockReset();
  verifyOtp.mockReset();

  magicTokenFor.mockResolvedValue("hashed");
  consumeEmailLogin.mockResolvedValue({
    kind: "ok",
    hashedToken: "hashed-from-link",
    next: "/growth",
  });
  verifyOtp.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
});

describe("GET /auth/continue", () => {
  it("names the account, masked, and signs nobody in", async () => {
    const res = await GET(request(sealContinue(PASS), "GET"));
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html).toContain("ma...@upthink.ee");
    expect(html).toContain("second@x.com");
    expect(html).not.toContain("martin@upthink.ee");
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(magicTokenFor).not.toHaveBeenCalled();
  });

  it("offers a way out that is not the button", async () => {
    const html = await (await GET(request(sealContinue(PASS), "GET"))).text();
    expect(html).toContain('href="/login"');
    expect(html).toMatch(/method="post"/);
  });

  it("is not indexed and not cached", async () => {
    const res = await GET(request(sealContinue(PASS), "GET"));
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.text()).toContain('name="robots" content="noindex"');
  });

  it("has nothing to ask without a pass", async () => {
    const res = await GET(request(null, "GET"));
    expect(new URL(res.headers.get("location")!).pathname).toBe("/login");
  });
});

describe("POST /auth/continue", () => {
  it("mints the session for the account the pass names", async () => {
    const res = await POST(request(sealContinue(PASS), "POST"));

    expect(magicTokenFor).toHaveBeenCalledWith("martin@upthink.ee");
    expect(verifyOtp).toHaveBeenCalledWith({
      type: "magiclink",
      token_hash: "hashed",
    });
    expect(new URL(res.headers.get("location")!).pathname).toBe("/pulse");
  });

  it("spends the sign-in link here when that is the road it came by", async () => {
    const res = await POST(
      request(sealContinue({ ...PASS, loginToken: "tok" }), "POST")
    );

    expect(consumeEmailLogin).toHaveBeenCalledWith("tok");
    expect(magicTokenFor).not.toHaveBeenCalled();
    expect(verifyOtp).toHaveBeenCalledWith({
      type: "magiclink",
      token_hash: "hashed-from-link",
    });
    expect(new URL(res.headers.get("location")!).pathname).toBe("/pulse");
  });

  it("clears the pass, so the question cannot be answered twice", async () => {
    const res = await POST(request(sealContinue(PASS), "POST"));
    expect(res.cookies.get(CONTINUE_COOKIE)?.value).toBe("");
  });

  it("mints nothing without a pass", async () => {
    const res = await POST(request(null, "POST"));

    expect(verifyOtp).not.toHaveBeenCalled();
    expect(consumeEmailLogin).not.toHaveBeenCalled();
    expect(new URL(res.headers.get("location")!).searchParams.get("signin")).toBe(
      "failed"
    );
  });

  it("mints nothing for a pass somebody edited", async () => {
    const sealed = sealContinue(PASS)!;
    const [, signature] = sealed.split(".");
    const swapped = Buffer.from(
      JSON.stringify({ ...PASS, primaryEmail: "thief@x.com", exp: Date.now() + 60_000 }),
      "utf8"
    ).toString("base64url");

    const res = await POST(request(`${swapped}.${signature}`, "POST"));

    expect(verifyOtp).not.toHaveBeenCalled();
    expect(new URL(res.headers.get("location")!).searchParams.get("signin")).toBe(
      "failed"
    );
  });
});

describe("the forged-request gate", () => {
  it("reaches this path, because the proxy's matcher excludes assets and not dots", () => {
    const proxy = readFileSync(join(process.cwd(), "src/proxy.ts"), "utf8");
    expect(proxy).not.toMatch(/\.\*\\\\\.\.\*\)/);
    expect(proxy.indexOf("isMutatingRequest(request.method)")).toBeLessThan(
      proxy.indexOf("if (!isApi) {")
    );
  });
});
