import type { User } from "@supabase/supabase-js";
import { readAll } from "@/lib/supabase/read-all";
import {
  sliceSnapshotPayload,
  type BookSnapshotPayload,
} from "@/lib/book-snapshot";
import { csvSection } from "@/lib/gdpr/csv";
import { encryptExportPayload } from "@/lib/gdpr/export-crypto";
import type { AppSupabaseClient } from "@/lib/supabase/client-types";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";

export type UserExportFormat = "json" | "csv";

export type UserExportOptions = {
  format: UserExportFormat;
  encrypt: boolean;
};

export type UserDataExport = {
  exported_at: string;
  account: {
    user_id: string;
    email: string | null;
  };
  profile: Record<string, unknown> | null;
  settings: {
    email_notes: { sunday: boolean };
    experience_tier: string | null;
    knows_options: boolean | null;
  };
  portfolios: unknown[];
  holdings: unknown[];
  cash_events: unknown[];
  snapshots: Array<{
    id: string;
    kind: string;
    label: string;
    created_at: string;
    payload: BookSnapshotPayload;
  }>;
  lab_state: unknown;
  communities: unknown[];
  community_duels: unknown[];
  join_requests: unknown[];
  portfolio_invites: unknown[];
  /** Which community invite links this person redeemed, and when. */
  community_invite_uses: unknown[];
  /**
   * Who else can reach this person's sheets, and which of their logins the
   * app treats as the same person. Both are plainly personal data about the
   * requester and nothing else in this export covered them: co-ownership is
   * the record of who can see their holdings, and the alias link is what
   * ties two email addresses to one human.
   */
  portfolio_co_owners: unknown[];
  account_aliases: unknown[];
  /**
   * The other addresses that open this one account. The digest of a pending
   * confirmation is deliberately not in here: it is a credential, and an
   * export is a file people mail to themselves.
   */
  account_emails: unknown[];
};

const INVITE_SAFE_COLUMNS =
  "id, portfolio_id, email, created_by, expires_at, accepted_at, revoked_at, created_at";

