import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  GOOGLE_OAUTH_COOKIE,
  encodeGoogleOAuthCookie,
} from "@/lib/auth/google-oauth";
import { CONTINUE_COOKIE, openContinue } from "@/lib/auth/continue-session";

/*
  Coming back from Google.

  An address somebody added to their account opens that account, which is the
  whole feature and also the one place it could go wrong in silence: the person
  at the keyboard proved one mailbox and was handed a session on an account
  named by a different one, with nothing on screen ever saying whose. Read from
  the other end, anybody who once talked a stranger into confirming a link
  owned that stranger's sign-ins from then on. So it asks now.
*/

process.env.SUPABASE_SERVICE_ROLE_KEY = "a-service-role-key";
process.env.GOOGLE_CLIENT_ID = "client-id";
process.env.GOOGLE_CLIENT_SECRET = "client-secret";

const STATE = "a-state-value-long-enough";
const ORIGIN = "http://localhost:3000";

const accountForAddress = vi.fn();
const magicTokenFor = vi.fn();
const hashedSessionTokenForAddress = vi.fn();
const googleEmailFromIdToken = vi.fn();
const verifyOtp = vi.fn();
const signInWithIdToken = vi.fn();

let cookie: string | undefined;

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === GOOGLE_OAUTH_COOKIE && cookie ? { value: cookie } : undefined,
  }),
}));

vi.mock("@/lib/auth/google-oauth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/google-oauth")>();
  return {
    ...actual,
    exchangeGoogleCode: async () => ({ idToken: "id-token" }),
  };
});

vi.mock("@/lib/auth/id-token", () => ({
  googleEmailFromIdToken: () => googleEmailFromIdToken(),
}));

vi.mock("@/lib/auth/linked-addresses", () => ({
  accountForAddress: (email: string) => accountForAddress(email),
  magicTokenFor: (email: string) => magicTokenFor(email),
  hashedSessionTokenForAddress: (email: string) => hashedSessionTokenForAddress(email),
  connectGoogleAddress: async () => ({ kind: "linked", email: "x@x.com" }),
}));

vi.mock("@/lib/auth/ensure-profile", () => ({
  ensureProfileAndClaims: async () => undefined,
}));

vi.mock("@/lib/supabase/server-auth", () => ({
  createSupabaseServerAuth: async () => null,
  createSupabaseAuthForResponse: async () => ({
    auth: {
      verifyOtp: (args: unknown) => verifyOtp(args),
      signInWithIdToken: (args: unknown) => signInWithIdToken(args),
    },
  }),
}));

const { GET } = await import("@/app/auth/google/callback/route");

function callback() {
  return GET(
    new Request(`${ORIGIN}/auth/google/callback?code=a-code&state=${STATE}`)
  );
}

beforeEach(() => {
  accountForAddress.mockReset();
  magicTokenFor.mockReset();
  hashedSessionTokenForAddress.mockReset();
  googleEmailFromIdToken.mockReset();
  verifyOtp.mockReset();
  signInWithIdToken.mockReset();

  cookie = encodeGoogleOAuthCookie({
    state: STATE,
    next: "/pulse",
    origin: ORIGIN,
    intent: "sign-in",
  });

  googleEmailFromIdToken.mockReturnValue("second@x.com");
  accountForAddress.mockResolvedValue(null);
  magicTokenFor.mockResolvedValue("hashed");
  hashedSessionTokenForAddress.mockResolvedValue(null);
  verifyOtp.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
  signInWithIdToken.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
});

describe("an address added to somebody else's account", () => {
  it("stops and asks instead of minting the session", async () => {
    accountForAddress.mockResolvedValue({
      userId: "u1",
      primaryEmail: "martin@upthink.ee",
    });

    const res = await callback();

    expect(verifyOtp).not.toHaveBeenCalled();
    expect(magicTokenFor).not.toHaveBeenCalled();
    expect(new URL(res.headers.get("location")!).pathname).toBe("/auth/continue");
  });

  it("carries the account, the proved address and the destination into the question", async () => {
    accountForAddress.mockResolvedValue({
      userId: "u1",
      primaryEmail: "martin@upthink.ee",
    });

    const res = await callback();
    const pass = openContinue(res.cookies.get(CONTINUE_COOKIE)?.value);

    expect(pass?.address).toBe("second@x.com");
    expect(pass?.primaryEmail).toBe("martin@upthink.ee");
    expect(pass?.next).toBe("/pulse");
    // Nothing left to spend on this road, so there is no token in the pass.
    expect(pass?.loginToken).toBeUndefined();
  });

  it("puts the handshake cookie away on the way to the question", async () => {
    accountForAddress.mockResolvedValue({
      userId: "u1",
      primaryEmail: "martin@upthink.ee",
    });

    const res = await callback();
    expect(res.cookies.get(GOOGLE_OAUTH_COOKIE)?.value).toBe("");
  });
});

describe("everything else is unchanged", () => {
  it("asks nothing when the address is the account's own", async () => {
    accountForAddress.mockResolvedValue({
      userId: "u1",
      primaryEmail: "Second@X.com",
    });

    const res = await callback();

    expect(verifyOtp).toHaveBeenCalled();
    expect(new URL(res.headers.get("location")!).pathname).toBe("/pulse");
  });

  it("hands an unknown address straight to Google's own sign-in", async () => {
    const res = await callback();

    expect(signInWithIdToken).toHaveBeenCalled();
    expect(new URL(res.headers.get("location")!).pathname).toBe("/pulse");
  });

  it("refuses a handshake whose state does not match the cookie", async () => {
    cookie = encodeGoogleOAuthCookie({
      state: "a-different-state-value",
      next: "/pulse",
      origin: ORIGIN,
      intent: "sign-in",
    });

    const res = await callback();

    expect(new URL(res.headers.get("location")!).pathname).toBe("/login");
  });
});
