import { createBrowserClient } from "@supabase/ssr";
import type { AppSupabaseClient } from "@/lib/supabase/client-types";
import type { Database } from "@/lib/supabase/database.types";
import { sessionCookieOptions } from "@/lib/supabase/cookie-options";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";

let browserClient: AppSupabaseClient | null = null;

/** Cookie-aware browser client for Google SSO sessions. */
export function createSupabaseBrowser(): AppSupabaseClient | null {
  const url = supabaseUrl();
  const key = supabaseAnonKey();
  if (!url || !key) return null;
  if (!browserClient) {
    const hostname =
      typeof window === "undefined" ? null : window.location.hostname;
    browserClient = createBrowserClient<Database>(url, key, {
      cookieOptions: sessionCookieOptions(hostname),
    });
  }
  return browserClient;
}
