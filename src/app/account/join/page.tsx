"use client";

import { track } from "@vercel/analytics";
import { useAuth } from "@/components/AuthProvider";
import { plainError } from "@/lib/plain-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SignInGate } from "@/components/SignInGate";
import { JOIN_SHEET_INVITE } from "@/lib/invite-landing";
import { MessageLine, MessageScreen } from "@/components/MessageScreen";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

function JoinInner() {
  const params = useSearchParams();
  const router = useRouter();
  const { ready, user } = useAuth();
  const code =
    params.get("code")?.trim() || params.get("token")?.trim() || "";
  const [manual, setManual] = useState(code);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(
    code ? "Accepting invite …" : null
  );

  async function accept(inviteCode: string, signal?: AbortSignal) {
    setError(null);
    setStatus("Accepting invite …");
    try {
      const res = await fetch("/api/portfolios/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: inviteCode }),
        signal,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(plainError(data.error, "Couldn't join. Try the link again."));
      if (signal?.aborted) return;
      track("portfolio_invite_redeemed");
      setStatus(
        data.portfolio?.name
          ? `Joined ${data.portfolio.name}, opening your portfolio …`
          : "Joined, opening your portfolio …"
      );
      router.replace("/");
    } catch (e) {
      if (signal?.aborted) return;
      setStatus(null);
      setError(e instanceof Error ? e.message : "Couldn't join. Try the link again.");
    }
  }

  useEffect(() => {
    if (!ready || !user || !code) return;
    const ctrl = new AbortController();
    void accept(code, ctrl.signal);
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, user, code]);

  return (
    <SignInGate invite={JOIN_SHEET_INVITE}>
      <MessageScreen title="Join a portfolio">
        <MessageLine>
          Your partner invited you to edit this portfolio together. Paste the
          code if the link did not fill it in.
        </MessageLine>
        {(!code || error) && (
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (manual.trim()) void accept(manual.trim());
            }}
          >
            <Input
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="Paste invite code"
              aria-label="Invite code"
            />
            <Button type="submit" className="w-full">
              Join portfolio
            </Button>
          </form>
        )}
        {status && <MessageLine>{status}</MessageLine>}
        {error && <MessageLine tone="loss">{error}</MessageLine>}
      </MessageScreen>
    </SignInGate>
  );
}

export default function AccountJoinPage() {
  return (
    <Suspense
      fallback={
        <MessageScreen title="Join a portfolio">
          <MessageLine>Opening your invite …</MessageLine>
        </MessageScreen>
      }
    >
      <JoinInner />
    </Suspense>
  );
}
