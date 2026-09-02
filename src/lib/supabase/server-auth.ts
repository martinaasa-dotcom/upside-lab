import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import type { User } from "@supabase/supabase-js";
import type { AppSupabaseClient } from "@/lib/supabase/client-types";
import type { Database } from "@/lib/supabase/database.types";
import { NextResponse } from "next/server";
import { sessionCookieOptions } from "@/lib/supabase/cookie-options";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";
import { supabaseFetch } from "@/lib/supabase/http";

function attachCookies(
  cookieStore: Awaited<ReturnType<typeof cookies>>,
  hostname: string | null,
  response?: NextResponse
): AppSupabaseClient | null {
  const url = supabaseUrl();
  const key = supabaseAnonKey();
  if (!url || !key) return null;

  return createServerClient<Database>(url, key, {
    global: { fetch: supabaseFetch },
    cookieOptions: sessionCookieOptions(hostname),
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
            response?.cookies.set(name, value, options);
          });
        } catch {
          cookiesToSet.forEach(({ name, value, options }) => {
            response?.cookies.set(name, value, options);
          });
        }
      },
    },
  });
}

/** The host this request came in on, which decides the cookie's Secure flag. */
async function requestHost(): Promise<string | null> {
  const store = await headers();
  return store.get("host");
}

/** Cookie-session Supabase client (RLS as the signed-in user). */
export async function createSupabaseServerAuth(): Promise<AppSupabaseClient | null> {
  const [cookieStore, host] = await Promise.all([cookies(), requestHost()]);
  return attachCookies(cookieStore, host);
}

/** Same client, but session cookies are copied onto a redirect response. */
export async function createSupabaseAuthForResponse(
  response: NextResponse
): Promise<AppSupabaseClient | null> {
  const [cookieStore, host] = await Promise.all([cookies(), requestHost()]);
  return attachCookies(cookieStore, host, response);
}

export async function getAuthUser(): Promise<User | null> {
  const supabase = await createSupabaseServerAuth();
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

/** 401 unless a Google (or other) session is present. */
export async function requireAuthUser(): Promise<
  { user: User } | { error: NextResponse }
> {
  const user = await getAuthUser();
  if (!user) {
    return {
      error: NextResponse.json(
        { error: "Sign in required" },
        { status: 401 }
      ),
    };
  }
  return { user };
}
