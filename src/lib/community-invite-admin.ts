export type InviteAdminPerson = {
  id: string;
  name: string;
};

export type InviteAdminUse = {
  id: string;
  name: string;
  used_at: string;
};

export type InviteAdminStatus = "live" | "expired" | "retired";

/** How long a community invite link lives when nobody says otherwise. */
export const DEFAULT_INVITE_DAYS = 30;

/**
 * What an admin sees about an existing invite. There is no join path on
 * it, on purpose: the database holds only a hash of the token, so the full
 * link exists exactly once, in the response that created it. A row that
 * could hand the link back would mean a read of the table hands out
 * credentials, which is what portfolio invites have never allowed. An admin
 * who needs to share a link again makes a new one.
 */
export type InviteAdminRow = {
  id: string;
  hint: string | null;
  email: string | null;
  role: string;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
  created_by: InviteAdminPerson | null;
  uses: number;
  used_by: InviteAdminUse[];
  status: InviteAdminStatus;
};

export function tokenHintFromToken(token: string): string {
  return token.slice(-6);
}

export function inviteJoinPath(token: string): string {
  return `/communities/join?token=${token}`;
}

/**
 * When a link made to replace another one should expire. It keeps the old
 * link's date so that replacing a link does not quietly shorten or lengthen
 * what the admin chose; a link that never expired still never expires. An
 * old link that has already run out gets the default lifetime from now,
 * because a new link born expired is not a link.
 */
export function renewedExpiry(
  oldExpiresAt: string | null,
  now = Date.now()
): string | null {
  if (oldExpiresAt === null) return null;
  const old = new Date(oldExpiresAt).getTime();
  if (Number.isFinite(old) && old > now) return oldExpiresAt;
  return new Date(now + DEFAULT_INVITE_DAYS * 86400000).toISOString();
}

export function inviteAdminStatus(
  row: { revoked_at: string | null; expires_at: string | null },
  now = Date.now()
): InviteAdminStatus {
  if (row.revoked_at) return "retired";
  if (row.expires_at && new Date(row.expires_at).getTime() < now) {
    return "expired";
  }
  return "live";
}

export function profileLabel(
  p: { display_name?: string | null; email?: string | null } | null | undefined
): string {
  const name = p?.display_name?.trim();
  if (name) return name;
  const email = p?.email?.trim();
  if (email) return email;
  return "Someone";
}

export function inviteUsesLabel(n: number): string {
  if (n <= 0) return "Never used";
  if (n === 1) return "Used once";
  return `Used ${n} times`;
}

export function inviteLockLabel(email: string | null): string {
  if (!email) return "Anyone with the link";
  const parts = email
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 1) return parts[0];
  return `Locked to ${parts.length} emails`;
}

export function inviteDayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}
