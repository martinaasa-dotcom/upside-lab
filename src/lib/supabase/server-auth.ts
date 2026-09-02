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

async function loadAuthUser(): Promise<User | null> {
  const supabase = await createSupabaseServerAuth();
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

/*
  Who is signed in, asked once per request however many callers ask.

  `auth.getUser()` is a round trip to the auth service every single time it
  is called, and nothing here memoised anything, so a request whose handler
  checked the session and whose helper checked it again paid twice for one
  answer.

  React's `cache` is what the Next authentication guide reaches for, and it
  is the right thing inside a render and does nothing at all in a route
  handler, which is where nearly every caller of this lives. The app route
  runtime does not import React, so there is no cache dispatcher in scope
  and React's `cache` quietly calls straight through. Measured on this app's
  own dev server against a stand-in auth service: a route asking three times
  with `cache` around the function made three round trips, and
  `cache(() => ({}))()` did not return the same object twice in the same
  request.

  What a route handler does have is the cookie store, and it is the right
  key for this on its own terms: the session is in those cookies, so one
  cookie store is one question with one answer. `next/headers` hands back
  the request's own store, the same object however often it is asked inside
  a request (measured in dev, and in production `cookies()` resolves to the
  work store's own object), and necessarily a different one for the next
  request. A `WeakMap` on it is request-scoped by construction, cannot hand
  one person's session to the next through a warm instance, and is collected
  with the request. Where the store's identity is not stable, which is a
  `forceStatic` route being handed a fresh empty cookie jar per call, every
  lookup misses and the behaviour is what it was before this: correct, and
  not saving anything.

  The promise is stored rather than the user, so callers that overlap share
  one flight rather than starting a second before the first has landed.
*/
const userForCookies = new WeakMap<object, Promise<User | null>>();

export async function getAuthUser(): Promise<User | null> {
  const cookieStore = await cookies();
  const asked = userForCookies.get(cookieStore);
  if (asked) return asked;
  const answer = loadAuthUser();
  userForCookies.set(cookieStore, answer);
  return answer;
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
