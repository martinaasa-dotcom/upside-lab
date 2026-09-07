import { HeaderBrand } from "@/components/HeaderBrand";
import { Button } from "@/components/ui/button";
import {
  LEGAL_CITY,
  LEGAL_OPERATOR,
  PRODUCT_NAME,
  PRODUCT_SUPPORT_EMAIL,
} from "@/lib/product";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The chrome a stranger gets.
 *
 * Deliberately not `AppHeader` and not the dock. Those are the furniture
 * of a signed-in product: a bar of rooms nobody can open, a portfolio
 * picker with no portfolios in it, and a marker that would sit on nothing.
 * A person who arrived from a search has no account and no reason to want
 * one yet, so what they get is the mark, one way into the product, and the
 * legal footer, which is the shape `/terms` and `/privacy` already use.
 *
 * The header is not sticky and carries no `backdrop-filter`. A filtered
 * element pinned over content that moves is what made the landing page
 * repaint on every scroll frame (42 of them, measured), and a public page
 * whose whole job is to be read start to finish is the worst possible
 * place to pay that again.
 */
export function ResearchChrome({ children }: { children: ReactNode }) {
  return (
    <div className="page-frame flex min-h-dvh flex-col bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full min-w-0 max-w-[1200px] items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <HeaderBrand />
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/research">All companies</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/login">Open {PRODUCT_NAME}</Link>
            </Button>
          </div>
        </div>
      </header>

      <main
        id="main"
        className="mx-auto flex w-full min-w-0 max-w-[1200px] flex-1 flex-col gap-6 px-4 pb-16 pt-6 sm:px-6"
      >
        {children}
      </main>

      <footer className="px-4 pb-10 pt-4 sm:px-6">
        <div className="mx-auto flex w-full min-w-0 max-w-[1200px] flex-col gap-2 border-t border-border pt-5 text-sm text-muted-foreground">
          <p className="leading-relaxed">
            Made in {LEGAL_CITY} by {LEGAL_OPERATOR}. Your holdings are stored
            in the European Union.
          </p>
          <p className="flex flex-wrap items-center gap-x-5 gap-y-1">
            <Link href="/research" className="underline hover:text-foreground">
              Research
            </Link>
            <Link href="/terms" className="underline hover:text-foreground">
              Terms
            </Link>
            <Link href="/privacy" className="underline hover:text-foreground">
              Privacy
            </Link>
            <a
              href={`mailto:${PRODUCT_SUPPORT_EMAIL}`}
              className="underline hover:text-foreground"
            >
              {PRODUCT_SUPPORT_EMAIL}
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
