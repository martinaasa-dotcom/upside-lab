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
*/

const confirmAddressLink = vi.fn();

vi.mock("@/lib/auth/linked-addresses", () => ({
  confirmAddressLink: (token: string) => confirmAddressLink(token),
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
  confirmAddressLink.mockResolvedValue({ kind: "linked", email: "second@x.com" });
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

  it("sends a link with no token to the page that says so", async () => {
    const res = await get("");
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).searchParams.get("problem")).toBe(
      "missing-token"
    );
    expect(confirmAddressLink).not.toHaveBeenCalled();
  });
});

describe("POST /auth/link", () => {
  it("spends the token from the form and lands on the linked page", async () => {
    const res = await post({ token: TOKEN });

    expect(confirmAddressLink).toHaveBeenCalledWith(TOKEN);
    expect(res.status).toBe(307);
    const to = new URL(res.headers.get("location")!);
    expect(to.pathname).toBe("/auth/linked");
    expect(to.searchParams.get("email")).toBe("second@x.com");
    expect(to.searchParams.get("problem")).toBeNull();
  });

  it("carries the outcome word through unchanged when it fails", async () => {
    confirmAddressLink.mockResolvedValue({ kind: "fail", reason: "address-taken" });

    const res = await post({ token: TOKEN });

    expect(new URL(res.headers.get("location")!).searchParams.get("problem")).toBe(
      "address-taken"
    );
  });

  it("takes the token off the query when the body has none", async () => {
    await post({}, `?token=${TOKEN}`);
    expect(confirmAddressLink).toHaveBeenCalledWith(TOKEN);
  });

  it("does not ask the database about a missing token", async () => {
    const res = await post({});
    expect(confirmAddressLink).not.toHaveBeenCalled();
    expect(new URL(res.headers.get("location")!).searchParams.get("problem")).toBe(
      "missing-token"
    );
  });
});

describe("the forged-request gate", () => {
  it("stands in front of this POST, because it runs before the /api/ branch", () => {
    /*
      This is a POST on a page path, like /auth/email/complete. The gate in
      src/proxy.ts refuses a cross-site mutation on every path before it
      asks whether the path is an API route, so a new page-path POST is
      covered without anybody remembering this file. The proxy's matcher
      excludes only static assets and paths with a dot in them.
    */
    const proxy = readFileSync(join(process.cwd(), "src/proxy.ts"), "utf8");
    const gate = proxy.indexOf("isMutatingRequest(request.method)");
    const apiBranch = proxy.indexOf("if (!isApi) {");
    expect(gate).toBeGreaterThan(-1);
    expect(apiBranch).toBeGreaterThan(gate);
    expect(proxy).toMatch(/matcher: \["\/\(\(\?!_next\/static\|_next\/image\|\.\*\\\\\.\.\*\)\.\*\)"\]/);
  });
});
