import { NextRequest, NextResponse } from "next/server";

import {
  ADDRESS_MESSAGES,
  MAX_LINKED_ADDRESSES,
} from "@/lib/auth/account-addresses";
import { readEmail } from "@/lib/auth/email-address";
import { domainAcceptsMail } from "@/lib/auth/email-mx";
import {
  listAddresses,
  startAddressLink,
} from "@/lib/auth/linked-addresses";
import {
  accountAddressDeleteSchema,
  accountAddressPostSchema,
} from "@/lib/api-schemas";
import { observeRoute } from "@/lib/observe-route";
import { PRODUCT_NAME } from "@/lib/product";
import { parseJsonBody } from "@/lib/parse-json-body";
import { rateLimitJson } from "@/lib/rate-limit";
import { takeDurableRateLimit } from "@/lib/rate-limit-durable";
import { noteEmailConfigured } from "@/lib/send-note";
import { googleOAuthConfigured } from "@/lib/auth/google-oauth";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import {
  createSupabaseServerAuth,
  requireAuthUser,
} from "@/lib/supabase/server-auth";

export const dynamic = "force-dynamic";

/*
  The other addresses that open one account.

  Adding is a request, not a change: it writes the address down as pending and
  sends a confirmation, and nothing reaches the account until somebody opens
  the link in that mailbox. Removing is immediate, because taking away a way
  in should never wait on a mailbox somebody may have lost access to, which is
  one of the reasons a person removes an address in the first place.
*/

async function handleGET() {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  return NextResponse.json({
    primaryEmail: auth.user.email ?? null,
    addresses: await listAddresses(auth.user.id),
    canSend: noteEmailConfigured(),
    googleEnabled: googleOAuthConfigured(),
    max: MAX_LINKED_ADDRESSES,
  });
}

async function handlePOST(req: NextRequest) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const parsed = await parseJsonBody(req, accountAddressPostSchema);
  if (!parsed.ok) return parsed.response;

  const verdict = readEmail(parsed.data.email);

  if (verdict.kind === "unreachable") {
    return NextResponse.json(
      { error: verdict.message, typed: verdict.email },
      { status: 400 }
    );
  }

  /*
    One letter out and the confirmation goes to somebody else's mailbox, and
    plenty of real domains sit one letter from a famous one. So a near miss is
    a question with both spellings on offer, never a silent correction.
  */
  if (verdict.kind === "check" && parsed.data.confirmed !== true) {
    return NextResponse.json({
      suggestion: verdict.suggestion,
      typed: verdict.email,
    });
  }

  const email = verdict.email;
  const domain = email.slice(email.lastIndexOf("@") + 1);

  if (!(await domainAcceptsMail(domain))) {
    return NextResponse.json(
      {
        error: `We could not find a mail server for ${domain}, so a link sent there would not arrive. Check the spelling.`,
        typed: email,
      },
      { status: 400 }
    );
  }

  /*
    Counted here rather than at the top, because a letter is what is being
    rationed: a signed-in reader can point this at any address in the world,
    and what comes out carries our sending domain. Four addresses is the most
    an account can hold and a confirmation lasts an hour, so a handful an hour
    covers every honest use of it and nothing else. A refused spelling and a
    "did you mean" cost nothing, since neither one sends anything. Durable
    rather than per-instance, because what is being protected is the sending
    reputation the Sunday letter rides on.
  */
  const limit = await takeDurableRateLimit(`address-link:${auth.user.id}`, 6, 60 * 60_000);
  if (!limit.ok) {
    return rateLimitJson(
      limit,
      "That is a lot of confirmations. Give it a few minutes and try again."
    );
  }

  const result = await startAddressLink({
    userId: auth.user.id,
    primaryEmail: auth.user.email ?? null,
    email,
  });

  if (result.kind === "error") {
    return NextResponse.json(
      { error: ADDRESS_MESSAGES[result.code], typed: email },
      { status: result.code === "failed" ? 500 : 400 }
    );
  }

  if (result.kind === "already") {
    return NextResponse.json({ ok: true, note: ADDRESS_MESSAGES.already });
  }

  /*
    Said before the link is opened rather than after, because the account
    being closed belongs to the person reading this and they should hear about
    it while they can still decide not to.
  */
  return NextResponse.json({
    ok: true,
    sent: result.closes
      ? `${ADDRESS_MESSAGES.sent} Opening it also closes the empty ${PRODUCT_NAME} account that address made, which has never been used.`
      : ADDRESS_MESSAGES.sent,
  });
}

async function handleDELETE(req: NextRequest) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const parsed = await parseJsonBody(req, accountAddressDeleteSchema);
  if (!parsed.ok) return parsed.response;

  /*
    Through the reader's own session rather than the service role, so the
    database decides whose row this is. Row level security allows exactly one
    write to this table from a client and this is it.
  */
  const supabase = await createSupabaseServerAuth();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 400 });
  }

  const { error } = await supabase
    .from(PORTFELL_TABLES.accountEmails)
    .delete()
    .eq("id", parsed.data.id)
    .eq("user_id", auth.user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export const GET = observeRoute(handleGET, "/api/account/addresses");
export const POST = observeRoute(handlePOST, "/api/account/addresses");
export const DELETE = observeRoute(handleDELETE, "/api/account/addresses");
