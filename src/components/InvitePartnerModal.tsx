"use client";

import { useAuth } from "@/components/AuthProvider";
import { plainError } from "@/lib/plain-error";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item";
import { ViewportOverlay } from "@/components/ui/ViewportOverlay";
import { track } from "@vercel/analytics";
import { Check, Copy, UserMinus, X } from "lucide-react";
import { useTimeout } from "@/lib/use-timeout";
import { useCallback, useEffect, useState } from "react";

type OwnerRow = {
  user_id: string;
  profile: {
    email: string | null;
    display_name: string | null;
  } | null;
};

type Props = {
  open: boolean;
  portfolioId: string;
  portfolioName: string;
  onClose: () => void;
};

export function InvitePartnerModal({
  open,
  portfolioId,
  portfolioName,
  onClose,
}: Props) {
  const { user } = useAuth();
  const later = useTimeout();
  const [email, setEmail] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [owners, setOwners] = useState<OwnerRow[]>([]);
  const [copied, setCopied] = useState<"link" | "code" | null>(null);
  const [removeTarget, setRemoveTarget] = useState<OwnerRow | null>(null);

  const loadOwners = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch(`/api/portfolios/${portfolioId}/owners`, {
        signal,
      });
      const data = (await res.json().catch(() => ({}))) as { owners?: OwnerRow[] };
      if (signal?.aborted) return;
      setOwners(data.owners ?? []);
    } catch {
      /* closed or network */
    }
  }, [portfolioId]);

  useEffect(() => {
    if (!open) return;
    setEmail("");
    setLink(null);
    setCode(null);
    setMsg(null);
    setErr(null);
    const ctrl = new AbortController();
    void loadOwners(ctrl.signal);
    return () => ctrl.abort();
  }, [open, loadOwners]);

  if (!open) return null;

  async function createInvite() {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const trimmed = email.trim();
      if (trimmed) {
        const add = await fetch(`/api/portfolios/${portfolioId}/owners`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: trimmed }),
        });
        const addData = (await add.json().catch(() => ({}))) as {
          error?: string;
        };
        if (add.ok) {
          track("portfolio_invite_created", { direct_add: true });
          setMsg(`Added ${trimmed} as co-owner.`);
          setEmail("");
          await loadOwners();
          return;
        }
        if (add.status !== 404) {
          throw new Error(plainError(addData.error, "Couldn't add that person."));
        }
      }
      const res = await fetch(`/api/portfolios/${portfolioId}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed || undefined }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        url?: string;
        code?: string;
        token?: string;
      };
      if (!res.ok) throw new Error(plainError(data.error, "Couldn't create an invite."));
      track("portfolio_invite_created");
      setLink(data.url ?? null);
      setCode(data.code ?? data.token ?? null);
      setMsg(
        trimmed
          ? `Invite ready for ${trimmed}. Share the link or code.`
          : "Invite ready. Share the link or code with your partner."
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't create an invite.");
    } finally {
      setBusy(false);
    }
  }

  async function copy(text: string, kind: "link" | "code") {
    await navigator.clipboard.writeText(text);
    setCopied(kind);
    later(() => setCopied(null), 1500);
  }

  return (
    <ViewportOverlay
      className="z-[80] flex items-end justify-center sm:items-center"
      onClose={onClose}
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="scroll-host relative max-h-full w-full overflow-y-auto rounded-t-xl bg-popover ring-1 ring-foreground/20 p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:max-w-md sm:rounded-xl sm:pb-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-foreground">
              Invite a partner
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              They get live edit access to {portfolioName}, not a read-only
              peek.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="touch-target sm:size-7"
            aria-label="Close"
          >
            <X />
          </Button>
        </div>

        <label className="mt-4 flex flex-col gap-1">
          <span className="text-sm text-muted-foreground">
            Partner email (optional)
          </span>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="partner@work.com"
          />
        </label>
        <Button
          type="button"
          className="mt-3"
          disabled={busy}
          onClick={() => void createInvite()}
        >
          {busy ? "Working …" : "Create invite"}
        </Button>
        {err && <p className="mt-2 text-sm text-loss">{err}</p>}
        {msg && <p className="mt-2 text-sm text-gain">{msg}</p>}
        {(link || code) && (
          <ItemGroup className="mt-3">
            {code ? (
              <Item className="px-0">
                <ItemContent>
                  <ItemTitle className="font-mono">{code}</ItemTitle>
                </ItemContent>
                <ItemActions>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void copy(code, "code")}
                  >
                    {copied === "code" ? (
                      <Check data-icon="inline-start" />
                    ) : (
                      <Copy data-icon="inline-start" />
                    )}
                    Copy code
                  </Button>
                </ItemActions>
              </Item>
            ) : null}
            {link ? (
              <Item className="px-0">
                <ItemContent>
                  <ItemDescription className="line-clamp-none truncate">
                    {link}
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void copy(link, "link")}
                  >
                    {copied === "link" ? (
                      <Check data-icon="inline-start" />
                    ) : (
                      <Copy data-icon="inline-start" />
                    )}
                    Copy link
                  </Button>
                </ItemActions>
              </Item>
            ) : null}
          </ItemGroup>
        )}

        {owners.length > 0 && (
          <ul className="mt-4 divide-y divide-border overflow-hidden rounded-xl glass ring-1 ring-foreground/20">
            {owners.map((o) => (
              <li
                key={o.user_id}
                className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm"
              >
                <span className="min-w-0 truncate text-foreground">
                  {o.profile?.display_name || o.profile?.email || o.user_id.slice(0, 8)}
                  {o.user_id === user?.id ? (
                    <span className="ml-2 text-sm text-muted-foreground">(you)</span>
                  ) : null}
                </span>
                {owners.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setRemoveTarget(o)}
                    aria-label="Remove"
                  >
                    <UserMinus />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      <ConfirmModal
        open={Boolean(removeTarget)}
        title="Remove this person?"
        body={
          removeTarget?.user_id === user?.id
            ? `You'll lose edit access to ${portfolioName}.`
            : `Remove them from ${portfolioName}?`
        }
        confirmLabel="Remove"
        destructive
        onClose={() => setRemoveTarget(null)}
        onConfirm={async () => {
          if (!removeTarget) return false;
          const res = await fetch(
            `/api/portfolios/${portfolioId}/owners?userId=${encodeURIComponent(removeTarget.user_id)}`,
            { method: "DELETE" }
          );
          if (!res.ok) return false;
          setRemoveTarget(null);
          await loadOwners();
          return true;
        }}
      />
    </ViewportOverlay>
  );
}
