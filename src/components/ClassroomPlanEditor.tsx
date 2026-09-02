"use client";

import {
  CLASS_PERIOD_KINDS,
  classPeriodLabel,
  parseClassPlan,
  type ClassPeriod,
  type ClassPeriodKind,
  type ClassPlan,
  type ClassroomTrade,
} from "@/lib/classroom";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDateTime } from "@/lib/timezone";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { useState } from "react";

function fromLocalInput(value: string): string | null {
  if (!value.trim()) return null;
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString();
}

const KINDS = CLASS_PERIOD_KINDS.map((id) => ({
  id,
  label: classPeriodLabel(id),
}));

export function ClassroomPlanEditor({
  plan,
  trade,
  busy,
  onStart,
  onSavePlan,
}: {
  plan: ClassPlan;
  trade: ClassroomTrade | null;
  busy: boolean;
  onStart: (kind: ClassPeriodKind) => void;
  onSavePlan: (plan: ClassPlan) => void;
}) {
  const scheduled = plan.periods.filter(
    (p) => !p.endsAt || Date.parse(p.endsAt) > Date.now()
  );
  const [draftKind, setDraftKind] = useState<ClassPeriodKind>("buy");
  const [draftStart, setDraftStart] = useState("");
  const [draftEnd, setDraftEnd] = useState("");
  const [draftError, setDraftError] = useState<string | null>(null);

  function addStretch() {
    const startsAt = fromLocalInput(draftStart);
    if (!startsAt) return;
    const endsAt = fromLocalInput(draftEnd);
    if (endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) {
      setDraftError("The end has to be after the start.");
      return;
    }
    setDraftError(null);
    const next: ClassPeriod = {
      id: crypto.randomUUID(),
      kind: draftKind,
      startsAt,
      endsAt,
    };
    onSavePlan(parseClassPlan({ ...plan, periods: [...plan.periods, next] }));
    setDraftStart("");
    setDraftEnd("");
  }

  function remove(id: string) {
    onSavePlan(
      parseClassPlan({
        ...plan,
        periods: plan.periods.filter((p) => p.id !== id),
      })
    );
  }

  return (
    <div className="mt-8 border-t border-border pt-6">
      <p className="text-sm font-medium text-muted-foreground">What students can do</p>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Change this whenever the lesson changes. Buy week, closed, sell
        and move money, or leave it open.
      </p>
      {trade ? (
        <p className="mt-2 text-sm text-foreground">
          Now: {trade.label}
          {trade.until
            ? ` until ${formatDateTime(trade.until, {
                weekday: "short",
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}`
            : ""}
        </p>
      ) : null}
      <div className="mt-4 grid grid-cols-2 gap-2.5">
        {KINDS.map((k) => (
          <Button
            key={k.id}
            type="button"
            variant={trade?.kind === k.id ? "secondary" : "outline"}
            disabled={busy || trade?.kind === k.id}
            onClick={() => onStart(k.id)}
            className="h-auto py-2.5"
          >
            {k.label}
          </Button>
        ))}
      </div>

      <p className="mt-8 text-sm font-medium text-muted-foreground">Schedule</p>
      {scheduled.length === 0 ? (
        <p className="mt-1 text-sm text-muted-foreground">
          Nothing scheduled. Use the buttons above for now, or add a dated period below.
        </p>
      ) : (
        <ItemGroup>
          {scheduled.map((p) => (
            <Item key={p.id} className="px-0">
              <ItemContent>
                <ItemTitle>{classPeriodLabel(p.kind)}</ItemTitle>
                <ItemDescription className="line-clamp-none">
                  {formatDateTime(p.startsAt, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {p.endsAt
                    ? ` to ${formatDateTime(p.endsAt, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}`
                    : ""}
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={busy}
                  onClick={() => remove(p.id)}
                  title="Remove"
                  aria-label={`Remove ${classPeriodLabel(p.kind)}`}
                >
                  <Trash2 />
                </Button>
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
      )}

      <div className="flex flex-col mt-6 gap-3 card-sheen glass-well rounded-lg p-6">
        <p className="text-sm font-medium text-muted-foreground">Add a period</p>
        <NativeSelect
          value={draftKind}
          onChange={(e) => setDraftKind(e.target.value as ClassPeriodKind)}
          className="w-full"
        >
          {KINDS.map((k) => (
            <NativeSelectOption key={k.id} value={k.id}>
              {k.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <label className="block text-sm text-muted-foreground">
          Starts
          <Input
            type="datetime-local"
            value={draftStart}
            onChange={(e) => setDraftStart(e.target.value)}
            className="mt-1"
          />
        </label>
        <label className="block text-sm text-muted-foreground">
          Ends (optional)
          <Input
            type="datetime-local"
            value={draftEnd}
            onChange={(e) => setDraftEnd(e.target.value)}
            className="mt-1"
          />
        </label>
        {draftError ? (
          <p className="text-sm text-loss">{draftError}</p>
        ) : null}
        <Button
          type="button"
          variant="outline"
          disabled={busy || !draftStart}
          onClick={addStretch}
        >
          <Plus data-icon="inline-start" />
          Add a period
        </Button>
      </div>
    </div>
  );
}

export function planFromCommunity(raw: unknown): ClassPlan {
  return parseClassPlan(raw);
}
