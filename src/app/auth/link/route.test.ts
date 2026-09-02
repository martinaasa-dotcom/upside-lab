import { readFileSync } from "node:fs";
import { join } from "node:path";

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  The confirmation link for a second address.

  It used to spend its token on GET, which is what a mail scanner does to
  every URL in a message before the person reads it. The scanner confirmed
  the address, and the person who opened the mail found a link already used.
  The repo's rule for the sign-in link and the unsubscribe link is the same:
  GET shows a button, POST does the work.
<<<<<<< HEAD
*/

const confirmAddressLink = vi.fn();

vi.mock("@/lib/auth/linked-addresses", () => ({
  confirmAddressLink: (token: string) => confirmAddressLink(token),
=======

  And it used to name neither the address nor the account on that button,
  which is asking somebody to agree to something nobody has described. The
  page says whose account it opens now, and the POST carries whoever is
  signed in here, because one case cannot be settled by the mail alone.
*/

const confirmAddressLink = vi.fn();
const pendingAddressLink = vi.fn();
const getAuthUser = vi.fn();

vi.mock("@/lib/auth/linked-addresses", () => ({
  confirmAddressLink: (token: string, opts?: unknown) =>
    confirmAddressLink(token, opts),
  pendingAddressLink: (token: string) => pendingAddressLink(token),
}));

vi.mock("@/lib/supabase/server-auth", () => ({
  getAuthUser: () => getAuthUser(),
>>>>>>> worktree-wf_f1b85063-2b2-4
}));

const { GET, POST } = await import("@/app/auth/link/route");

const TOKEN = "a-minted-token";
const HERE = "http://localhost:3000/auth/link";

function get(query = `?token=${TOKEN}`) {
  return GET(new NextRequest(`${HERE}${query}`));
}

function post(fields: Record<string, string>, query = "") {
  return POST(
    new NextRequest(`${HERE}${query}`, {
      method: "POST",
      body: new URLSearchParams(fields),
    })
  );
}

beforeEach(() => {
  confirmAddressLink.mockReset();
<<<<<<< HEAD
  confirmAddressLink.mockResolvedValue({ kind: "linked", email: "second@x.com" });
=======
  pendingAddressLink.mockReset();
  getAuthUser.mockReset();

  confirmAddressLink.mockResolvedValue({ kind: "linked", email: "second@x.com" });
  pendingAddressLink.mockResolvedValue({
    email: "second@x.com",
    maskedPrimary: "ma...@upthink.ee",
    account: "user-1",
  });
  getAuthUser.mockResolvedValue(null);
>>>>>>> worktree-wf_f1b85063-2b2-4
});

describe("GET /auth/link", () => {
  it("shows a button and spends nothing", async () => {
    const res = await get();
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(html).toMatch(/method="post"/);
    expect(html).toContain('action="/auth/link"');
    expect(html).toContain(`name="token" value="${TOKEN}"`);
    expect(confirmAddressLink).not.toHaveBeenCalled();
  });

<<<<<<< HEAD
=======
  it("names the account the link would open, and the address", async () => {
    const html = await (await get()).text();

    // Somebody has to be able to recognise the account before agreeing to it.
    expect(html).toContain("ma...@upthink.ee");
    expect(html).toContain("second@x.com");
  });

>>>>>>> worktree-wf_f1b85063-2b2-4
  it("is not indexed and not cached", async () => {
    const res = await get();
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.text()).toContain('name="robots" content="noindex"');
  });

  it("escapes the token before writing it into the page", async () => {
    // Anything can be put in a query string, and a page that prints it as
    // markup is a page a stranger can make say anything on our origin.
    const html = await (await get('?token=%22%3E%3Cscript%3E')).text();
    expect(html).not.toContain("<script>");
    expect(html).toContain("&quot;&gt;&lt;script&gt;");
  });

<<<<<<< HEAD
=======
  it("escapes the address it read back out of the table", async () => {
    pendingAddressLink.mockResolvedValue({
      email: '"><script>x</script>@x.com',
      maskedPrimary: "ma...@x.com",
      account: "user-1",
    });

    const html = await (await get()).text();
    expect(html).not.toContain("<script>");
  });

>>>>>>> worktree-wf_f1b85063-2b2-4
  it("sends a link with no token to the page that says so", async () => {
    const res = await get("");
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).searchParams.get("problem")).toBe(
      "missing-token"
    );
    expect(confirmAddressLink).not.toHaveBeenCalled();
  });
<<<<<<< HEAD
=======

  it("says a spent or expired link is spent rather than offering a button", async () => {
    pendingAddressLink.mockResolvedValue(null);

    const res = await get();
    expect(new URL(res.headers.get("location")!).searchParams.get("problem")).toBe(
      "expired"
    );
  });
>>>>>>> worktree-wf_f1b85063-2b2-4
});

