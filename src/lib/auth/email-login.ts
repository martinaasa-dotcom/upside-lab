import {
  hashLinkToken,
  mintLinkToken,
} from "@/lib/auth/account-addresses";
import { normalizeAddress } from "@/lib/auth/email-address";
import {
  hashedSessionTokenForAddress,
  magicTokenFor,
} from "@/lib/auth/linked-addresses";
import { signInLinkCopy } from "@/lib/email-letter";
import { PRODUCT_ORIGIN } from "@/lib/product";
import { noteEmailConfigured, sendNoteEmail } from "@/lib/send-note";
import { safeInternalPath } from "@/lib/site-url";
import { getSupabaseServer, supabaseUsesServiceRole } from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";

/*
  Sign in with a link mailed to an address.

  Google is still the usual door. This is the other one, for a mailbox that
  is not a Google account. The mail is ours (Resend). Supabase only mints
  the session token, the same way a linked extra address already does.

  Two rules that look like fuss and are the whole design:

  1. Asking for a link does not create an account. The auth user is made
     when the button on the page is pressed, which is the proof that the
     person can read the mailbox.
  2. Opening the mail does not sign anybody in. Mail scanners fetch every
     URL they see. GET shows a button. POST spends the token.
*/

/** Same sentence whether the address already has an account or not. */
export const EMAIL_LOGIN_SENT =
  "Check that inbox. The link lasts one hour and works once.";

export function emailLoginUrl(origin: string, token: string): string {
  return `${origin}/auth/email?token=${encodeURIComponent(token)}`;
}

/** A path we planted, never one that sends the browser off this site. */
export function emailLoginNext(raw: string | null | undefined): string {
  const next = safeInternalPath(raw);
  if (next.startsWith("/auth/")) return "/";
  return next;
}

export type EmailLoginStart =
  | { kind: "sent" }
  | { kind: "error"; code: "not-configured" | "no-mail" | "failed" };

/**
 * Writes a pending token and mails the link.
 *
 * Always the same outcome to the caller on success. Whether this address
 * already has an account is not a fact this step is allowed to reveal.
 */
export async function startEmailLogin(input: {
  email: string;
  next?: string;
}): Promise<EmailLoginStart> {
  const admin = getSupabaseServer();
  if (!admin || !supabaseUsesServiceRole()) {
    return { kind: "error", code: "not-configured" };
  }
  if (!noteEmailConfigured()) return { kind: "error", code: "no-mail" };

  const email = normalizeAddress(input.email);
  if (!email) return { kind: "error", code: "failed" };

  const next = emailLoginNext(input.next);
  const minted = mintLinkToken();

  await admin
    .from(PORTFELL_TABLES.emailLogins)
    .delete()
    .lt("expires_at", new Date().toISOString());

  const { error } = await admin.from(PORTFELL_TABLES.emailLogins).upsert(
    {
      email,
      token_hash: minted.hash,
      expires_at: minted.expiresAt,
      next_path: next,
      created_at: new Date().toISOString(),
    },
    { onConflict: "email" }
  );

  if (error) {
    console.error("could not record an email sign-in", error.message);
    return { kind: "error", code: "failed" };
  }

  const copy = signInLinkCopy({ url: emailLoginUrl(PRODUCT_ORIGIN, minted.token) });
  const sent = await sendNoteEmail({
    to: email,
    subject: copy.subject,
    text: copy.text,
    html: copy.html,
  });

  if (!sent) {
    await admin.from(PORTFELL_TABLES.emailLogins).delete().eq("email", email);
    return { kind: "error", code: "failed" };
  }

  return { kind: "sent" };
}

export type EmailLoginConsume =
  | { kind: "ok"; hashedToken: string; next: string }
  | { kind: "fail"; reason: "expired" | "failed" | "not-configured" };

/**
 * Spends the token and returns a session hash for `verifyOtp`.
 *
 * The row goes first, so a second press of the same button cannot mint a
 * second session from the same mail. If the session mint then fails, they
 * ask for a fresh link, which is the honest answer.
 */
export async function consumeEmailLogin(token: string): Promise<EmailLoginConsume> {
  const admin = getSupabaseServer();
  if (!admin || !supabaseUsesServiceRole()) {
    return { kind: "fail", reason: "not-configured" };
  }

  const trimmed = token.trim();
  if (!trimmed) return { kind: "fail", reason: "expired" };

  const hash = hashLinkToken(trimmed);

  const { data } = await admin
    .from(PORTFELL_TABLES.emailLogins)
    .select("email, expires_at, next_path")
    .eq("token_hash", hash)
    .maybeSingle();

  const row = data as {
    email: string;
    expires_at: string;
    next_path: string;
  } | null;

  if (!row) return { kind: "fail", reason: "expired" };

  if (new Date(row.expires_at) < new Date()) {
    await admin.from(PORTFELL_TABLES.emailLogins).delete().eq("email", row.email);
    return { kind: "fail", reason: "expired" };
  }

  const { error: gone } = await admin
    .from(PORTFELL_TABLES.emailLogins)
    .delete()
    .eq("token_hash", hash)
    .eq("email", row.email);

  if (gone) {
    console.error("could not spend an email sign-in token", gone.message);
    return { kind: "fail", reason: "failed" };
  }

  const next = emailLoginNext(row.next_path);
  const existing = await hashedSessionTokenForAddress(row.email);
  if (existing) return { kind: "ok", hashedToken: existing, next };

  const minted = await mintAccountForEmail(row.email);
  if (!minted) return { kind: "fail", reason: "failed" };

  return { kind: "ok", hashedToken: minted, next };
}

/**
 * Makes the auth user for a first email sign-in, already confirmed, because
 * pressing the button on the page is the confirmation.
 */
async function mintAccountForEmail(email: string): Promise<string | null> {
  const admin = getSupabaseServer();
  if (!admin || !supabaseUsesServiceRole()) return null;

  const { error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
  });

  if (error) {
    /*
      Two presses at once, or a Google account that appeared between the
      lookup and this write. Either way the address now reaches somebody,
      and that is who the session should belong to.
    */
    const raced = await hashedSessionTokenForAddress(email);
    if (raced) return raced;

    console.error("could not open an email account", error.message);
    return null;
  }

  return magicTokenFor(email);
}
