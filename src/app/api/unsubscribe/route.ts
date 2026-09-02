import { NextResponse } from "next/server";
import { escapeLike, likeCanBeExact } from "@/lib/escape-like";
import { profileFromUnsubscribe } from "@/lib/unsubscribe-link";
import { getSupabaseServer, supabaseUsesServiceRole } from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import { observeRoute } from "@/lib/observe-route";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

/*
  The end of the Sunday letter, from inside one.

  Two methods, and the difference between them is the whole design.

  POST turns it off. That is what a mail client does by itself when it sees
  List-Unsubscribe-Post, and what the button below does when a person presses
  it. It is the only method that changes anything.

  GET shows that button and changes nothing, because a GET is not a decision:
  mail scanners, link previewers and corporate security gateways fetch every
  URL in a message before anybody reads it, and an unsubscribe that fires on a
  fetch is one that happens to people who never asked.

  No session is needed, because somebody who has stopped using Upside Lab does
  not have one and is exactly who this is for. What makes that safe is that
  the url carries a signature of whose letter it is, and the only thing the
  signature permits is stopping that letter.
*/

/** Plain and self-contained: this is read in a tab with none of the app around it. */
function page(title: string, body: string, action?: string): NextResponse {
  const form = action
    ? `<form method="post" action="${action}"><button type="submit">Stop the Sunday letter</button></form>`
    : "";

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

const NOT_OURS = [
  "That link is not one of ours",
  "It may have been cut in half by a mail client. You can turn the letter off in Account instead.",
] as const;

function who(request: Request): { id: string; signature: string } | null {
  const url = new URL(request.url);
  const signature = url.searchParams.get("s") ?? "";
  const id = profileFromUnsubscribe(url.searchParams.get("p"), signature);
  return id ? { id, signature } : null;
}

/*
  The form's target, rebuilt from the two parameters that mean anything rather
  than echoed back. Only `p` and `s` are ever checked, so anything else in the
  query string is a stranger's text, and writing it into the page would put
  their markup on our own origin with a valid signature attached.
*/
function actionFor(id: string, signature: string): string {
  const params = new URLSearchParams({ p: id, s: signature });
  return `/api/unsubscribe?${params.toString()}`;
}

async function handleGET(request: Request) {
  const found = who(request);
  if (!found) return page(NOT_OURS[0], NOT_OURS[1]);

  return page(
    "Stop the Sunday letter?",
    "Nothing else changes. Your portfolios, your notes and your account stay exactly as they are, and you can turn the letter back on in Account whenever you like.",
    actionFor(found.id, found.signature)
  );
}

async function handlePOST(request: Request) {
  const found = who(request);
  if (!found) return page(NOT_OURS[0], NOT_OURS[1]);

  const supabase = getSupabaseServer();
  if (!supabase || !supabaseUsesServiceRole()) {
    return page(
      "That did not save",
      "Nothing was changed. Try the link again in a moment, or turn the letter off in Account."
    );
  }

  /*
    Off for this profile, and for any other profile with the same mailbox.

    One person can have more than one row here: an address that signed up
    twice, or an alias that was joined to an account later. Turning off only
    the row the link named would mean the letter kept arriving from the other
    one, which reads as an unsubscribe that did not work.
  */
  const { data: profile } = await supabase
    .from(PORTFELL_TABLES.profiles)
    .select("email")
    .eq("id", found.id)
    .maybeSingle();

  const email = (profile as { email?: string | null } | null)?.email
    ?.trim()
    .toLowerCase();

  /*
    ILIKE rather than EQ because the column is case-insensitive by the
    schema's own rules (every policy and the 054 index compare on
    lower(email)), and ILIKE reads a pattern rather than a value: `%` and `_`
    are wildcards, so an address carrying either would switch the letter off
    for strangers. `escapeLike` makes the address mean itself. An address it
    cannot make exact falls back to the one row the link named, which is a
    letter still arriving from a second row at worst, against the wrong
    people's letters stopping.
  */
  const pattern = email && likeCanBeExact(email) ? escapeLike(email) : null;

  const { error } = pattern
    ? await supabase
        .from(PORTFELL_TABLES.profiles)
        .update({ note_sunday: false })
        .ilike("email", pattern)
    : await supabase
        .from(PORTFELL_TABLES.profiles)
        .update({ note_sunday: false })
        .eq("id", found.id);

  if (error) {
    return page(
      "That did not save",
      "Nothing was changed. Try the link again in a moment, or turn the letter off in Account."
    );
  }

  return page(
    "Done. No more Sunday letters.",
    "Nothing else has changed. Your portfolios and notes are where you left them, and the letter can be turned back on in Account at any time."
  );
}

export const GET = observeRoute(handleGET, "/api/unsubscribe");
export const POST = observeRoute(handlePOST, "/api/unsubscribe");
