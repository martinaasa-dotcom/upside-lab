"use client";

import { Panel, PanelHeader, Reading } from "@/components/ui/Panel";
import { WhyThis } from "@/components/ui/WhyThis";
import { formatDateTime } from "@/lib/timezone";
import { companyBriefProvenance } from "@/lib/provenance";
import type { BriefPoint, CompanyBrief } from "@/lib/ai/company-brief";
import type { CompanyArticle } from "@/lib/company/sources";
import type { ModelRun } from "@/lib/ai/model-label";
import { GitCompare, ThumbsDown, ThumbsUp } from "lucide-react";

/**
 * The case for, the case against, and what would change the picture.
 *
 * Every point carries the thing it rests on, printed under it and linked
 * where it links. That receipt is the point of the section: it is what
 * turns "a model says this company has a strong position" into "a model
 * says this, on the strength of the profit figure four inches up the page,
 * which you can go and check". A point that could not name its evidence
 * never reached this component, and the count of those is shown, because a
 * run where half the points were thrown away deserves less trust from the
 * reader and hiding that would be the same dishonesty one level up.
 *
 * The two cases are given the same weight, the same size and the same
 * amount of room. Putting the case against second is a reading order, not
 * a ranking, and nothing here is allowed to make the good news louder.
 */

function Cite({ cite }: { cite: BriefPoint["cite"] }) {
  if (cite.kind === "figure") {
    return (
      <span className="text-muted-foreground">
        From the figures above: {cite.label.toLowerCase()}.
      </span>
    );
  }
  if (cite.kind === "article") {
    return (
      <span className="text-muted-foreground">
        From{" "}
        <a
          href={cite.href}
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-border underline-offset-4 hover:text-primary"
        >
          {cite.publisher}
        </a>
        : {cite.title}
      </span>
    );
  }
  return (
    <span className="text-muted-foreground">
      From the company&apos;s own description of what it does.
    </span>
  );
}

function PointList({ points }: { points: BriefPoint[] }) {
  if (points.length === 0) {
    return (
      <p className="text-sm leading-relaxed text-muted-foreground">
        Nothing here could be pinned to a figure on this page or an article
        below, so this section is empty rather than filled in. That is worth
        noticing on its own.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-4">
      {points.map((p, i) => (
        <li key={`${i}:${p.point.slice(0, 24)}`} className="flex flex-col gap-1">
          <p className="text-sm leading-relaxed text-foreground">{p.point}</p>
          <p className="text-sm leading-relaxed">
            <Cite cite={p.cite} />
          </p>
        </li>
      ))}
    </ul>
  );
}

export function CompanyCases({
  ticker,
  brief,
  articles,
  at,
  model,
  shared,
}: {
  ticker: string;
  brief: CompanyBrief;
  articles: CompanyArticle[];
  at?: string | null;
  model?: ModelRun | null;
  shared?: boolean;
}) {
  const provenance = companyBriefProvenance({
    ticker,
    articleCount: articles.length,
    publishers: articles.map((a) => a.publisher),
    uncited: brief.uncited,
    at,
    model,
    shared,
  });

  return (
    <Panel>
      <PanelHeader
        title={
          <span className="inline-flex items-center gap-2">
            The case for and against
            <WhyThis provenance={provenance} />
          </span>
        }
        subtitle="A language model read the figures above and the articles below, and was asked what the arguments each way are. Every point names the figure or the article it rests on."
        icon={<GitCompare className="h-4 w-4" />}
      />

      {/*
        `items-start`, so neither card is stretched to the other's height.

        The two cases rarely carry the same number of points, and a grid
        stretches its children by default: measured on a company with three
        points for and two against, the right-hand card was 399px tall with
        its content ending at 264, so a third of it was empty. A bordered
        card with a third of it blank reads as content that failed to
        arrive, where two cards of their own heights read as two answers of
        different lengths, which is what they are.
      */}
      <div className="grid items-start gap-4 md:grid-cols-2">
        <Reading
          nested
          tone="good"
          label="The case for"
          icon={<ThumbsUp className="h-4 w-4" />}
        >
          <PointList points={brief.caseFor} />
        </Reading>
        <Reading
          nested
          tone="warn"
          label="The case against"
          icon={<ThumbsDown className="h-4 w-4" />}
        >
          <PointList points={brief.caseAgainst} />
        </Reading>
      </div>

      {brief.watchFor.length > 0 && (
        <Reading nested label="What to watch">
          <PointList points={brief.watchFor} />
        </Reading>
      )}

      {/*
        One closing line rather than a card of caveats. The mark above
        carries the full account, and a panel that apologises twice reads
        as less trustworthy than one that says its piece once.
      */}
      <p className="text-sm leading-relaxed text-muted-foreground">
        {brief.uncited > 0
          ? `${brief.uncited === 1 ? "One point was" : `${brief.uncited} points were`} thrown away before you saw this, for naming no figure or article that exists.`
          : "Every point named something on this page, and none had to be thrown away."}
        {shared
          ? " It was written when somebody first looked this company up, not for you."
          : ""}
        {at ? ` Written ${formatDateTime(at)}.` : ""}{" "}
        Choosing which facts matter is a judgement, and it is the
        model&apos;s. The articles below are how you check it.
      </p>
    </Panel>
  );
}
