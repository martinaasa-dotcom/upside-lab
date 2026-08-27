"use client";

import { bookTodayPct } from "@/components/CircleCards";
import type {
  CommunityJoinRequest,
  CommunityMember,
  CommunityPendingMember,
  OwnedPortfolio,
} from "@/components/community-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item";
import { sheetCashBalance } from "@/lib/cash-balance";
import {
  inviteDayLabel,
  inviteLockLabel,
  inviteUsesLabel,
  type InviteAdminRow,
} from "@/lib/community-invite-admin";
import {
  cn,
  currency,
  NO_VALUE,
  signedPercent,
  signedTone,
} from "@/lib/format";
import type { OverviewModel } from "@/lib/overview";
import {
  animalCardTone,
  buildPortfolioPersonality,
} from "@/lib/portfolio-personality";
import type { Holding, Quote } from "@/lib/types";
import {
  Check,
  Copy,
  Link2,
  LogOut,
  Shield,
  UserCheck,
  UserMinus,
  Users,
} from "lucide-react";
import type { Dispatch, SetStateAction } from "react";

export type CommunityMembersPanelProps = {
  isClassroom: boolean;
  isAdmin: boolean;
  members: CommunityMember[];
  pendingMembers: CommunityPendingMember[];
  joinRequests: CommunityJoinRequest[];
  joinDecisionBusyId: string | null;
  portfolios: OwnedPortfolio[];
  holdings: Holding[];
  quotes: Record<string, Quote>;
  ownership: { portfolio_id: string; user_id: string }[];
  overview: OverviewModel;
  profileName: (id: string) => string;
  memberEmails: (m: CommunityMember) => string[];
  busy: boolean;
  inviteEmail: string;
  setInviteEmail: Dispatch<SetStateAction<string>>;
  inviteDays: string;
  setInviteDays: Dispatch<SetStateAction<string>>;
  inviteNeverExpires: boolean;
  setInviteNeverExpires: Dispatch<SetStateAction<boolean>>;
  inviteUrl: string | null;
  inviteEmailed: number;
  invites: InviteAdminRow[];
  copiedInviteId: string | null;
  createInvite: () => Promise<void>;
  copyInviteLink: (url: string | null, key: string) => Promise<void>;
  setRole: (userId: string, role: "admin" | "member") => Promise<void>;
  decideJoinRequest: (
    userId: string,
    decision: "approve" | "reject"
  ) => Promise<void>;
  setRemoveTarget: Dispatch<SetStateAction<{ userId: string; name: string } | null>>;
  setLeaveOpen: Dispatch<SetStateAction<boolean>>;
  setRetireTarget: Dispatch<SetStateAction<InviteAdminRow | null>>;
  setSelectedOwnerId: Dispatch<SetStateAction<string | null>>;
};

