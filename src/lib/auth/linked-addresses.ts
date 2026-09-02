import {
  decideClaim,
  hashLinkToken,
  linkUrl,
  maskAddress,
  mintLinkToken,
  type AddressOutcome,
  type ClaimVerdict,
} from "@/lib/auth/account-addresses";
import { normalizeAddress } from "@/lib/auth/email-address";
import {
  addressConnectedCopy,
  addressNotConnectedCopy,
  confirmAddressCopy,
} from "@/lib/email-letter";
import { PRODUCT_ORIGIN, PRODUCT_SUPPORT_EMAIL } from "@/lib/product";
import { takeDurableRateLimit } from "@/lib/rate-limit-durable";
import { noteEmailConfigured, sendNoteEmail } from "@/lib/send-note";
import { getSupabaseServer, supabaseUsesServiceRole } from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";

/*
  The addresses that reach one account, and everything that talks to the
  database about them.

  The rules live next door in account-addresses.ts, where they can be tested
  without a project. This file is the plumbing: the table, the two questions
  only the service role may ask about auth.users, and the mail.

  Every write here goes through the service role, on purpose. Adding an
  address is the one thing that has to check what the address already reaches,
  and a check a client runs on its own behalf is not a check. The client may
  do exactly one thing to this table, which is take an address off its own
  account, and row level security is what says so.

  Without a service role key there is no safe way to do any of it, so every
  entry point answers "not switched on here" rather than doing half of it with
  the anon key.
*/

export type LinkedAddress = {
  id: string;
  email: string;
  /** False while the confirmation is still sitting in that mailbox. */
  verified: boolean;
  addedAt: string;
};

type AddressRow = {
  id: string;
  email: string;
  verified_at: string | null;
  created_at: string;
};

/** Every extra address on an account, confirmed or still waiting. */
export async function listAddresses(userId: string): Promise<LinkedAddress[]> {
  const admin = getSupabaseServer();
  if (!admin || !supabaseUsesServiceRole()) return [];

  const { data, error } = await admin
    .from(PORTFELL_TABLES.accountEmails)
    .select("id, email, verified_at, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error || !data) return [];

  return (data as AddressRow[]).map((row) => ({
    id: row.id,
    email: row.email,
    verified: row.verified_at != null,
    addedAt: row.created_at,
  }));
}

/**
 * The account a confirmed address reaches, and the address that account was
 * made with.
 *
 * Asked before any Google identity is turned into a session. Null means what
 * it has always meant: this address is whoever Supabase says it is.
 */
export async function accountForAddress(
  rawEmail: string
): Promise<{ userId: string; primaryEmail: string } | null> {
  const admin = getSupabaseServer();
  if (!admin || !supabaseUsesServiceRole()) return null;

  const email = normalizeAddress(rawEmail);
  if (!email) return null;

  const { data } = await admin
    .from(PORTFELL_TABLES.accountEmails)
    .select("user_id")
    .eq("email", email)
    .not("verified_at", "is", null)
    .maybeSingle();

  const userId = (data as { user_id?: string } | null)?.user_id;
  if (!userId) return null;

  const { data: found, error } = await admin.auth.admin.getUserById(userId);
  const primaryEmail = found?.user?.email;

  /*
    An account whose auth user is gone should never be here, because the row
    cascades with it. If it somehow is, the safe answer is not to know this
    address rather than to hand a session to a row pointing at nothing.
  */
  if (error || !primaryEmail) return null;

  return { userId, primaryEmail };
}

/**
 * A one-time token that opens one account, made without sending anything.
 *
 * This is how an address that was added reaches the account it was added to.
 * Supabase mints the token for the account's own address, and the Google
 * callback spends it on the spot. The session that comes out belongs to the
 * account, and no second auth user is ever made.
 *
 * The project needs the email provider switched on for this, even though no
 * mail is ever sent through it. That is the setting this feature adds, and
 * if it is off, `generateLink` fails and the
 * caller falls back to refusing rather than signing the wrong person in.
 */
export async function magicTokenFor(primaryEmail: string): Promise<string | null> {
  const admin = getSupabaseServer();
  if (!admin || !supabaseUsesServiceRole()) return null;

  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: primaryEmail,
  });

  if (error) {
    console.error("could not mint a session token for a linked address", error.message);
    return null;
  }

  return data?.properties?.hashed_token ?? null;
}

