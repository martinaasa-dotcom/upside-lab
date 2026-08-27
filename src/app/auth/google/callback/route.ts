import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ensureProfileAndClaims } from "@/lib/auth/ensure-profile";
import {
  GOOGLE_OAUTH_COOKIE,
  exchangeGoogleCode,
  googleCallbackUrl,
  googleClientId,
  googleClientSecret,
  googleOAuthCookieOptions,
  parseGoogleOAuthCookie,
  signInFailedUrl,
} from "@/lib/auth/google-oauth";
import { googleEmailFromIdToken } from "@/lib/auth/id-token";
import {
  accountForAddress,
  connectGoogleAddress,
  hashedSessionTokenForAddress,
  magicTokenFor,
} from "@/lib/auth/linked-addresses";
import { isLocalHost } from "@/lib/site-url";
import {
  createSupabaseAuthForResponse,
  createSupabaseServerAuth,
} from "@/lib/supabase/server-auth";

export const dynamic = "force-dynamic";

function clearOAuthCookie(res: NextResponse, secure: boolean) {
  res.cookies.set(GOOGLE_OAUTH_COOKIE, "", {
    ...googleOAuthCookieOptions(secure),
    maxAge: 0,
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const secure = !isLocalHost(url.hostname);
  const cookieStore = await cookies();
  const stored = parseGoogleOAuthCookie(
    cookieStore.get(GOOGLE_OAUTH_COOKIE)?.value
  );
  const failOrigin = stored?.origin || url.origin;
  const fail = () => {
    const res = NextResponse.redirect(signInFailedUrl(failOrigin));
    clearOAuthCookie(res, secure);
    return res;
  };

  if (!stored) return fail();

  const returnedState = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  if (!code || returnedState !== stored.state) {
    return fail();
  }

  const clientId = googleClientId();
  const clientSecret = googleClientSecret();
  if (!clientId || !clientSecret) return fail();

  let tokens: { idToken: string; accessToken?: string };
  try {
    tokens = await exchangeGoogleCode({
      code,
      redirectUri: googleCallbackUrl(stored.origin),
      clientId,
      clientSecret,
    });
  } catch (err) {
    console.error(
      "google token exchange failed",
      err instanceof Error ? err.message : err
    );
    return fail();
  }

  /*
    The address on the Google account, read before anything is done with the
    token. It decides which of the three things below happens, and a token we
    cannot read an address out of is a token we will not act on. See
    src/lib/auth/id-token.ts for why it is trusted at this point and what is
    checked before it is.
  */
  const googleEmail = googleEmailFromIdToken(tokens.idToken, clientId);

  /*
    A handshake that was going to add an address answers on the account
    screen, whatever happens to it. Sending somebody who is already signed in
    to the failed sign-in page would be the app losing track of what they
    asked for.
  */
  if (stored.intent === "link") {
    const res = googleEmail
      ? await connectToSignedInAccount(stored.origin, googleEmail)
      : NextResponse.redirect(new URL("/account?address=failed", stored.origin));
    clearOAuthCookie(res, secure);
    return res;
  }

  if (!googleEmail) return fail();

  const res = NextResponse.redirect(new URL(stored.next, stored.origin));
  const supabase = await createSupabaseAuthForResponse(res);
  if (!supabase) return fail();

  /*
    An address somebody added to their account opens that account.

    Handed to Supabase instead, this token would be a Google identity it has
    never seen, and it would make a second account: the same person, new empty
    portfolios, none of their circles. So the session comes from a one-time
    token minted for the account the address was added to. Nobody's identity
    is guessed at here. Google confirmed the address, and the account itself
    confirmed the address earlier, on the account screen.
  */
  const linked = await accountForAddress(googleEmail);

  if (linked) {
    const tokenHash = await magicTokenFor(linked.primaryEmail);
    if (!tokenHash) return fail();

    /*
      Spent here rather than sent to the browser, so the token never appears
      in a URL, a history entry or a referrer on the way to being used.
    */
    const { data: linkedData, error: linkedError } = await supabase.auth.verifyOtp({
      type: "magiclink",
      token_hash: tokenHash,
    });

    if (linkedError || !linkedData.user) {
      console.error("linked address sign-in failed", linkedError?.message);
      return fail();
    }

    clearOAuthCookie(res, secure);
    return res;
  }

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: "google",
    token: tokens.idToken,
    access_token: tokens.accessToken,
  });
  if (error || !data.user) {
    /*
      An account that was opened with an email link, then later uses Google
      with the same address. The identity token would try to make a second
      user. The session comes from the account that already has that email.
    */
    const existing = await hashedSessionTokenForAddress(googleEmail);
    if (existing) {
      const { data: linkedData, error: linkedError } = await supabase.auth.verifyOtp({
        type: "magiclink",
        token_hash: existing,
      });
      if (!linkedError && linkedData.user) {
        try {
          await ensureProfileAndClaims(linkedData.user);
        } catch (err) {
          console.error(
            "google sign-in claim failed",
            err instanceof Error ? err.message : err
          );
        }
        clearOAuthCookie(res, secure);
        return res;
      }
    }
    console.error("google id token sign-in failed", error?.message);
    return fail();
  }

  try {
    await ensureProfileAndClaims(data.user);
  } catch (err) {
    console.error(
      "google sign-in claim failed",
      err instanceof Error ? err.message : err
    );
  }

  clearOAuthCookie(res, secure);
  return res;
}

/**
 * Adding the address on the Google account somebody just proved they hold, to
 * the account they are signed in to here.
 *
 * The session is the one already in the browser. A handshake that came back
 * to a signed out browser cannot say which account it was for, so it does
 * nothing at all rather than guessing at one.
 */
async function connectToSignedInAccount(
  origin: string,
  email: string
): Promise<NextResponse> {
  const back = (outcome: string) =>
    NextResponse.redirect(new URL(`/account?address=${outcome}`, origin));

  const supabase = await createSupabaseServerAuth();
  if (!supabase) return back("not-configured");

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return back("signed-out");

  const result = await connectGoogleAddress({
    userId: user.id,
    primaryEmail: user.email ?? null,
    email,
  });

  return back(result.kind === "fail" ? result.code : result.kind);
}
