import { HeaderBrand } from "@/components/HeaderBrand";
import { Button } from "@/components/ui/button";
import {
  LEGAL_ADDRESS,
  LEGAL_COUNTRY,
  LEGAL_OPERATOR,
  LEGAL_REGISTRY_CODE,
  LEGAL_VAT_ID,
  PRODUCT_CONTACT_EMAIL,
  PRODUCT_NAME,
  PRODUCT_SUPPORT_EMAIL,
} from "@/lib/product";
import Link from "next/link";
import { publicPageMetadata } from "@/lib/site-metadata";
import type { ReactNode } from "react";

export const metadata = publicPageMetadata({
  title: "Privacy Policy",
  description: "How Upside Lab handles your account and the names you hold.",
  path: "/privacy",
});

export default function PrivacyPage() {
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

      <main id="main" className="flex flex-col mx-auto min-w-0 max-w-3xl gap-6 px-6 py-10 text-sm leading-relaxed text-foreground">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Privacy Policy</h1>
          <p className="mt-1 text-sm text-muted-foreground">Last updated {LAST_UPDATED}</p>
        </div>

        <p>
          Short version: we store what you type in so the app can work, we
          don&apos;t sell your data, and you can export or delete it any time
          from{" "}
          <Link href="/account" className="underline hover:text-foreground">
            My account
          </Link>
          . The long version is below.
        </p>

        <Section title="1. Who we are">
          {PRODUCT_NAME} is operated by {LEGAL_OPERATOR}, a private limited
          company in {LEGAL_COUNTRY} (registry code {LEGAL_REGISTRY_CODE}).
          Registered office: {LEGAL_ADDRESS}. VAT ID {LEGAL_VAT_ID}. That
          company is responsible for the data described here (the controller
          under GDPR). Questions:{" "}
          <a
            href={`mailto:${PRODUCT_CONTACT_EMAIL}`}
            className="underline hover:text-foreground"
          >
            {PRODUCT_CONTACT_EMAIL}
          </a>
          .
        </Section>

        <Section title="2. What we collect">
          <ul className="list-disc pl-4 [&>li+li]:mt-1.5">
            <li>
              <strong className="text-foreground">From Google sign-in:</strong>{" "}
              your email, name, and profile photo, used to create your
              account and identify you to co-owners and community members you
              choose to interact with.
            </li>
            <li>
              <strong className="text-foreground">From email sign-in:</strong>{" "}
              the address we send the link to, used to create your account
              and identify you the same way.
            </li>
            <li>
              <strong className="text-foreground">What you enter:</strong>{" "}
              holdings, cash, notes, targets, forecast overrides, chat with
              Assistant Margus, and any broker or bank screenshot you upload
              so we can read the names onto a portfolio.
            </li>
            <li>
              <strong className="text-foreground">Feedback:</strong> if you
              send the in-app prompt or a written note, we email it to the
              operator. We do not keep a public feedback database.
            </li>
            <li>
              <strong className="text-foreground">Usage &amp; performance:</strong>{" "}
              page views and load times via Vercel Analytics and Speed
              Insights, only if you allow that measurement. No ads, and no
              following you across other sites.
            </li>
          </ul>
        </Section>

        <Section title="3. How we use it">
          To run the app: show your portfolios, compute your numbers, remember
          your preferences, and (only if you opt into a community) show
          today&apos;s prices, holdings, cash, and returns for the portfolios you
          linked. AI features send the relevant portfolio context to a model
          provider. That includes chat with Margus, Pulse, the Sunday email,
          Forecast, and screenshot import. It is not limited to times you
          type a question. We don&apos;t sell or rent your data. We don&apos;t
          train our own models on it. Third-party model providers have their
          own retention and training rules.
        </Section>

        <Section title="4. Who sees it: third parties">
          <p className="mb-2">
            A few processors see limited data, only as needed to run the
            feature:
          </p>
          <ul className="list-disc pl-4 [&>li+li]:mt-1.5">
            <li>
              <strong className="text-foreground">Supabase</strong> (EU-hosted),
              our database and authentication provider. Everything you
              enter lives there.
            </li>
            <li>
              <strong className="text-foreground">Resend</strong> sends
              the Sunday email, invites, and other mail from the app, including
              feedback you submit.
            </li>
            <li>
              <strong className="text-foreground">AI model providers</strong>{" "}
              (OpenRouter and fallbacks such as Groq, Gemini, and Cerebras). Chat,
              Pulse, the Sunday email, Forecast, and screenshot import send the
              relevant context, and for screenshots the image itself, to
              whichever provider answers. Some of those providers process
              data outside {LEGAL_COUNTRY} and the EEA, including the
              United States. We send it because the feature cannot run
              without a model. We don&apos;t control their retention beyond
              what they publish.
            </li>
            <li>
              <strong className="text-foreground">Market data providers</strong>{" "}
              (Yahoo Finance, with Twelve Data and Finnhub as fallbacks). We
              send ticker symbols to fetch prices &mdash; so a provider sees
              which companies someone looked up, but never how many shares
              you own, what you paid, or who you are. The request carries no
              account, no name, and no session.
            </li>
            <li>
              <strong className="text-foreground">Cloudflare (R2)</strong>:
              storage for the encrypted backup copy described under
              &ldquo;Data retention&rdquo;. The copy is encrypted before it
              leaves us, so Cloudflare stores bytes it cannot read.
            </li>
            <li>
              <strong className="text-foreground">Vercel</strong>: hosting,
              plus the performance metrics mentioned above.
            </li>
            <li>
              <strong className="text-foreground">Stripe</strong> handles
              payment for {PRODUCT_NAME} Pro. If you subscribe, your name,
              email, billing address, and card details go directly to
              Stripe -- we never see or store your card number. We keep only
              your Stripe customer/subscription IDs and subscription status
              so the app knows what you&apos;re on.
            </li>
          </ul>
        </Section>

        <Section title="5. Sharing between users">
          If you invite a co-owner to a portfolio, they get full edit access to
          that portfolio&apos;s data. If you join a circle, other members see
          today&apos;s prices, the names you hold, cash, and returns for the
          portfolio(s) you linked. They do not see what you paid. You control
          which portfolios, if any, are linked. If two accounts are linked as a
          household, Circle join, leave, and role copy to both. The other
          person does not have to click agree each time. Classroom stays per
          person.
        </Section>

        <Section title="6. Cookies and what we keep on your device">
          We use essential cookies from Supabase Auth to keep you signed in.
          That is the only cookie this app sets. When you sign in with
          Google, Google sets cookies on its own domain under Google&apos;s
          rules; we never read those.
          {" "}
          Vercel Analytics and Speed Insights measure page views and load
          times only if you allow it. They set no cookies at all, and we
          still ask first. You can say no on the banner, or change your mind
          later in{" "}
          <Link href="/account" className="underline hover:text-foreground">
            My account
          </Link>
          . Nothing here is advertising, and none of it follows you across
          other sites.
          {" "}
          The app also saves things on your own device (browser storage, not
          cookies): your settings, which portfolio you had open, your thesis
          notes and watchlist, and a cached copy of your portfolio so it
          still works offline. That never leaves your device on its own.
          Signing out, or switching accounts, clears all of it.
        </Section>

        <Section title="7. Data retention">
          We keep your data while your account is active. Nightly snapshots
          of your portfolio data are kept for backup and recovery. Only the people who
          run the app can read a restore. That is a short list of operator
          accounts, not every signed-in user. We also keep a separate,
          encrypted backup copy outside our main database, used only to
          rebuild the app if our database provider had a serious failure.
          That copy is one combined file covering every account, not a file
          per person, so it can&apos;t be edited to remove a single account.
          Instead, each day&apos;s copy is automatically deleted 30 days
          after it was made. Deleting your account removes your data from
          active use immediately, but it can remain in that day&apos;s
          backup copy until that copy&apos;s own 30-day expiry, the same as
          everyone else&apos;s in it. You can permanently delete your profile
          and solely-owned portfolios yourself at any time (see below). This
          removes them from active use immediately.
        </Section>

        <Section title="8. Your rights (export &amp; deletion)">
          From{" "}
          <Link href="/account" className="underline hover:text-foreground">
            My account
          </Link>{" "}
          you can download a complete export of your data as JSON, or
          permanently delete your account: your profile, any portfolio you solely
          own, and your sign-in credential itself (portfolios you share with a
          co-owner stay with them). If for any reason the sign-in credential
          can&apos;t be removed at the same time, your {PRODUCT_NAME} data is
          still fully wiped from active use immediately (see &ldquo;Data
          retention&rdquo; above; it can take up to 30 days to age out of
          the separate backup copy). You&apos;d just want to also revoke{" "}
          {PRODUCT_NAME}&apos;s access from your Google account if you want that
          connection severed too. EU/EEA residents have rights under GDPR
          (access, rectification, erasure, portability, objection). The
          export and delete tools cover most of these directly. Email us for
          anything else.
        </Section>

        <Section title="9. Security">
          Data is encrypted in transit (TLS) and access is scoped per-user at
          the database level (row-level security), so one user&apos;s portfolios
          aren&apos;t readable by another unless explicitly shared via invite
          or community. No system is perfectly secure. If we discover a
          breach affecting your data we&apos;ll notify affected users.
        </Section>

        <Section title="10. Children and Classroom">
          Under 13 is never allowed. If you sign up on your own, you confirm
          you are 16 or older when you sign in. If a teacher invited you into
          a Classroom, the age is 13: a class is run by a school, uses
          pretend money only, and never touches a real portfolio. We use 16
          for everyone else because some EU countries set that as the age
          you can agree to this kind of service by yourself.{" "}
          {PRODUCT_NAME} is not a brokerage and
          does not open a real trading account. Classroom is a private paper
          class: a teacher invites students, each student gets homework cash
          and an empty portfolio, and real portfolios cannot be shared into the class.
          If your country needs a parent or guardian for someone your age to
          use an app like this, that person has to agree. The teacher is
          responsible for running the class under their school&apos;s rules.
        </Section>

        <Section title="11. Changes">
          We may update this policy as the product evolves. Material changes
          will be reflected here with a new &ldquo;last updated&rdquo; date.
        </Section>

        <Section title="12. Contact">
          Product help:{" "}
          <a
            href={`mailto:${PRODUCT_SUPPORT_EMAIL}`}
            className="underline hover:text-foreground"
          >
            {PRODUCT_SUPPORT_EMAIL}
          </a>
          . Questions, data requests, or concerns:{" "}
          <a
            href={`mailto:${PRODUCT_CONTACT_EMAIL}`}
            className="underline hover:text-foreground"
          >
            {PRODUCT_CONTACT_EMAIL}
          </a>
          .
        </Section>

        <p className="pt-4 text-sm text-muted-foreground">
          See also our{" "}
          <Link href="/terms" className="underline hover:text-foreground">
            Terms of service
          </Link>
          .
        </p>
      </main>
    </div>
  );
}

const LAST_UPDATED = "19 August 2026";

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-semibold text-foreground">{title}</h2>
      <div>{children}</div>
    </section>
  );
}