/**
 * Whichever account this address already reaches, and nothing minted yet.
 *
 * Extra addresses go to the account they were added to. An address that is
 * already the login on an auth user goes to that user. Null means there is
 * nobody yet, which is how a first email sign-in knows to make one.
 *
 * Kept apart from minting a token because two callers want the answer without
 * wanting a session: the page that asks whether this really is the account you
 * meant to open needs to name it, and the sign-in link needs to know whether a
 * browser is already signed in to somebody else.
 */
export async function accountReachedByAddress(
  rawEmail: string
): Promise<{ userId: string; primaryEmail: string } | null> {
  const linked = await accountForAddress(rawEmail);
  if (linked) return linked;

  const admin = getSupabaseServer();
  if (!admin || !supabaseUsesServiceRole()) return null;

  const email = normalizeAddress(rawEmail);
  if (!email) return null;

  const { data } = await admin.rpc("portfell_account_for_login_email", {
    p_email: email,
  });
  const userId = (data as string | null) ?? null;
  if (!userId) return null;

  const { data: found, error } = await admin.auth.admin.getUserById(userId);
  const primaryEmail = found?.user?.email;
  if (error || !primaryEmail) return null;

  return { userId, primaryEmail };
}

/** A one-time token for whichever account this address already reaches. */
export async function hashedSessionTokenForAddress(
  rawEmail: string
): Promise<string | null> {
  const reached = await accountReachedByAddress(rawEmail);
  if (!reached) return null;

  return magicTokenFor(reached.primaryEmail);
}

/*
  What the account asking already has, and what the address already reaches.
  Four questions, asked together, so the verdict next door has everything.
*/
async function claimVerdict(
  me: string,
  primaryEmail: string | null,
  email: string
): Promise<ClaimVerdict> {
  const admin = getSupabaseServer();
  if (!admin) return { kind: "refuse", code: "not-configured" };

  const [linked, mine, login] = await Promise.all([
    admin
      .from(PORTFELL_TABLES.accountEmails)
      .select("user_id, verified_at")
      .eq("email", email)
      .maybeSingle(),
    admin
      .from(PORTFELL_TABLES.accountEmails)
      .select("id", { count: "exact", head: true })
      .eq("user_id", me)
      .neq("email", email),
    admin.rpc("portfell_account_for_login_email", { p_email: email }),
  ]);

  const loginAccount = (login.data as string | null) ?? null;

  let neverUsed = false;
  if (loginAccount && loginAccount !== me) {
    const { data } = await admin.rpc("portfell_account_never_used", {
      p_user: loginAccount,
    });
    neverUsed = data === true;
  }

  const row = linked.data as { user_id: string; verified_at: string | null } | null;

  return decideClaim({
    me,
    email,
    primaryEmail,
    linked: row ? { account: row.user_id, verified: row.verified_at != null } : null,
    loginAccount,
    neverUsed,
    linkedCount: mine.count ?? 0,
  });
}

export type LinkStart =
  | { kind: "sent"; email: string; closes: boolean }
  | { kind: "already" }
  /*
    The address was answered and the caller is told nothing. Somebody signed in
    can type any address in the world into that field, so an answer that
    changed depending on whether the address already had an account here would
    be a way of asking about strangers. The refusal goes to the mailbox it is
    about instead.
  */
  | { kind: "quiet" }
  | { kind: "error"; code: AddressOutcome };

/** At most this many confirmations may be sent to one address in a day. */
export const DAILY_LETTERS_PER_ADDRESS = 3;

/** And the same account may not ask for the same address again inside this. */
export const SAME_ADDRESS_COOLDOWN_MS = 10 * 60 * 1000;

/**
 * Tells the mailbox that somebody asked for it and did not get it.
 *
 * The one letter in this feature nobody asked to receive, so it is bounded by
 * the same daily count as a confirmation: a refusal repeated on demand would
 * be a way of sending a stranger mail through us just as surely as a
 * confirmation is.
 */
async function quietlyRefuse(
  email: string,
  requestedBy: string | null
): Promise<LinkStart> {
  const perAddress = await takeDurableRateLimit(
    `address-link-to:${email}`,
    DAILY_LETTERS_PER_ADDRESS,
    24 * 60 * 60_000
  );

  if (perAddress.ok) {
    const copy = addressNotConnectedCopy({
      requestedBy,
      support: PRODUCT_SUPPORT_EMAIL,
    });

    await sendNoteEmail({
      to: email,
      subject: copy.subject,
      text: copy.text,
      html: copy.html,
    });
  }

  return { kind: "quiet" };
}