describe("POST /auth/link", () => {
  it("spends the token from the form and lands on the linked page", async () => {
    const res = await post({ token: TOKEN });

<<<<<<< HEAD
    expect(confirmAddressLink).toHaveBeenCalledWith(TOKEN);
=======
    expect(confirmAddressLink).toHaveBeenCalledWith(TOKEN, { signedInUserId: null });
>>>>>>> worktree-wf_f1b85063-2b2-4
    expect(res.status).toBe(307);
    const to = new URL(res.headers.get("location")!);
    expect(to.pathname).toBe("/auth/linked");
    expect(to.searchParams.get("email")).toBe("second@x.com");
    expect(to.searchParams.get("problem")).toBeNull();
  });

<<<<<<< HEAD
=======
  it("carries whoever is signed in here, because one case turns on it", async () => {
    getAuthUser.mockResolvedValue({ id: "user-1" });

    await post({ token: TOKEN });

    expect(confirmAddressLink).toHaveBeenCalledWith(TOKEN, {
      signedInUserId: "user-1",
    });
  });

>>>>>>> worktree-wf_f1b85063-2b2-4
  it("carries the outcome word through unchanged when it fails", async () => {
    confirmAddressLink.mockResolvedValue({ kind: "fail", reason: "address-taken" });

    const res = await post({ token: TOKEN });

    expect(new URL(res.headers.get("location")!).searchParams.get("problem")).toBe(
      "address-taken"
    );
  });

<<<<<<< HEAD
  it("takes the token off the query when the body has none", async () => {
    await post({}, `?token=${TOKEN}`);
    expect(confirmAddressLink).toHaveBeenCalledWith(TOKEN);
=======
  it("passes the sign-in-first refusal on so the page can explain it", async () => {
    confirmAddressLink.mockResolvedValue({ kind: "fail", reason: "sign-in-first" });

    const res = await post({ token: TOKEN });

    expect(new URL(res.headers.get("location")!).searchParams.get("problem")).toBe(
      "sign-in-first"
    );
  });

  it("takes the token off the query when the body has none", async () => {
    await post({}, `?token=${TOKEN}`);
    expect(confirmAddressLink).toHaveBeenCalledWith(TOKEN, { signedInUserId: null });
>>>>>>> worktree-wf_f1b85063-2b2-4
  });

  it("does not ask the database about a missing token", async () => {
    const res = await post({});
    expect(confirmAddressLink).not.toHaveBeenCalled();
    expect(new URL(res.headers.get("location")!).searchParams.get("problem")).toBe(
      "missing-token"
    );
  });
});

<<<<<<< HEAD
=======
describe("the /auth/linked page", () => {
  it("has a sentence for every word this route can send it", () => {
    const page = readFileSync(
      join(process.cwd(), "src/app/auth/linked/page.tsx"),
      "utf8"
    );

    const keys = page.slice(
      page.indexOf("const PROBLEMS"),
      page.indexOf("export default")
    );

    for (const word of [
      "expired",
      "address-taken",
      "sign-in-first",
      "missing-token",
      "link-failed",
      "not-configured",
    ]) {
      expect(keys).toContain(word);
    }
  });
});

>>>>>>> worktree-wf_f1b85063-2b2-4
describe("the forged-request gate", () => {
  it("stands in front of this POST, because it runs before the /api/ branch", () => {
    /*
      This is a POST on a page path, like /auth/email/complete. The gate in
      src/proxy.ts refuses a cross-site mutation on every path before it
      asks whether the path is an API route, so a new page-path POST is
      covered without anybody remembering this file. The proxy's matcher
      has to reach this path, so it excludes real asset extensions rather
      than every path carrying a dot.
    */
    const proxy = readFileSync(join(process.cwd(), "src/proxy.ts"), "utf8");
    const gate = proxy.indexOf("isMutatingRequest(request.method)");
    const apiBranch = proxy.indexOf("if (!isApi) {");
    expect(gate).toBeGreaterThan(-1);
    expect(apiBranch).toBeGreaterThan(gate);
    expect(proxy).toMatch(/matcher: \[/);
    // The exclusion names extensions, so /auth/link still matches.
    expect(proxy).toMatch(/_next\/static\|_next\/image/);
    expect(proxy).not.toMatch(/\.\*\\\\\.\.\*\)/);
  });
});
