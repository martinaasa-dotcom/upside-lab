import { dbError } from "@/lib/db-error";
import { ensureProfileAndClaims } from "@/lib/auth/ensure-profile";
import { requireAuthUser } from "@/lib/supabase/server-auth";
import { getSupabaseDataClient } from "@/lib/supabase/server";
import type { TablesUpdate } from "@/lib/supabase/database.types";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import { NextRequest, NextResponse } from "next/server";
import { observeRoute } from "@/lib/observe-route";
import { authMePatchSchema } from "@/lib/api-schemas";
import { parseJsonBody } from "@/lib/parse-json-body";
import { AVATAR_HOST_MESSAGE, safeAvatarUrl } from "@/lib/avatar-url";

export const dynamic = "force-dynamic";

const PROFILE_SELECT =
  "id, email, display_name, avatar_url, bio, created_at, updated_at";

async function handleGET() {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  await ensureProfileAndClaims(auth.user);

  const admin = await getSupabaseDataClient();
  let profile = null;
  if (admin) {
    const { data } = await admin
      .from(PORTFELL_TABLES.profiles)
      .select(PROFILE_SELECT)
      .eq("id", auth.user.id)
      .maybeSingle();
    profile = data;
  }

  return NextResponse.json({
    user: {
      id: auth.user.id,
      email: auth.user.email ?? null,
    },
    profile,
  });
}

/** Update how you appear in communities (display name, bio, avatar). */
async function handlePATCH(req: NextRequest) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const admin = await getSupabaseDataClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Supabase not configured" },
      { status: 400 }
    );
  }

  const parsed = await parseJsonBody(req, authMePatchSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const patch: TablesUpdate<"portfell_profiles"> = {
    updated_at: new Date().toISOString(),
  };

  if (body.display_name !== undefined) {
    const name = String(body.display_name).trim();
    if (!name || name.length > 80) {
      return NextResponse.json(
        { error: "Display name has to be between 1 and 80 characters" },
        { status: 400 }
      );
    }
    patch.display_name = name;
  }

  if (body.bio !== undefined) {
    const bio =
      body.bio == null ? null : String(body.bio).trim().slice(0, 280) || null;
    patch.bio = bio;
  }

  if (body.avatar_url !== undefined) {
    const raw =
      body.avatar_url == null
        ? null
        : String(body.avatar_url).trim().slice(0, 500) || null;
    const url = raw ? safeAvatarUrl(raw) : null;
    if (raw && !url) {
      return NextResponse.json(
        { error: AVATAR_HOST_MESSAGE },
        { status: 400 }
      );
    }
    patch.avatar_url = url;
  }

  if (Object.keys(patch).length <= 1) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  // Ensure row exists before update
  await ensureProfileAndClaims(auth.user);

  const { data, error } = await admin
    .from(PORTFELL_TABLES.profiles)
    .update(patch)
    .eq("id", auth.user.id)
    .select(PROFILE_SELECT)
    .single();

  if (error) {
    return NextResponse.json({ error: dbError(error, "/api/auth/me") }, { status: 500 });
  }

  return NextResponse.json({ ok: true, profile: data });
}

export const GET = observeRoute(handleGET, '/api/auth/me');
export const PATCH = observeRoute(handlePATCH, '/api/auth/me');
