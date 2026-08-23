import { NextResponse, type NextRequest } from "next/server";

import { confirmAddressLink } from "@/lib/auth/linked-addresses";
import { isLocalHost, siteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

/*
  The far end of a confirmation sent to an address somebody wants to add.

  Deliberately not behind a session. The proof this route wants is that the
  person holds the mailbox the link was sent to, and that is the link itself:
  they may well be reading it on a phone that has never been signed in to
  Upside Lab, which is the ordinary case rather than the odd one. The token
  names the account, so nothing is guessed at.

  It signs nobody in either. Confirming an address and using it are two
  different acts, and a link sitting in a mailbox that opened somebody's
  account would be the thing this whole feature exists to prevent.
*/
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const origin = isLocalHost(url.hostname) ? url.origin : siteUrl();
  const token = url.searchParams.get("token");

  const done = new URL("/auth/linked", origin);

  if (!token) {
    done.searchParams.set("problem", "missing-token");
    return NextResponse.redirect(done);
  }

  const result = await confirmAddressLink(token);

  if (result.kind === "fail") {
    done.searchParams.set("problem", result.reason);
    return NextResponse.redirect(done);
  }

  done.searchParams.set("email", result.email);
  return NextResponse.redirect(done);
}
