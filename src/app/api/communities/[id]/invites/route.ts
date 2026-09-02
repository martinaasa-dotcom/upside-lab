import { dbError } from "@/lib/db-error";
import { createHash, randomBytes } from "crypto";
import { userIsCommunityAdmin } from "@/lib/auth/ownership";
import {
  DEFAULT_INVITE_DAYS,
  inviteAdminStatus,
  profileLabel,
  tokenHintFromToken,
  inviteJoinPath,
  type InviteAdminRow,
} from "@/lib/community-invite-admin";
import {
  inviteEmailAllowlist,
  storeInviteEmails,
} from "@/lib/invite-emails";
import { communityInviteCopy } from "@/lib/email-letter";
import { PRODUCT_ORIGIN } from "@/lib/product";
import { noteEmailConfigured, sendNoteEmail } from "@/lib/send-note";
import { requireAuthUser } from "@/lib/supabase/server-auth";
import { getSupabaseDataClient } from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import { NextRequest, NextResponse } from "next/server";
import { observeRoute } from "@/lib/observe-route";
import { communityInvitePostSchema } from "@/lib/api-schemas";
import { parseJsonBody } from "@/lib/parse-json-body";
import { takeDurableRateLimitWeighted } from "@/lib/rate-limit-durable";

/**
 * Envelopes one account, or one circle, may post in a day.
 *
 * Well above a teacher setting up a class of thirty and adding a few
 * latecomers, and well below the volume that makes a sending domain worth
 * abusing.
 */
const MAX_INVITE_EMAILS_PER_DAY = 60;

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** Admin: create invite link. Optional emails lock it to those people
 * and get the link in their inbox. The link stays reusable.
 *
 * The full link is in this response and nowhere else. Only its hash is
 * stored, the same as a portfolio invite, so a read of the table cannot
 * hand out a credential; the last six characters are kept as a hint so an
 * admin can tell two links apart. Losing the link means making a new one. */
async function handlePOST(req: NextRequest, ctx: Ctx) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const { id } = await ctx.params;
  if (!(await userIsCommunityAdmin(auth.user.id, id))) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const supabase = await getSupabaseDataClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 400 });
  }

  const parsed = await parseJsonBody(req, communityInvitePostSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const allow = inviteEmailAllowlist(body.email);
  if (!allow.ok) {
    return NextResponse.json({ error: allow.error }, { status: 400 });
  }

  const token = randomBytes(24).toString("base64url");

  // Invite links expire by default. An open (email-less) link is a bearer
  // credential: whoever holds it joins. One pasted into a public repo, a
  // forum, or a screenshot used to grant membership forever, because "no
  // days given" meant "never expires". Now it means 30 days, and never
  // expiring is something you have to ask for. The portfolio-invite route
  // has defaulted to 14 days all along; this brings circles in line.
  let expiresAt: string | null;
  if (body.neverExpires === true) {
    expiresAt = null;
  } else if (body.daysValid != null && body.daysValid !== "") {
    const days = Math.floor(Number(body.daysValid));
    if (!Number.isFinite(days) || days < 1) {
      return NextResponse.json(
        { error: "Days must be at least 1." },
        { status: 400 }
      );
    }
    expiresAt = new Date(
      Date.now() + Math.min(365, days) * 86400000
    ).toISOString();
  } else {
    expiresAt = new Date(
      Date.now() + DEFAULT_INVITE_DAYS * 86400000
    ).toISOString();
  }

  const { data, error } = await supabase
    .from(PORTFELL_TABLES.communityInvites)
    .insert({
      community_id: id,
      email: storeInviteEmails(allow.emails),
      token_hash: hashToken(token),
      token_hint: tokenHintFromToken(token),
      role: body.role === "admin" ? "admin" : "member",
      created_by: auth.user.id,
      expires_at: expiresAt,
    })
    .select("id, email, role, expires_at, created_at, token_hint")
    .single();

  if (error) {
    return NextResponse.json({ error: dbError(error, "/api/communities/[id]/invites") }, { status: 500 });
  }

  const path = inviteJoinPath(token);
  let emailed = 0;
  if (allow.emails.length > 0 && noteEmailConfigured()) {
    /*
      Mail to addresses that never asked for it, so it is bounded per person
      and per circle, weighted by how many envelopes the call would post.

      There was no bound at all. Anyone signed in can make a circle and is
      then its admin, and each call here mails up to twenty addresses from
      the same domain the sign-in links and the Sunday letter come from. A
      loop of these sends thousands of messages to arbitrary inboxes, spends
      the Resend quota the product's own mail depends on, and collects the
      spam reports against the sending domain, which is the part that does
      not undo.

      The daily figure is generous for a real teacher setting up a class and
      far below what makes the domain worth abusing. Both keys have to
      clear, so neither one account nor one circle is the way round it.
    */
    const cost = allow.emails.length;
    for (const key of [
      `invite-mail:user:${auth.user.id}`,
      `invite-mail:circle:${id}`,
    ]) {
      const bill = await takeDurableRateLimitWeighted(
        key,
        MAX_INVITE_EMAILS_PER_DAY,
        24 * 60 * 60_000,
        cost
      );
      if (!bill.ok) {
        return NextResponse.json(
          {
            error:
              "That is a lot of invites for one day. The link above still works, so you can send it yourself, and you can invite more tomorrow.",
            token,
            path,
            emailed: 0,
            invite: data,
          },
          {
            status: 429,
            headers: { "Retry-After": String(bill.retryAfterSec ?? 3600) },
          }
        );
      }
    }

    const { data: community } = await supabase
      .from(PORTFELL_TABLES.communities)
      .select("name, kind")
      .eq("id", id)
      .maybeSingle();
    const meta = community as { name?: string; kind?: string } | null;
    const classroom = meta?.kind === "classroom";
    const name = meta?.name?.trim() || (classroom ? "a class" : "a Circle");
    const copy = communityInviteCopy({
      name,
      url: `${PRODUCT_ORIGIN}${path}`,
      classroom,
    });
    for (const to of allow.emails) {
      const ok = await sendNoteEmail({
        to,
        subject: copy.subject,
        text: copy.text,
        html: copy.html,
      });
      if (ok) emailed += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    token,
    path,
    emailed,
    invite: data,
  });
}

