/**
 * Dedicated Upside Lab Supabase instance.
 *
 * Client code must keep using the NEXT_PUBLIC_ names (bundled into the
 * browser). Server code accepts the isolated aliases too, so a cutover to
 * a new project is env-only: swap URL + keys, no code change.
 */

function httpsOrigin(raw: string | undefined): string | undefined {
  const t = raw?.trim();
  if (!t) return undefined;
  try {
    const u = new URL(t);
    if (u.protocol !== "https:" || !u.hostname) return undefined;
    return u.origin;
  } catch {
    return undefined;
  }
}

export function supabaseUrl(): string | undefined {
  return (
    httpsOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL) ||
    httpsOrigin(process.env.SUPABASE_URL)
  );
}

export function supabaseAnonKey(): string | undefined {
  const raw =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.SUPABASE_ANON_KEY?.trim();
  return raw || undefined;
}

export function supabaseServiceRoleKey(): string | undefined {
  return process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || undefined;
}

export function supabaseDatabaseUrl(): string | undefined {
  return process.env.DATABASE_URL?.trim() || undefined;
}

function parsePostgresUrl(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

/**
 * Transaction-mode pooler (port 6543 / *.pooler.supabase.com). Session-mode
 * and the direct host on 5432 hold a backend for the life of the client,
 * which exhausts the 60-slot cap under Vercel Fluid.
 */
export function isSupabasePoolerUrl(raw: string | undefined): boolean {
  if (!raw) return false;
  const u = parsePostgresUrl(raw);
  if (!u) return false;
  if (u.hostname.includes("pooler.supabase.com")) return true;
  if (u.port === "6543") return true;
  return u.searchParams.has("pgbouncer");
}

/** Direct/session URI. Fine for psql dumps, never for serverless clients. */
export function isDirectPostgresUrl(raw: string | undefined): boolean {
  if (!raw) return false;
  const u = parsePostgresUrl(raw);
  if (!u) return false;
  if (u.protocol !== "postgres:" && u.protocol !== "postgresql:") return false;
  return !isSupabasePoolerUrl(raw);
}

/** Project ref for Management API calls (`uzrnybyggznpvgxgrvgl`). */
export function supabaseProjectRef(): string | undefined {
  const explicit = process.env.SUPABASE_PROJECT_REF?.trim();
  if (explicit) return explicit;
  const url = supabaseUrl();
  if (!url) return undefined;
  try {
    const host = new URL(url).hostname;
    const m = host.match(/^([a-z0-9]+)\.supabase\.co$/i);
    return m?.[1];
  } catch {
    return undefined;
  }
}

export function supabaseIsConfigured(): boolean {
  return Boolean(supabaseUrl() && supabaseAnonKey());
}