/**
 * Starts adding an address: writes it down as pending and mails it a link.
 *
 * Nothing is joined here. The row this leaves behind reaches no account and
 * opens nothing until the link in that mailbox is opened, which is the only
 * proof that the person asking can read it.
 */
export async function startAddressLink(input: {
  userId: string;
  primaryEmail: string | null;
  email: string;
}): Promise<LinkStart> {
  const admin = getSupabaseServer();
  if (!admin || !supabaseUsesServiceRole()) {
    return { kind: "error", code: "not-configured" };
  }
  if (!noteEmailConfigured()) return { kind: "error", code: "no-mail" };

  const email = normalizeAddress(input.email);

  /*
    One account asking again for the same address. Every one of those is a
    letter with our sending domain on it going to a mailbox that may not want
    any, so a person who keeps pressing the button sends one letter and then
    waits. Checked before anything is written, so a refusal here leaves the
    pending row that is already sitting in that mailbox alone.
  */
  const again = await takeDurableRateLimit(
    `address-link-pair:${input.userId}:${email}`,
    1,
    SAME_ADDRESS_COOLDOWN_MS
  );
  if (!again.ok) return { kind: "error", code: "slow-down" };

  /*
    A pending row nobody ever confirmed holds an address hostage, because the
    table allows one row per address whatever its state. It is worth nothing to
    the account that started it, whether it has run out yet or not: nothing
    reaches an account until somebody opens the link. So a newer request takes
    it, rather than the first account to type a stranger's address being able
    to keep everyone else off it by asking again every hour.

    That door only swings as far as the two limits either side of it let it,
    which is why they are not optional.
  */
  await admin
    .from(PORTFELL_TABLES.accountEmails)
    .delete()
    .eq("email", email)
    .is("verified_at", null);

  const verdict = await claimVerdict(input.userId, input.primaryEmail, email);

  if (verdict.kind === "already") return { kind: "already" };

  /*
    A refusal about the address itself is answered in the mailbox rather than
    on the screen, so the account screen cannot be used to find out which
    addresses have accounts here. Everything else is about the caller's own
    account and is said to their face.
  */
  if (verdict.kind === "refuse") {
    if (verdict.code !== "has-data" && verdict.code !== "linked-elsewhere") {
      return { kind: "error", code: verdict.code };
    }

    return quietlyRefuse(email, input.primaryEmail);
  }

  /*
    And the shared limit, which is the one that protects the mailbox rather
    than the sender: three accounts each asking once is the same three letters
    to the same stranger as one account asking three times.
  */
  const perAddress = await takeDurableRateLimit(
    `address-link-to:${email}`,
    DAILY_LETTERS_PER_ADDRESS,
    24 * 60 * 60_000
  );
  if (!perAddress.ok) return { kind: "error", code: "slow-down" };

  const token = mintLinkToken();

  const { error } = await admin.from(PORTFELL_TABLES.accountEmails).insert({
    user_id: input.userId,
    email,
    token_hash: token.hash,
    token_expires_at: token.expiresAt,
    verified_at: null,
  });

  if (error) {
    /*
      The unique index on the address, reached by two people asking for the
      same one in the same breath. It is the same answer the verdict above
      gives, arrived at a moment later, so it reads the same way.
    */
    if (error.code === "23505") return { kind: "quiet" };

    console.error("could not record a pending address", error.message);
    return { kind: "error", code: "failed" };
  }

  const copy = confirmAddressCopy({
    url: linkUrl(PRODUCT_ORIGIN, token.token),
    requestedBy: input.primaryEmail,
  });

  const sent = await sendNoteEmail({
    to: email,
    subject: copy.subject,
    text: copy.text,
    html: copy.html,
  });

  if (!sent) {
    await admin
      .from(PORTFELL_TABLES.accountEmails)
      .delete()
      .eq("email", email)
      .eq("user_id", input.userId)
      .is("verified_at", null);

    return { kind: "error", code: "failed" };
  }

  return { kind: "sent", email, closes: verdict.kind === "adopt" };
}