type InviteRow = {
  id: string;
  email: string | null;
  role: string;
  expires_at: string | null;
  accepted_at: string | null;
  revoked_at: string | null;
  created_at: string;
  created_by: string | null;
  token_hint: string | null;
};

type UseRow = {
  invite_id: string;
  user_id: string;
  used_at: string;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
  email: string | null;
};

/** Admin: list invites with who minted them and who used them. */
async function handleGET(_req: NextRequest, ctx: Ctx) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const { id } = await ctx.params;
  if (!(await userIsCommunityAdmin(auth.user.id, id))) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const supabase = await getSupabaseDataClient();
  if (!supabase) {
    return NextResponse.json({ invites: [] });
  }

  const { data, error } = await supabase
    .from(PORTFELL_TABLES.communityInvites)
    .select(
      "id, email, role, expires_at, accepted_at, revoked_at, created_at, created_by, token_hint"
    )
    .eq("community_id", id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: dbError(error, "/api/communities/[id]/invites") }, { status: 500 });
  }

  const rows = (data ?? []) as InviteRow[];
  const inviteIds = rows.map((r) => r.id);
  const { data: useRows } = inviteIds.length
    ? await supabase
        .from(PORTFELL_TABLES.communityInviteUses)
        .select("invite_id, user_id, used_at")
        .in("invite_id", inviteIds)
    : { data: [] as UseRow[] };

  const uses = (useRows ?? []) as UseRow[];
  const profileIds = [
    ...new Set([
      ...rows.map((r) => r.created_by).filter((v): v is string => Boolean(v)),
      ...uses.map((u) => u.user_id),
    ]),
  ];
  const { data: profiles } = profileIds.length
    ? await supabase
        .from(PORTFELL_TABLES.profiles)
        .select("id, display_name, email")
        .in("id", profileIds)
    : { data: [] as ProfileRow[] };

  const profileById = new Map(
    ((profiles ?? []) as ProfileRow[]).map((p) => [p.id, p])
  );
  const usesByInvite = new Map<string, UseRow[]>();
  for (const use of uses) {
    const list = usesByInvite.get(use.invite_id) ?? [];
    list.push(use);
    usesByInvite.set(use.invite_id, list);
  }

  const invites: InviteAdminRow[] = rows.map((row) => {
    const used = (usesByInvite.get(row.id) ?? []).sort((a, b) =>
      a.used_at < b.used_at ? 1 : -1
    );
    const creator = row.created_by
      ? profileById.get(row.created_by) ?? null
      : null;
    return {
      id: row.id,
      hint: row.token_hint,
      email: row.email,
      role: row.role,
      expires_at: row.expires_at,
      revoked_at: row.revoked_at,
      created_at: row.created_at,
      created_by: row.created_by
        ? { id: row.created_by, name: profileLabel(creator) }
        : null,
      uses: used.length,
      used_by: used.map((u) => ({
        id: u.user_id,
        name: profileLabel(profileById.get(u.user_id)),
        used_at: u.used_at,
      })),
      status: inviteAdminStatus(row),
    };
  });

  return NextResponse.json({ invites });
}

export const GET = observeRoute(handleGET, '/api/communities/[id]/invites');
export const POST = observeRoute(handlePOST, '/api/communities/[id]/invites');