/** The two alias lookups overlap when a row points an address at itself. */
function dedupeAliasRows(rows: unknown[]): unknown[] {
  const seen = new Set<string>();
  const out: unknown[] = [];
  for (const row of rows) {
    const rec = row as { alias_email?: string; primary_email?: string };
    const key = `${rec?.alias_email ?? ""}|${rec?.primary_email ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asRows(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => asRecord(row))
    .filter((row): row is Record<string, unknown> => row != null);
}

function omitKeys<T extends Record<string, unknown>>(
  row: T,
  keys: string[]
): Record<string, unknown> {
  const drop = new Set(keys);
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(row)) {
    if (drop.has(key)) continue;
    out[key] = val;
  }
  return out;
}

export function toExportCsv(payload: UserDataExport): string {
  const snapshots = payload.snapshots.map((row) => ({
    id: row.id,
    kind: row.kind,
    label: row.label,
    created_at: row.created_at,
    payload: row.payload,
  }));
  return [
    csvSection("account", [payload.account]),
    csvSection("profile", payload.profile ? [payload.profile] : []),
    csvSection("settings", [
      {
        sunday_email: payload.settings.email_notes.sunday,
        experience_tier: payload.settings.experience_tier,
        knows_options: payload.settings.knows_options,
      },
    ]),
    csvSection("portfolios", asRows(payload.portfolios)),
    csvSection("holdings", asRows(payload.holdings)),
    csvSection("cash_events", asRows(payload.cash_events)),
    csvSection("snapshots", snapshots),
    csvSection(
      "lab_state",
      payload.lab_state ? [asRecord(payload.lab_state) ?? {}] : []
    ),
    csvSection("communities", asRows(payload.communities)),
    csvSection("community_duels", asRows(payload.community_duels)),
    csvSection("join_requests", asRows(payload.join_requests)),
    csvSection("portfolio_invites", asRows(payload.portfolio_invites)),
    csvSection(
      "community_invite_uses",
      asRows(payload.community_invite_uses)
    ),
    // Both formats carry the same data. A CSV export that quietly holds
    // less than the JSON one is a right-of-access answer that depends on
    // which button the person happened to press.
    csvSection("portfolio_co_owners", asRows(payload.portfolio_co_owners)),
    csvSection("account_aliases", asRows(payload.account_aliases)),
    csvSection("account_emails", asRows(payload.account_emails)),
  ].join("\n\n");
}

export async function collectUserExport(
  supabase: AppSupabaseClient,
  user: User,
  portfolioIds: string[]
): Promise<UserDataExport> {
  const uid = user.id;
  const email = user.email?.trim().toLowerCase() || null;

  const [
    profileRes,
    labRes,
    memberRes,
    duelRes,
    joinRes,
    inviteRes,
    inviteUseRes,
    coOwnerRes,
    aliasAsAliasRes,
    aliasAsPrimaryRes,
    accountEmailRes,
  ] = await Promise.all([
    supabase.from(PORTFELL_TABLES.profiles).select("*").eq("id", uid).maybeSingle(),
    supabase
      .from(PORTFELL_TABLES.labState)
      .select("*")
      .eq("owner_id", uid)
      .maybeSingle(),
    supabase
      .from(PORTFELL_TABLES.communityMembers)
      .select("community_id, role, joined_at")
      .eq("user_id", uid),
    supabase
      .from(PORTFELL_TABLES.communityDuels)
      .select("id, community_id, day_key, ticker_a, ticker_b, pick, created_at")
      .eq("user_id", uid),
    supabase
      .from(PORTFELL_TABLES.communityJoinRequests)
      .select(
        "id, community_id, status, message, requested_at, decided_at, share_portfolio_ids"
      )
      .eq("user_id", uid),
    portfolioIds.length > 0
      ? supabase
          .from(PORTFELL_TABLES.portfolioInvites)
          .select(INVITE_SAFE_COLUMNS)
          .in("portfolio_id", portfolioIds)
      : Promise.resolve({ data: [] as unknown[] }),
    // A right-to-access record of which invite link this person redeemed
    // and when. Low sensitivity (a join fact and a timestamp), but it is
    // their personal data and nothing else in the export covers it.
    supabase
      .from(PORTFELL_TABLES.communityInviteUses)
      .select("invite_id, used_at")
      .eq("user_id", uid),
    // Every sheet this person co-owns, including ones someone else made and
    // invited them onto. `portfolios` below is keyed off the same ownership
    // rows, but only the sheets survive into the export -- the fact of who
    // shares them does not, and that is the part a person asking "who can
    // see my holdings?" actually wants.
    supabase
      .from(PORTFELL_TABLES.portfolioOwners)
      .select("portfolio_id, created_at")
      .eq("user_id", uid),
    /*
     * The alias link, looked up by address rather than id: this table
     * predates profile ids and is keyed on emails.
     *
     * Two equality queries rather than one `.or()`. A PostgREST `or` filter
     * is a string the client builds, so interpolating an address into it
     * makes the filter's own grammar -- commas, dots, parentheses --
     * reachable from a value. Nobody controls their own auth email here
     * today, but a filter that is safe only because of that is the kind
     * that stops being safe quietly.
     */
    email
      ? supabase
          .from(PORTFELL_TABLES.accountAliases)
          .select("alias_email, primary_email, created_at")
          .eq("alias_email", email)
      : Promise.resolve({ data: [] as unknown[] }),
    email
      ? supabase
          .from(PORTFELL_TABLES.accountAliases)
          .select("alias_email, primary_email, created_at")
          .eq("primary_email", email)
      : Promise.resolve({ data: [] as unknown[] }),
    // Never token_hash. See the field note on the type above.
    supabase
      .from(PORTFELL_TABLES.accountEmails)
      .select("id, email, verified_at, created_at")
      .eq("user_id", uid),
  ]);

  let portfolios: unknown[] = [];
  let holdings: unknown[] = [];
  let cashEvents: unknown[] = [];
  if (portfolioIds.length > 0) {
    /*
      A page at a time. An export is a legal answer to "give me my data", so
      it is complete or it is not an answer, and PostgREST returns at most
      db-max-rows without saying it has. Cash events are the read that gets
      there first: they accumulate for the life of a portfolio and nothing
      prunes them.
    */
    const [pRows, hRows, cRows] = await Promise.all([
      readAll<unknown>(() =>
        supabase.from(PORTFELL_TABLES.portfolios).select("*").in("id", portfolioIds)
      ),
      readAll<unknown>(() =>
        supabase
          .from(PORTFELL_TABLES.holdings)
          .select("*")
          .in("portfolio_id", portfolioIds)
      ),
      readAll<unknown>(() =>
        supabase
          .from(PORTFELL_TABLES.cashEvents)
          .select("id, portfolio_id, user_id, delta, balance_after, created_at")
          .in("portfolio_id", portfolioIds)
          .order("created_at", { ascending: true })
      ),
    ]);
    portfolios = pRows;
    holdings = hRows;
    cashEvents = cRows;
  }

  const communityIds = [
    ...new Set(
      ((memberRes.data ?? []) as { community_id?: string }[])
        .map((row) => row.community_id)
        .filter((id): id is string => Boolean(id))
    ),
  ];
  let communities: unknown[] = [];
  if (communityIds.length > 0) {
    const { data } = await supabase
      .from(PORTFELL_TABLES.communities)
      .select("id, name, kind, visibility, created_at")
      .in("id", communityIds);
    const byId = new Map(
      ((data ?? []) as { id: string }[]).map((row) => [row.id, row])
    );
    communities = ((memberRes.data ?? []) as {
      community_id: string;
      role: string;
      joined_at: string;
    }[]).map((row) => ({
      ...asRecord(byId.get(row.community_id)),
      role: row.role,
      joined_at: row.joined_at,
    }));
  }

  const owned = new Set(portfolioIds);
  const { data: snapRows } = await supabase
    .from(PORTFELL_TABLES.snapshots)
    .select("id, kind, label, created_at, payload")
    .order("created_at", { ascending: false })
    .limit(80);
  const snapshots = ((snapRows ?? []) as {
    id: string;
    kind: string;
    label: string;
    created_at: string;
    payload: BookSnapshotPayload;
  }[])
    .map((row) => {
      const sliced = sliceSnapshotPayload(row.payload, portfolioIds);
      if (!sliced) return null;
      return {
        id: row.id,
        kind: row.kind,
        label: row.label,
        created_at: row.created_at,
        payload: sliced,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row != null);

  const profile = asRecord(profileRes.data);
  // The Sunday letter is the only scheduled email; the weekday and
  // after-close notes were removed, so there is one preference to export.
  const sunday = Boolean(profile?.note_sunday ?? profile?.morning_note);

  const inviteUses = asRows(inviteUseRes.data);

  const invites = asRows(inviteRes.data).map((row) =>
    omitKeys(row, ["token_hash", "token_hint", "token"])
  );

  return {
    exported_at: new Date().toISOString(),
    account: {
      user_id: uid,
      email: user.email ?? null,
    },
    profile,
    settings: {
      email_notes: { sunday },
      experience_tier:
        typeof profile?.experience_tier === "string"
          ? profile.experience_tier
          : null,
      knows_options:
        typeof profile?.knows_options === "boolean"
          ? profile.knows_options
          : null,
    },
    portfolios,
    holdings,
    cash_events: cashEvents,
    snapshots,
    lab_state: labRes.data ?? null,
    communities,
    community_duels: duelRes.data ?? [],
    join_requests: joinRes.data ?? [],
    portfolio_invites: invites.filter((row) => {
      const pid = row.portfolio_id;
      return typeof pid === "string" && owned.has(pid);
    }),
    community_invite_uses: inviteUses,
    portfolio_co_owners: coOwnerRes.data ?? [],
    account_aliases: dedupeAliasRows([
      ...(aliasAsAliasRes.data ?? []),
      ...(aliasAsPrimaryRes.data ?? []),
    ]),
    account_emails: accountEmailRes.data ?? [],
  };
}

export function serializeUserExport(
  payload: UserDataExport,
  options: UserExportOptions
): {
  body: string;
  contentType: string;
  filename: string;
  headers: Record<string, string>;
} {
  const day = payload.exported_at.slice(0, 10);
  const plain =
    options.format === "csv"
      ? toExportCsv(payload)
      : `${JSON.stringify(payload, null, 2)}\n`;
  const ext = options.format === "csv" ? "csv" : "json";
  const contentType =
    options.format === "csv" ? "text/csv; charset=utf-8" : "application/json";

  if (!options.encrypt) {
    return {
      body: plain,
      contentType,
      filename: `upside-export-${day}.${ext}`,
      headers: {},
    };
  }

  const envelope = encryptExportPayload(plain);
  return {
    body: `${JSON.stringify(envelope)}\n`,
    contentType: "application/json",
    filename: `upside-export-${day}.${ext}.enc.json`,
    headers: {
      "X-Upside-Export-Alg": envelope.alg,
      "X-Upside-Export-Key": envelope.unwrap_key,
    },
  };
}

export function parseExportOptions(
  req: Request,
  defaults: { encrypt: boolean }
): UserExportOptions {
  let format: UserExportFormat = "json";
  let encrypt = defaults.encrypt;
  try {
    const url = new URL(req.url);
    if (url.searchParams.get("format") === "csv") format = "csv";
    const raw = url.searchParams.get("encrypt");
    if (raw === "1" || raw === "true") encrypt = true;
    if (raw === "0" || raw === "false") encrypt = false;
  } catch {
    /* keep defaults */
  }
  return { format, encrypt };
}