export type LinkConfirmation =
  | { kind: "linked"; email: string }
  | { kind: "fail"; reason: string };

type PendingRow = {
  id: string;
  user_id: string;
  email: string;
  token_expires_at: string | null;
  verified_at: string | null;
};

async function readPending(token: string): Promise<PendingRow | null> {
  const admin = getSupabaseServer();
  if (!admin || !supabaseUsesServiceRole()) return null;

  const trimmed = token.trim();
  if (!trimmed) return null;

  const { data } = await admin
    .from(PORTFELL_TABLES.accountEmails)
    .select("id, user_id, email, token_expires_at, verified_at")
    .eq("token_hash", hashLinkToken(trimmed))
    .maybeSingle();

  const pending = data as PendingRow | null;
  if (!pending || pending.verified_at) return null;
  if (!pending.token_expires_at) return null;
  if (new Date(pending.token_expires_at) < new Date()) return null;

  return pending;
}

export type PendingLink = {
  /** The address the link was sent to. */
  email: string;
  /** Whose account it would open, with most of the mailbox taken out. */
  maskedPrimary: string;
  /** The account itself, so the page behind the button can check the session. */
  account: string;
};

/**
 * What a confirmation link is for, without spending it.
 *
 * The page at the end of that link used to say "connect this address" and name
 * neither the address nor the account, which is asking somebody to agree to
 * something nobody has told them. The account it would open is the whole of
 * what is being agreed to, so it is on the page, masked, because that page is
 * behind no sign-in and can be opened by whoever holds the mail.
 */
export async function pendingAddressLink(token: string): Promise<PendingLink | null> {
  const pending = await readPending(token);
  if (!pending) return null;

  const admin = getSupabaseServer();
  if (!admin) return null;

  const { data: found } = await admin.auth.admin.getUserById(pending.user_id);
  const primary = found?.user?.email;
  if (!primary) return null;

  return {
    email: pending.email,
    maskedPrimary: maskAddress(primary.toLowerCase()),
    account: pending.user_id,
  };
}

/**
 * The other end of that link.
 *
 * Every check runs again here rather than being trusted from when the mail
 * was sent. An hour is long enough for the address to have been claimed by
 * somebody else, and the answer that matters is the one true at the moment
 * the address is actually joined.
 */
export async function confirmAddressLink(
  token: string,
  opts: { signedInUserId?: string | null } = {}
): Promise<LinkConfirmation> {
  const admin = getSupabaseServer();
  if (!admin || !supabaseUsesServiceRole()) {
    return { kind: "fail", reason: "not-configured" };
  }

  const pending = await readPending(token);
  if (!pending) return { kind: "fail", reason: "expired" };

  const { data: loginAccount } = await admin.rpc("portfell_account_for_login_email", {
    p_email: pending.email,
  });

  const other = (loginAccount as string | null) ?? null;

  /*
    An address with no Upside Lab account of its own is the dangerous one, and
    it is dangerous in a way the link on its own cannot answer.

    Confirming it binds a mailbox that has never signed up here to somebody
    else's account, and nothing after that ever asks again: the day its owner
    taps Continue with Google, `accountForAddress` reads the row and hands them
    a session on the account that claimed them. An address that already has an
    account here is refused or adopted by the rules further down, and its owner
    is a party either way. An address with nothing on it has only our own mail
    to go on, and a branded letter is exactly what a person is fooled by.

    So the mailbox is not enough on its own here. The browser pressing the
    button also has to be signed in to the account asking, which is the one
    thing somebody who is not that account cannot arrange.
  */
  if (!other && opts.signedInUserId !== pending.user_id) {
    return { kind: "fail", reason: "sign-in-first" };
  }

  if (other && other !== pending.user_id) {
    const { data: never } = await admin.rpc("portfell_account_never_used", {
      p_user: other,
    });

    if (never !== true) {
      await admin.from(PORTFELL_TABLES.accountEmails).delete().eq("id", pending.id);
      return { kind: "fail", reason: "address-taken" };
    }

    /*
      The empty account on this address, closed so the address can reach the
      one the person actually uses. It has no portfolio, no circle and nothing
      bought, which the database decided rather than this file, and whoever is
      holding this link has just proved they can read the mailbox it was made
      with.
    */
    const { error } = await admin.auth.admin.deleteUser(other);

    if (error) {
      console.error("could not close the empty account on a linked address", error.message);
      return { kind: "fail", reason: "address-taken" };
    }
  }

  /*
    Spent with a read on the write, and only against a row that is still
    waiting. A mail client that fetches a page and a person who presses the
    button a moment later are two posts arriving together, and an update that
    only reports whether the database was reachable cannot tell the second one
    that the first already did this. Postgres settles it: exactly one of them
    matches `verified_at is null` and comes back with a row.
  */
  const { data: spent, error } = await admin
    .from(PORTFELL_TABLES.accountEmails)
    .update({
      verified_at: new Date().toISOString(),
      token_hash: null,
      token_expires_at: null,
    })
    .eq("id", pending.id)
    .is("verified_at", null)
    .select("id");

  if (error) {
    console.error("could not confirm an address", error.message);
    return { kind: "fail", reason: "link-failed" };
  }

  if (!spent || spent.length === 0) return { kind: "fail", reason: "expired" };

  await tellTheAccount(pending.user_id, pending.email);

  return { kind: "linked", email: pending.email };
}

