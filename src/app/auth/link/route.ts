import { NextResponse, type NextRequest } from "next/server";

import {
  confirmAddressLink,
  pendingAddressLink,
} from "@/lib/auth/linked-addresses";
import { PRODUCT_NAME } from "@/lib/product";
import { isLocalHost, siteUrl } from "@/lib/site-url";
import { getAuthUser } from "@/lib/supabase/server-auth";

export const dynamic = "force-dynamic";

/*
  The far end of a confirmation sent to an address somebody wants to add.

  Two methods, and the difference between them is the whole design, the same
  as the sign-in link and the unsubscribe link.

  GET shows a button and changes nothing. Mail scanners, link previewers and
  corporate security gateways fetch every URL in a message before anybody
  reads it, and a confirmation that fires on a fetch is an address joined to
  an account by a machine that never held the mailbox. Worse, it is spent:
  the token is good once, so the person who actually opens the mail finds a
  link that has already been used.

  POST spends the token. It is the only method that changes anything, and
  the forged-request gate in `src/proxy.ts` stands in front of it, as it
  does in front of every mutation on every path.

  Deliberately not behind a session. The proof this route wants is that the
  person holds the mailbox the link was sent to, and that is the link itself:
  they may well be reading it on a phone that has never been signed in to
  Upside Lab, which is the ordinary case rather than the odd one. The token
  names the account, so nothing is guessed at.

  It signs nobody in either. Confirming an address and using it are two
  different acts, and a link sitting in a mailbox that opened somebody's
  account would be the thing this whole feature exists to prevent.
*/

/*
  The token goes back out inside an attribute, and anything at all can be
  put in a query string, so it is escaped rather than trusted. A minted
  token is base64url and needs none of this; a stranger's text does.
*/
function attr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Plain and self-contained: this is read in a tab with none of the app around it. */
function page(title: string, body: string, token: string): NextResponse {
  const form =
    `<form method="post" action="/auth/link">` +
    `<input type="hidden" name="token" value="${attr(token)}">` +
    `<button type="submit">Connect this address</button></form>`;

  return new NextResponse(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
      `<meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<meta name="robots" content="noindex">` +
      `<title>${title}</title>` +
      `<style>body{margin:0;min-height:100dvh;display:flex;align-items:center;` +
      `justify-content:center;padding:24px;background:#0a0a0a;color:#fafafa;` +
      `font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}` +
      `main{max-width:28rem;width:100%}h1{font-size:1.125rem;margin:0 0 8px}` +
      `p{font-size:.875rem;line-height:1.6;color:#b5b5b5;margin:0 0 20px}` +
      `button{appearance:none;border:none;border-radius:.5rem;padding:.5rem 1rem;` +
      `font:inherit;font-size:.875rem;font-weight:500;cursor:pointer;` +
      `background:#e8c37a;color:#1a1206}</style></head>` +
      `<body><main><h1>${title}</h1><p>${body}</p>${form}</main></body></html>`,
    {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    }
  );
}

function originOf(request: NextRequest): string {
  const url = new URL(request.url);
  return isLocalHost(url.hostname) ? url.origin : siteUrl();
}

function done(origin: string, problem: string | null, email?: string) {
  const url = new URL("/auth/linked", origin);
  if (problem) url.searchParams.set("problem", problem);
  else if (email) url.searchParams.set("email", email);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const origin = originOf(request);
  const token = new URL(request.url).searchParams.get("token")?.trim();

  if (!token) return done(origin, "missing-token");

  /*
    Read without being spent, so the page can say what is actually being
    agreed to. It used to say "connect this address" and name neither the
    address nor the account, which asks somebody to agree to something nobody
    has described. Whose account it opens is the whole of the question.
  */
  const pending = await pendingAddressLink(token);
  if (!pending) return done(origin, "expired");

  /*
    Both of these come out of the database rather than out of the query, so
    they are already the shape the table's own checks allow. Escaped anyway,
    because the rule for anything written into markup is that it is escaped at
    the point it is written, not wherever it happened to come from.
  */
  const primary = attr(pending.maskedPrimary);
  const address = attr(pending.email);

  return page(
    `Connect this address to the ${PRODUCT_NAME} account for ${primary}?`,
    `Press the button and ${address} will also sign in to that account, with the same portfolios and the same circles. If you do not recognise ${primary}, close this page and nothing happens. Opening the page is not enough on purpose: a mail app often loads the link before you do. Nothing signs you in here.`,
    token
  );
}

export async function POST(request: NextRequest) {
  const origin = originOf(request);

  /*
    From the form first, which is where the button puts it. The query is
    accepted too so a client that posted straight to the address in the mail
    lands in the same place.
  */
  const form = await request.formData().catch(() => null);
  const token =
    String(form?.get("token") ?? "").trim() ||
    new URL(request.url).searchParams.get("token")?.trim() ||
    "";

  if (!token) return done(origin, "missing-token");

  /*
    Who is signed in here, which decides one case and only one: an address that
    has no account of its own. Holding the mailbox is the whole proof for every
    other case, and asking a person reading their mail on a phone that has
    never seen this app to sign in first would be asking them to prove
    something they have already proved. See `confirmAddressLink` for why that
    one case is different.
  */
  const me = await getAuthUser();

  const result = await confirmAddressLink(token, { signedInUserId: me?.id ?? null });

  if (result.kind === "fail") return done(origin, result.reason);

  return done(origin, null, result.email);
}
