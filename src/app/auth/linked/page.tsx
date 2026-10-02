import Link from "next/link";

import { MessageLine, MessageScreen } from "@/components/MessageScreen";
import { Button } from "@/components/ui/button";
import { readEmail } from "@/lib/auth/email-address";
import { PRODUCT_NAME, PRODUCT_SUPPORT_EMAIL } from "@/lib/product";
import { privatePageMetadata } from "@/lib/site-metadata";

export const metadata = privatePageMetadata();

/*
  What somebody sees after opening the confirmation in their second mailbox.

  Signed out on purpose, and it says so in what it offers: the link may well
  have been opened on a phone that has never been signed in here, and telling
  that person to sign in first would be asking them to prove something they
  just proved.
*/

const PROBLEMS: Record<string, string> = {
  expired:
    "That link has already been used, or it has run out. Ask for a new one from the account screen and open it within the hour.",
  "address-taken": `That address has an ${PRODUCT_NAME} account of its own with things in it, so it cannot be moved onto another one here. Mail ${PRODUCT_SUPPORT_EMAIL} and a person will sort it out.`,
  /*
    The address has no account of its own, so holding the mailbox is not the
    whole proof. Somebody has to be signed in to the account that asked for it,
    which is the one thing a person who was sent this link out of the blue
    cannot do.
  */
  "sign-in-first": `Open this link again in a browser that is signed in to the ${PRODUCT_NAME} account you want the address on. Sign in there first, then press the button. This is the one case where the link on its own is not enough, because this address has no ${PRODUCT_NAME} account yet and nobody else would ever be told it had been connected.`,
  "missing-token": "That link is missing the part that says which address it is for.",
  "link-failed": "Something went wrong at our end. Ask for a new link and try once more.",
  "not-configured": "Adding an address is not switched on here yet.",
};

export default async function AddressLinkedPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; problem?: string }>;
}) {
  const { email, problem } = await searchParams;

  /*
    Read back rather than trusted. Anything at all can be put in a query
    string, and a page that prints it as though we said it is a page somebody
    can make say anything.
  */
  const verdict = readEmail(email ?? "");
  const address = verdict.kind === "unreachable" ? null : verdict.email;
  const failed = problem ? (PROBLEMS[problem] ?? PROBLEMS["link-failed"]!) : null;

  return (
    <MessageScreen
      title={failed ? "That link did not work" : "That address is connected"}
      actions={
        <Button asChild>
          <Link href="/">Open {PRODUCT_NAME}</Link>
        </Button>
      }
    >
      <MessageLine>
        {failed ??
          (address
            ? `${address} now opens your ${PRODUCT_NAME} account. Either address lands you in the same portfolios and circles.`
            : `It now opens your ${PRODUCT_NAME} account. Either address lands you in the same portfolios and circles.`)}
      </MessageLine>
    </MessageScreen>
  );
}
