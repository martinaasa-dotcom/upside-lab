"use client";

/**
 * GROWTH IS TWO QUESTIONS, AND THEY ARE THE SAME QUESTION AT TWO DISTANCES.
 *
 * The room has always answered "what does this money become", which is the
 * compound calculator. The one people actually arrive with is "will it be
 * enough, and when", which is the same arithmetic run to a destination
 * rather than for a number of years, with a life attached to it. Those
 * belong together: a reader who has just watched a contribution compound
 * for thirty years is one tap from finding out whether the answer covers
 * the life they want, and a reader who has just been handed a retirement
 * number is one tap from playing with what would change it.
 *
 * A TAB HERE RATHER THAN A ROOM OF ITS OWN, AND THAT IS A DELIBERATE
 * DECISION ABOUT THE DOCK. A new room means a new cell in a bar whose
 * width is content-sized and centred, and this file's own rules say a cell
 * exists because of the reader's data and never because of a route. Adding
 * a seventh destination to a phone bar that is already six glyphs across
 * 374px costs every other cell width for a room most readers will open a
 * handful of times a year. Lab's sub-tabs are the precedent and the label
 * is short enough not to widen the row.
 *
 * ONE LOADER PER PANEL, REFERENCED FROM BOTH `dynamic` AND THE WARM. Two
 * separate `import()` expressions for the same module may land in different
 * chunk groups, and on the real build they did: the idle warm ran and the
 * first tap still fetched a chunk. See the account in AGENTS.md.
 */

import { Panel, PanelHeader, Segmented } from "@/components/ui/Panel";
import { Sprout } from "lucide-react";
import {
  loadCompoundInterestSheet,
  loadRetirementSheet,
} from "@/lib/growth-chunks";
import dynamic from "next/dynamic";
import { useEffect, useState, type ComponentProps } from "react";

const CompoundInterestSheet = dynamic(loadCompoundInterestSheet, { ssr: true });
const RetirementSheet = dynamic(loadRetirementSheet, { ssr: true });

type GrowthTab = "compound" | "retirement";

const TABS: { id: GrowthTab; label: string }[] = [
  { id: "compound", label: "Compound" },
  { id: "retirement", label: "Retirement" },
];

/**
 * Reads `?growthtab=`, so a refresh or a link lands back on the panel it
 * named rather than always on the calculator. Same shape as Lab's own
 * `?labtab=`, deliberately, because two sub-tab schemes that behave
 * differently is two things for a reader to learn.
 */
function initialTab(): GrowthTab {
  if (typeof window === "undefined") return "compound";
  const param = new URLSearchParams(window.location.search).get("growthtab");
  return TABS.some((t) => t.id === param) ? (param as GrowthTab) : "compound";
}

/*
  Mirrors `CompoundInterestSheet`'s own props rather than re-deriving them.
  This component is a passthrough for that panel, and a second, subtly
  different spelling of the same shape is how two places that must agree
  start disagreeing.
*/
type Props = ComponentProps<typeof CompoundInterestSheet>;

export function GrowthRoom(props: Props) {
  const [tab, setTab] = useState<GrowthTab>("compound");

  useEffect(() => {
    setTab(initialTab());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (tab === "compound") url.searchParams.delete("growthtab");
    else url.searchParams.set("growthtab", tab);
    window.history.replaceState(null, "", url.toString());
  }, [tab]);

  return (
    <div className="flex flex-col gap-6">
      <Panel>
        <PanelHeader
          icon={<Sprout className="h-4 w-4" />}
          title="Growth"
          subtitle="What money becomes if you leave it alone, and whether that is enough to stop working on."
        />
        <Segmented
          options={TABS}
          value={tab}
          onChange={setTab}
          columns={TABS.length}
          ariaLabel="Growth view"
        />
      </Panel>

      {tab === "retirement" ? (
        <RetirementSheet portfolioValue={props.bookValue > 0 ? props.bookValue : null} />
      ) : (
        <CompoundInterestSheet
          bookValue={props.bookValue}
          sheets={props.sheets}
          tickerValues={props.tickerValues}
          bookCash={props.bookCash}
          eurUsd={props.eurUsd}
          eurUsdDetail={props.eurUsdDetail}
        />
      )}
    </div>
  );
}
