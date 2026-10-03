import Link from "next/link";

import { MessageLine, MessageScreen } from "@/components/MessageScreen";
import { Button } from "@/components/ui/button";
import { maskAddress } from "@/lib/auth/account-addresses";
import { emailLoginTarget } from "@/lib/auth/email-login";
import { PRODUCT_NAME, PRODUCT_SUPPORT_EMAIL } from "@/lib/product";
import { privatePageMetadata } from "@/lib/site-metadata";

export const metadata = privatePageMetadata();

export const dynamic = "force-dynamic";

/*
  The far end of an email sign-in link.

  GET shows this page and changes nothing. Mail scanners, previewers and
  corporate gateways fetch every URL in a message before anybody reads it,
  and a sign-in that fires on a fetch is one that happens to a scanner, then
  fails for the person who actually opened the mail.

  The button posts to /auth/email/complete, which is the only method that
  spends the token.
*/

const PROBLEMS: Record<string, string> = {
  expired:
    "That link has already been used, or it has run out. Ask for a new one from the sign-in page and open it within the hour.",
  "missing-token": "That link is missing the part that signs you in.",
  busy: "That is a lot of tries from here in a short time. Wait a few minutes, then open the link again.",
  failed: `Something went wrong at our end. Ask for a new link and try once more. If it keeps happening, mail ${PRODUCT_SUPPORT_EMAIL}.`,
  "not-configured": "Email sign-in is not switched on here yet.",
};

/*
  Not a failure, so it is kept apart from the list above: the link works, and
  the only question is whether the reader meant to close the account already
  open in this browser. It used to be closed for them without a word.
*/
const OTHER_SESSION =
  "A different account is already signed in on this browser. Using this link closes that one and opens the account the link is for.";

export default async function EmailSignInPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; problem?: string }>;
}) {
  const { token, problem } = await searchParams;
  const switching = problem === "other-session";
  const failed = problem && !switching ? (PROBLEMS[problem] ?? PROBLEMS.failed) : null;
  const ready = Boolean(token?.trim()) && !failed;

  /*
    Looked up rather than spent, so the page can say which mailbox this link
    opens. It never did, and a link that signs somebody in without naming who
    is a link nobody can check before pressing: forwarded, mis-sent, or opened
    on a machine somebody else uses, it was the same button either way. Masked
    because this page is behind no sign-in.
  */
  const target = ready && token ? await emailLoginTarget(token) : null;
  const opens = target ? maskAddress(target.email) : null;

  return (
    <MessageScreen
      title={failed ? "That link did not work" : `Sign in to ${PRODUCT_NAME}`}
      actions={
        ready ? (
          <form method="post" action="/auth/email/complete">
            <input type="hidden" name="token" value={token} />
            {switching ? <input type="hidden" name="switch" value="1" /> : null}
            <Button type="submit">
              {switching ? "Close that one and sign in" : "Sign in"}
            </Button>
          </form>
        ) : (
          <Button asChild>
            <Link href="/">Back to {PRODUCT_NAME}</Link>
          </Button>
        )
      }
    >
      <MessageLine>
        {failed ??
          (opens
            ? `Press the button to open the account for ${opens}. Opening this page is not enough on purpose: a mail app often loads the link before you do.`
            : "Press the button to open your account. Opening this page is not enough on purpose: a mail app often loads the link before you do.")}
      </MessageLine>
      {switching && ready ? <MessageLine>{OTHER_SESSION}</MessageLine> : null}
    </MessageScreen>
  );
}
