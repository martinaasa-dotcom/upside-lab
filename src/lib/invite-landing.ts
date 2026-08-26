export type InviteLandingKind = "community" | "classroom" | "sheet";

export type InviteLanding = {
  kind: InviteLandingKind;
  name: string | null;
};

export function clipInviteName(raw: string | null | undefined): string | null {
  const name = String(raw ?? "").trim().replace(/\s+/g, " ");
  if (!name) return null;
  return name.length > 48 ? `${name.slice(0, 45).trimEnd()}...` : name;
}

export function inviteLandingCopy(invite: InviteLanding): {
  title: string;
  detail: string;
} {
  const name = clipInviteName(invite.name);
  if (invite.kind === "sheet") {
    return {
      title: name
        ? `You've been invited to edit ${name}.`
        : "You've been invited to edit a portfolio together.",
      detail: "Sign in with Google to accept. Then you share the portfolio.",
    };
  }
  if (invite.kind === "classroom") {
    return {
      title: name
        ? `You've been invited to join ${name}.`
        : "You've been invited to a class.",
      detail: "Sign in with Google to accept. You'll get a paper portfolio for the class.",
    };
  }
  return {
    title: name
      ? `You've been invited to join ${name}.`
      : "You've been invited to join a group.",
    detail: "Sign in with Google to accept. Then the group opens.",
  };
}

/** First paint on `/communities/join`. Name arrives later from the token. */
export const JOIN_COMMUNITY_INVITE: InviteLanding = {
  kind: "community",
  name: null,
};

/** First paint on `/account/join`. */
export const JOIN_SHEET_INVITE: InviteLanding = {
  kind: "sheet",
  name: null,
};

export function inviteFromLocation(path: string, search: string): InviteLanding | null {
  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search
  );
  const token = (params.get("token") ?? params.get("code") ?? "").trim();
  if (!token) return null;
  if (path.startsWith("/communities/join")) return JOIN_COMMUNITY_INVITE;
  if (path.startsWith("/account/join")) return JOIN_SHEET_INVITE;
  return null;
}
