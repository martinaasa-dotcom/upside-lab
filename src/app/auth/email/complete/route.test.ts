import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CONTINUE_COOKIE, openContinue } from "@/lib/auth/continue-session";

/*
  The button on the sign-in page.

  Two things it used to do without asking. It wrote fresh session cookies over
  whatever session was already in the browser, so a link opened on a shared
  laptop, or forwarded by somebody being helpful, quietly swapped whose account
  was open. And where the address was a second one somebody had added to their
  account, it opened that account with nothing on screen ever naming it.
*/

process.env.SUPABASE_SERVICE_ROLE_KEY = "a-service-role-key";

const emailLoginTarget = vi.fn();
const consumeEmailLogin = vi.fn();
const getAuthUser = vi.fn();
const verifyOtp = vi.fn();

vi.mock("@/lib/auth/email-login", () => ({
  emailLoginTarget: (token: string) => emailLoginTarget(token),
  consumeEmailLogin: (token: string) => consumeEmailLogin(token),
}));

vi.mock("@/lib/auth/ensure-profile", () => ({
  ensureProfileAndClaims: async () => undefined,
}));

vi.mock("@/lib/rate-limit-durable", () => ({
  takeDurableRateLimit: async () => ({ ok: true }),
}));

vi.mock("@/lib/supabase/server-auth", () => ({
  getAuthUser: () => getAuthUser(),
  createSupabaseAuthForResponse: async () => ({
    auth: { verifyOtp: (args: unknown) => verifyOtp(args) },
  }),
}));

const { POST } = await import("@/app/auth/email/complete/route");

const HERE = "http://localhost:3000/auth/email/complete";
const TOKEN = "a-minted-token";

function post(fields: Record<string, string> = { token: TOKEN }) {
  return POST(
    new NextRequest(HERE, { method: "POST", body: new URLSearchParams(fields) })
  );
}

beforeEach(() => {
  emailLoginTarget.mockReset();
  consumeEmailLogin.mockReset();
  getAuthUser.mockReset();
  verifyOtp.mockReset();

  emailLoginTarget.mockResolvedValue({
    email: "reader@x.com",
    next: "/pulse",
    account: { userId: "u1", primaryEmail: "reader@x.com" },
  });
  consumeEmailLogin.mockResolvedValue({
    kind: "ok",
    hashedToken: "hashed",
    next: "/pulse",
  });
  getAuthUser.mockResolvedValue(null);
  verifyOtp.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
});

describe("the ordinary press", () => {
  it("spends the token and lands where the link was going", async () => {
    const res = await post();

    expect(consumeEmailLogin).toHaveBeenCalledWith(TOKEN);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/pulse");
  });

  it("lets a token it cannot find say in its own words why", async () => {
    // A deployment with no service role and a link that has already been
    // pressed both come back as nothing to read, and those are two different
    // sentences to whoever is holding the link.
    emailLoginTarget.mockResolvedValue(null);
    consumeEmailLogin.mockResolvedValue({ kind: "fail", reason: "not-configured" });

    const res = await post();

    expect(new URL(res.headers.get("location")!).searchParams.get("problem")).toBe(
      "not-configured"
    );
  });
});

describe("a session already open for somebody else", () => {
  it("does not replace it, and hands the token back so the page can ask", async () => {
    getAuthUser.mockResolvedValue({ id: "somebody-else" });

    const res = await post();
    const to = new URL(res.headers.get("location")!);

    expect(consumeEmailLogin).not.toHaveBeenCalled();
    expect(to.pathname).toBe("/auth/email");
    expect(to.searchParams.get("problem")).toBe("other-session");
    expect(to.searchParams.get("token")).toBe(TOKEN);
  });

  it("goes ahead once the form says out loud to close that one", async () => {
    getAuthUser.mockResolvedValue({ id: "somebody-else" });

    const res = await post({ token: TOKEN, switch: "1" });

    expect(consumeEmailLogin).toHaveBeenCalledWith(TOKEN);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/pulse");
  });

  it("asks nothing when the session already belongs to the account the link opens", async () => {
    getAuthUser.mockResolvedValue({ id: "u1" });

    const res = await post();

    expect(new URL(res.headers.get("location")!).pathname).toBe("/pulse");
  });
});

describe("an address that opens somebody else's account", () => {
  it("stops and asks, spending nothing", async () => {
    emailLoginTarget.mockResolvedValue({
      email: "second@x.com",
      next: "/pulse",
      account: { userId: "u1", primaryEmail: "martin@upthink.ee" },
    });

    const res = await post();

    expect(consumeEmailLogin).not.toHaveBeenCalled();
    expect(new URL(res.headers.get("location")!).pathname).toBe("/auth/continue");
  });

  it("carries the account and the unspent token into the question", async () => {
    emailLoginTarget.mockResolvedValue({
      email: "second@x.com",
      next: "/pulse",
      account: { userId: "u1", primaryEmail: "martin@upthink.ee" },
    });

    const res = await post();
    const pass = openContinue(res.cookies.get(CONTINUE_COOKIE)?.value);

    expect(pass?.address).toBe("second@x.com");
    expect(pass?.primaryEmail).toBe("martin@upthink.ee");
    expect(pass?.loginToken).toBe(TOKEN);
    expect(pass?.next).toBe("/pulse");
  });

  it("does not ask when the address is the account's own", async () => {
    emailLoginTarget.mockResolvedValue({
      email: "reader@x.com",
      next: "/",
      account: { userId: "u1", primaryEmail: "Reader@X.com" },
    });

    const res = await post();

    expect(consumeEmailLogin).toHaveBeenCalled();
    expect(new URL(res.headers.get("location")!).pathname).toBe("/pulse");
  });

  it("does not ask a first-time signer-in anything", async () => {
    emailLoginTarget.mockResolvedValue({
      email: "new@x.com",
      next: "/",
      account: null,
    });

    const res = await post();

    expect(consumeEmailLogin).toHaveBeenCalled();
    expect(new URL(res.headers.get("location")!).pathname).toBe("/pulse");
  });
});
