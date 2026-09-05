"use client";

import { Card, MicroLabel, Panel, PanelHeader } from "@/components/ui/Panel";
import { Badge } from "@/components/ui/badge";
import { formatRelativeTime } from "@/lib/timezone";
import type { CompanyArticle, CompanySource } from "@/lib/company/sources";
import { ExternalLink, Library } from "lucide-react";

/**
 * Go and check, which is the section that makes the rest of the page safe.
 *
 * Everything above this is a feed's figures or a model's reading of them,
 * and a reader cannot audit either from inside the app. So the page ends
 * with the door out: the articles it was handed, each with its publisher
 * and its date, and the standing places anybody can go to read the
 * company's own filings rather than somebody's summary of them.
 *
 * The publisher and the date are printed at the same size as the headline
 * and never smaller, because they are how a reader decides what weight to
 * give a piece. This app deliberately does not rank publishers or mark any
 * of them as trustworthy: that judgement would be an editorial line handed
 * to every reader in the product, decided by whoever last edited a list.
 * Naming who wrote it and when is the honest version of the same help.
 */

const KIND_LABEL = {
  primary: "From the company",
  market: "The figures",
  coverage: "Other people",
} as const;

export function CompanySources({
  articles,
  sources,
}: {
  articles: CompanyArticle[];
  sources: CompanySource[];
}) {
  return (
    <Panel>
      <PanelHeader
        title="Check it yourself"
        subtitle="Nothing on this page should be taken on trust. These are the articles it was written from and the places to go and read the company's own words."
        icon={<Library className="h-4 w-4" />}
      />

      {articles.length > 0 ? (
        <div className="flex flex-col gap-3">
          <MicroLabel>The articles this page was given</MicroLabel>
          <ul className="flex flex-col gap-2">
            {articles.map((a) => (
              <li key={a.href}>
                <a
                  href={a.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex flex-col gap-1 rounded-lg p-3 transition hover:bg-hover"
                >
                  <span className="flex items-start gap-2 text-sm font-medium leading-relaxed text-foreground group-hover:text-primary">
                    {a.title}
                    <ExternalLink
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {a.publisher} · {formatRelativeTime(a.publishedAt)}
                  </span>
                </a>
              </li>
            ))}
          </ul>
          <p className="text-sm leading-relaxed text-muted-foreground">
            This app has not checked any of these and does not vouch for any
            of them. The publisher and the date are there so you can decide
            what each one is worth.
          </p>
        </div>
      ) : (
        <p className="text-sm leading-relaxed text-muted-foreground">
          No articles came back for this company, so the reading above rests
          on the figures and the company&apos;s own description alone. That
          makes it thinner than usual, not wrong.
        </p>
      )}

      {sources.length > 0 && (
        <div className="flex flex-col gap-3">
          <MicroLabel>Where to go next</MicroLabel>
          <div className="grid gap-3 sm:grid-cols-2">
            {sources.map((s) => (
              <Card key={s.id} tone="default" className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <a
                    href={s.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-semibold text-foreground underline decoration-border underline-offset-4 hover:text-primary"
                  >
                    {s.label}
                  </a>
                  <Badge variant="outline" className="text-muted-foreground">
                    {KIND_LABEL[s.kind]}
                  </Badge>
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {s.detail}
                </p>
              </Card>
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}