/**
 * Tells the address an account signs in with that a second one now does too.
 *
 * The proof this feature runs on happens in the mailbox being added, which is
 * not necessarily one the account holder reads. Without this letter there is
 * no moment at which the account's own address hears about a new way in, and a
 * quiet new way in is the thing worth hearing about. It cannot fail the
 * confirmation: the address is joined either way, and a person who never gets
 * the letter is no worse off than before it existed.
 */
async function tellTheAccount(userId: string, address: string): Promise<void> {
  if (!noteEmailConfigured()) return;

  const admin = getSupabaseServer();
  if (!admin) return;

  try {
    const { data: found } = await admin.auth.admin.getUserById(userId);
    const primary = found?.user?.email;
    if (!primary) return;

    const copy = addressConnectedCopy({
      address,
      accountUrl: `${PRODUCT_ORIGIN}/account`,
    });

    await sendNoteEmail({
      to: primary,
      subject: copy.subject,
      text: copy.text,
      html: copy.html,
    });
  } catch (err) {
    console.error(
      "could not tell an account about a new address",
      err instanceof Error ? err.message : err
    );
  }
}

export type GoogleLink =
  | { kind: "linked"; email: string }
  | { kind: "already" }
  | { kind: "fail"; code: AddressOutcome };

/**
 * Adds the address on a Google account somebody just signed in with, to the
 * account they are already signed in to.
 *
 * No mail and no waiting: Google has this confirmed a second ago, and the
 * handshake that carried it is the same one the app signs people in with. The
 * address goes down confirmed, because a confirmation link to a mailbox whose
 * owner just proved they hold it would be asking the same question twice.
 */
export async function connectGoogleAddress(input: {
  userId: string;
  primaryEmail: string | null;
  email: string;
}): Promise<GoogleLink> {
  const admin = getSupabaseServer();
  if (!admin || !supabaseUsesServiceRole()) {
    return { kind: "fail", code: "not-configured" };
  }

  const email = normalizeAddress(input.email);

  /*
    Any pending row on this address goes first, whoever started it. Google
    confirmed the mailbox a second ago, which beats a confirmation nobody has
    opened, and a row in that state reaches no account and opens nothing.
  */
  await admin
    .from(PORTFELL_TABLES.accountEmails)
    .delete()
    .eq("email", email)
    .is("verified_at", null);

  const verdict = await claimVerdict(input.userId, input.primaryEmail, email);

  if (verdict.kind === "already") return { kind: "already" };
  if (verdict.kind === "refuse") return { kind: "fail", code: verdict.code };

  if (verdict.kind === "adopt") {
    const { error } = await admin.auth.admin.deleteUser(verdict.account);

    if (error) {
      console.error("could not close the empty account on a linked address", error.message);
      return { kind: "fail", code: "has-data" };
    }
  }

  const { error } = await admin.from(PORTFELL_TABLES.accountEmails).insert({
    user_id: input.userId,
    email,
    token_hash: null,
    token_expires_at: null,
    verified_at: new Date().toISOString(),
  });

  if (error) {
    if (error.code === "23505") return { kind: "fail", code: "linked-elsewhere" };

    console.error("could not connect a Google address", error.message);
    return { kind: "fail", code: "failed" };
  }

  return { kind: "linked", email };
}
