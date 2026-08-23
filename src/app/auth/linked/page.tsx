import Link from "next/link";

import { HeaderBrand } from "@/components/HeaderBrand";
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
    <div className="min-h-dvh bg-background text-foreground">
      <header className="border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <HeaderBrand />
          <Button asChild variant="outline" size="sm">
            <Link href="/">Back</Link>
          </Button>
        </div>
      </header>

      <main
        id="main"
        className="mx-auto flex min-w-0 max-w-lg flex-col gap-4 px-6 py-16 text-sm leading-relaxed"
      >
        <h1 className="text-2xl font-semibold">
          {failed ? "That link did not work" : "That address is connected"}
        </h1>

        <p className="text-muted-foreground">
          {failed ??
            (address
              ? `${address} now opens your ${PRODUCT_NAME} account. Sign in with either address and you land in the same place, with the same portfolios and the same circles.`
              : `It now opens your ${PRODUCT_NAME} account. Sign in with either address and you land in the same place, with the same portfolios and the same circles.`)}
        </p>

        <div className="mt-2">
          <Button asChild>
            <Link href="/">Open {PRODUCT_NAME}</Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