export function CommunityMembersPanel({
  isClassroom,
  isAdmin,
  members,
  pendingMembers,
  joinRequests,
  joinDecisionBusyId,
  portfolios,
  holdings,
  quotes,
  ownership,
  overview,
  profileName,
  memberEmails,
  busy,
  inviteEmail,
  setInviteEmail,
  inviteDays,
  setInviteDays,
  inviteNeverExpires,
  setInviteNeverExpires,
  inviteUrl,
  inviteEmailed,
  invites,
  copiedInviteId,
  createInvite,
  copyInviteLink,
  setRole,
  decideJoinRequest,
  setRemoveTarget,
  setLeaveOpen,
  setRetireTarget,
  setSelectedOwnerId,
}: CommunityMembersPanelProps) {
  return (
    <>
                  <section className="flex flex-col gap-3">
                    <h2 className="flex items-center gap-2 text-foreground">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      Members
                    </h2>
                    <ul className="divide-y divide-border overflow-hidden rounded-xl glass ring-1 ring-foreground/20">
                      {members.map((m) => {
                        const sheetIds = new Set(
                          ownership
                            .filter((o) => o.user_id === m.user_id)
                            .map((o) => o.portfolio_id)
                        );
                        const sheets = portfolios.filter((p) => sheetIds.has(p.id));
                        const sheetValue = sheets.reduce((sum, p) => {
                          const score = overview.sheets.find(
                            (s) => s.portfolio.id === p.id
                          );
                          return sum + (score?.totalValue ?? 0);
                        }, 0);
                        const sheetToday = sheets.reduce((sum, p) => {
                          const score = overview.sheets.find(
                            (s) => s.portfolio.id === p.id
                          );
                          return sum + (score?.todayDollar ?? 0);
                        }, 0);
                        const sheetTodayPct = bookTodayPct(sheetValue, sheetToday);
                        const memberCash = sheets.reduce(
                          (sum, p) => sum + sheetCashBalance(p),
                          0
                        );
                        const memberTickerValues = holdings
                          .filter((h) => sheetIds.has(h.portfolio_id))
                          .map((h) => ({
                            ticker: h.ticker,
                            value:
                              h.shares * (quotes[h.ticker]?.price ?? 0),
                          }));
                        const personality =
                          memberTickerValues.length > 0
                            ? buildPortfolioPersonality(
                                memberTickerValues,
                                memberCash
                              )
                            : null;
                        const emails = memberEmails(m);
                        const animalTone = personality
                          ? animalCardTone(personality.archetype.id)
                          : null;
                        return (
                          <li
                            key={m.user_id}
                            className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedOwnerId(m.user_id);
                              }}
                              className="text-left"
                            >
                              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                                {profileName(m.user_id)}
                                {m.is_you && (
                                  <span className="text-sm text-muted-foreground">
                                    (you)
                                  </span>
                                )}
                                {personality && animalTone && (
                                  <span
                                    className={cn(
                                      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-sm font-medium",
                                      animalTone.border,
                                      animalTone.wash,
                                      animalTone.name
                                    )}
                                    title={personality.whyThisAnimal}
                                  >
                                    <span aria-hidden>
                                      {personality.animalEmoji}
                                    </span>
                                    {personality.animal}
                                  </span>
                                )}
                              </div>
                              {m.profile?.bio ? (
                                <div className="text-sm text-muted-foreground">
                                  {m.profile.bio}
                                </div>
                              ) : null}
                              {emails.length > 1 ? (
                                <div className="text-sm text-muted-foreground">
                                  {emails.join(" · ")}
                                </div>
                              ) : null}
                              <div className="text-sm text-muted-foreground">
                                {m.role}
                                {" · "}
                                {sheets.length} portfolio
                                {sheets.length === 1 ? "" : "s"}
                                {sheets.length > 0 && (
                                  <>
                                    {" - today "}
                                    <span
                                      className={signedTone(
                                        sheetTodayPct,
                                        "text-muted-foreground"
                                      )}
                                    >
                                      {sheetTodayPct != null
                                        ? signedPercent(sheetTodayPct)
                                        : NO_VALUE}
                                    </span>
                                  </>
                                )}
                                {" · "}
                                {currency(sheetValue)}
                              </div>
                            </button>
                            {isAdmin && !m.is_you && (
                              <div className="flex items-center gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={busy}
                                  onClick={() =>
                                    void setRole(
                                      m.user_id,
                                      m.role === "admin" ? "member" : "admin"
                                    )
                                  }
                                >
                                  <Shield data-icon="inline-start" />
                                  {m.role === "admin" ? "Demote" : "Make admin"}
                                </Button>
                                <Button
                                  type="button"
                                  variant="destructive"
                                  size="sm"
                                  disabled={busy}
                                  onClick={() =>
                                    setRemoveTarget({
                                      userId: m.user_id,
                                      name: profileName(m.user_id),
                                    })
                                  }
                                >
                                  <UserMinus data-icon="inline-start" />
                                  Remove
                                </Button>
                              </div>
                            )}
                            {m.is_you && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={busy}
                                onClick={() => setLeaveOpen(true)}
                              >
                                <LogOut data-icon="inline-start" />
                                Leave
                              </Button>
                            )}
                          </li>
                        );
                      })}
                      {pendingMembers.map((p) => {
                        const sheets = portfolios.filter((x) =>
                          p.portfolio_ids.includes(x.id)
                        );
                        const sheetValue = sheets.reduce((sum, sheet) => {
                          const score = overview.sheets.find(
                            (s) => s.portfolio.id === sheet.id
                          );
                          return sum + (score?.totalValue ?? 0);
                        }, 0);
                        const sheetToday = sheets.reduce((sum, sheet) => {
                          const score = overview.sheets.find(
                            (s) => s.portfolio.id === sheet.id
                          );
                          return sum + (score?.todayDollar ?? 0);
                        }, 0);
                        const sheetTodayPct = bookTodayPct(sheetValue, sheetToday);
                        const ownerKey = `pending:${p.key}`;
                        return (
                          <li
                            key={ownerKey}
                            className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedOwnerId(ownerKey);
                              }}
                              className="text-left"
                            >
                              <div className="text-sm font-medium text-foreground">
                                {p.label}
                                <span className="ml-2 text-sm font-normal text-caution">
                                  awaiting sign-in
                                </span>
                              </div>
                              {p.emails.length ? (
                                <div className="text-sm text-muted-foreground">
                                  {p.emails.join(" · ")}
                                </div>
                              ) : null}
                              <div className="text-sm text-muted-foreground">
                                {sheets.length} portfolio
                                {sheets.length === 1 ? "" : "s"}
                                {sheets.length > 0 && (
                                  <>
                                    {" - today "}
                                    <span
                                      className={signedTone(
                                        sheetTodayPct,
                                        "text-muted-foreground"
                                      )}
                                    >
                                      {sheetTodayPct != null
                                        ? signedPercent(sheetTodayPct)
                                        : NO_VALUE}
                                    </span>
                                  </>
                                )}
                                {" · "}
                                {currency(sheetValue)}
                              </div>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </section>

                  {isAdmin && joinRequests.length > 0 && (
                    <section className="card-sheen glass flex flex-col gap-3 rounded-xl p-4 ring-1 ring-foreground/20 sm:p-6">
                      <h2 className="flex items-center gap-2 text-foreground">
                        <UserCheck className="size-4 text-muted-foreground" />
                        Join requests
                        <Badge variant="secondary">{joinRequests.length}</Badge>
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        This community is public, so anyone can ask to join,
                        but nothing happens until you approve them here.
                      </p>
                      <ItemGroup>
                        {joinRequests.map((r) => (
                          <Item key={r.id} className="px-0">
                            <ItemContent>
                              <ItemTitle>
                                {r.profile?.display_name ??
                                  r.profile?.email ??
                                  "Unknown"}
                              </ItemTitle>
                              <ItemDescription>
                                {r.profile?.email}
                              </ItemDescription>
                            </ItemContent>
                            <ItemActions>
                              <Button
                                type="button"
                                size="xs"
                                disabled={joinDecisionBusyId === r.user_id}
                                onClick={() =>
                                  void decideJoinRequest(r.user_id, "approve")
                                }
                              >
                                Approve
                              </Button>
                              <Button
                                type="button"
                                size="xs"
                                variant="outline"
                                disabled={joinDecisionBusyId === r.user_id}
                                onClick={() =>
                                  void decideJoinRequest(r.user_id, "reject")
                                }
                              >
                                Decline
                              </Button>
                            </ItemActions>
                          </Item>
                        ))}
                      </ItemGroup>
                    </section>
                  )}

                  {isAdmin && (
                    <section className="card-sheen glass flex flex-col gap-3 rounded-xl p-4 ring-1 ring-foreground/20 sm:p-6">
                      <h2 className="text-foreground">
                        Admin - invite
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        {isClassroom
                          ? "This link works for 30 days. Students join with it. Each one gets the same paper cash and an empty portfolio. Put emails if you want us to send the link, and to lock it to those people. Separate them with a comma. Change the number of days if 30 is wrong for you."
                          : "This link works for 30 days. Anyone with it can join. Their portfolios show up here. They can turn one off later. Today's prices only. Put emails if you want us to send the link, and to lock it to those people. Separate them with a comma. Change the number of days if 30 is wrong for you."}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Input
                          type="text"
                          inputMode="email"
                          autoComplete="off"
                          value={inviteEmail}
                          onChange={(e) => setInviteEmail(e.target.value)}
                          placeholder="Emails (optional, comma between)"
                          className="min-w-[12rem] w-auto flex-1"
                        />
                        <Input
                          type="number"
                          min={1}
                          max={365}
                          inputMode="numeric"
                          value={inviteDays}
                          onChange={(e) => setInviteDays(e.target.value)}
                          disabled={inviteNeverExpires}
                          placeholder="Days live (30 by default)"
                          className="no-spinner w-[14rem] min-w-[14rem] shrink-0"
                        />
                        <Button
                          type="button"
                          disabled={busy}
                          onClick={() => void createInvite()}
                        >
                          <Link2 data-icon="inline-start" />
                          Create invite link
                        </Button>
                      </div>
                      <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Checkbox
                          checked={inviteNeverExpires}
                          onCheckedChange={(v) =>
                            setInviteNeverExpires(v === true)
                          }
                          aria-label="Link never expires"
                        />
                        Never expires. Anyone who ever sees this link can
                        join, so only use it somewhere private.
                      </label>
                      {inviteUrl && (
                        <Item className="items-start px-0">
                          <ItemContent>
                            {inviteEmailed > 0 ? (
                              <ItemTitle>
                                {inviteEmailed === 1
                                  ? "Sent the link to 1 person."
                                  : `Sent the link to ${inviteEmailed} people.`}
                              </ItemTitle>
                            ) : null}
                            <ItemDescription className="line-clamp-none break-all text-foreground">
                              {inviteUrl}
                            </ItemDescription>
                          </ItemContent>
                          <ItemActions>
                            <Button
                              type="button"
                              size="xs"
                              variant="outline"
                              onClick={() =>
                                void copyInviteLink(inviteUrl, "fresh")
                              }
                            >
                              {copiedInviteId === "fresh" ? (
                                <Check data-icon="inline-start" />
                              ) : (
                                <Copy data-icon="inline-start" />
                              )}
                              {copiedInviteId === "fresh" ? "Copied" : "Copy"}
                            </Button>
                          </ItemActions>
                        </Item>
                      )}
                      {invites.length > 0 && (
                        <ItemGroup className="gap-2">
                          {invites.map((inv) => {
                            const you = members.find((m) => m.is_you);
                            const youIds = you?.user_ids ?? (you ? [you.user_id] : []);
                            const creatorName =
                              inv.created_by && youIds.includes(inv.created_by.id)
                                ? "You"
                                : inv.created_by?.name ?? "Someone";
                            const usedNames = inv.used_by.map((u) => u.name);
                            const usedLine =
                              usedNames.length === 0
                                ? null
                                : usedNames.length <= 4
                                  ? usedNames.join(", ")
                                  : `${usedNames.slice(0, 4).join(", ")} and ${usedNames.length - 4} more`;
                            const statusLabel =
                              inv.status === "retired"
                                ? "Retired"
                                : inv.status === "expired"
                                  ? "Expired"
                                  : "Live";
                            const live = inv.status === "live";
                            const url = inv.path
                              ? `${window.location.origin}${inv.path}`
                              : null;
                            const copied = copiedInviteId === inv.id;
                            return (
                              <Item key={inv.id} variant="outline">
                                <ItemContent>
                                  <ItemTitle>
                                    {creatorName}
                                  </ItemTitle>
                                  <ItemDescription>
                                    {inviteLockLabel(inv.email)}
                                    {" · "}
                                    {inviteDayLabel(inv.created_at)}
                                    {" · "}
                                    {inviteUsesLabel(inv.uses)}
                                    {" · "}
                                    {statusLabel}
                                  </ItemDescription>
                                  {usedLine ? (
                                    <ItemDescription>
                                      {usedLine}
                                    </ItemDescription>
                                  ) : null}
                                </ItemContent>
                                <ItemActions>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    disabled={!live}
                                    title="Copy invite link"
                                    onClick={() =>
                                      void copyInviteLink(url, inv.id)
                                    }
                                  >
                                    {copied ? (
                                      <Check data-icon="inline-start" />
                                    ) : (
                                      <Copy data-icon="inline-start" />
                                    )}
                                    {copied ? "Copied" : "Copy link"}
                                  </Button>
                                  {live ? (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      disabled={busy}
                                      onClick={() => setRetireTarget(inv)}
                                    >
                                      Retire this link
                                    </Button>
                                  ) : null}
                                </ItemActions>
                              </Item>
                            );
                          })}
                        </ItemGroup>
                      )}
                    </section>
                  )}
    </>
  );
}
