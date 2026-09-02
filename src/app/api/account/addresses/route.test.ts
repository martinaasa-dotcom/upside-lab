import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ADDRESS_MESSAGES } from "@/lib/auth/account-addresses";

/*
  Adding another address to your account.

  The field takes any address in the world, and it used to say which of them
  already had an Upside Lab account: "that address already reaches another
  account", "that address already has an account with things in it". Anybody
  signed in could type addresses into it and read the answer off the screen.
  A refusal about the address goes to that mailbox now, and the screen says the
  same sentence either way.
*/

const startAddressLink = vi.fn();
const user = { id: "user-me", email: "martin@upthink.ee" };

vi.mock("@/lib/auth/linked-addresses", () => ({
  listAddresses: async () => [],
  startAddressLink: (input: unknown) => startAddressLink(input),
}));

vi.mock("@/lib/supabase/server-auth", () => ({
  requireAuthUser: async () => ({ user }),
  createSupabaseServerAuth: async () => null,
}));

vi.mock("@/lib/auth/email-mx", () => ({
  domainAcceptsMail: async () => true,
}));

vi.mock("@/lib/rate-limit-durable", () => ({
  takeDurableRateLimit: async () => ({ ok: true }),
}));

const { POST } = await import("@/app/api/account/addresses/route");

function post(email: string) {
  return POST(
    new NextRequest("http://localhost:3000/api/account/addresses", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, confirmed: true }),
    })
  );
}

beforeEach(() => {
  startAddressLink.mockReset();
});

describe("what the screen is told", () => {
  it("says check that inbox when a confirmation really went out", async () => {
    startAddressLink.mockResolvedValue({
      kind: "sent",
      email: "second@x.com",
      closes: false,
    });

    const res = await post("second@x.com");
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.sent).toBe(ADDRESS_MESSAGES.sent);
  });

  it("says exactly the same thing when the address is spoken for", async () => {
    startAddressLink.mockResolvedValue({ kind: "quiet" });

    const res = await post("taken@x.com");
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.sent).toBe(ADDRESS_MESSAGES.sent);
    // Nothing anywhere in the answer separates one case from the other.
    expect(JSON.stringify(body)).not.toMatch(/already|account with things/i);
  });

  it("still tells the caller the truth about their own account", async () => {
    startAddressLink.mockResolvedValue({ kind: "already" });

    const body = await (await post("martin@upthink.ee")).json();
    expect(body.note).toBe(ADDRESS_MESSAGES.already);
  });

  it("says out loud when the caller has no room for another address", async () => {
    startAddressLink.mockResolvedValue({ kind: "error", code: "limit" });

    const res = await post("fifth@x.com");
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(ADDRESS_MESSAGES.limit);
  });

  it("answers a refused pace with 429 rather than a bad request", async () => {
    startAddressLink.mockResolvedValue({ kind: "error", code: "slow-down" });

    const res = await post("second@x.com");
    expect(res.status).toBe(429);
    expect((await res.json()).error).toBe(ADDRESS_MESSAGES["slow-down"]);
  });

  it("warns before the link is opened when opening it closes an empty account", async () => {
    startAddressLink.mockResolvedValue({
      kind: "sent",
      email: "second@x.com",
      closes: true,
    });

    const body = await (await post("second@x.com")).json();
    expect(body.sent).toMatch(/never been used/);
  });
});
