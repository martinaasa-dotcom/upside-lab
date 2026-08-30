/** One prompt after the first holding lands. Then stop. */

export const INVITE_NUDGE_KEY = "upside-invite-nudge-v1";
export const INVITE_NUDGE_EVENT = "upside:invite-nudge";

type NudgeState = {
  dismissed: boolean;
  offered: string[];
};

function emptyState(): NudgeState {
  return { dismissed: false, offered: [] };
}

function loadState(): NudgeState {
  if (typeof window === "undefined") return emptyState();
  try {
    const raw = window.localStorage.getItem(INVITE_NUDGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as Partial<NudgeState>;
    return {
      dismissed: parsed.dismissed === true,
      offered: Array.isArray(parsed.offered)
        ? parsed.offered.filter((id): id is string => typeof id === "string")
        : [],
    };
  } catch {
    return emptyState();
  }
}

function saveState(next: NudgeState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(INVITE_NUDGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota / private mode */
  }
  window.dispatchEvent(new Event(INVITE_NUDGE_EVENT));
}

export function inviteNudgeEligible(input: {
  classroom: boolean;
  holdingCountBefore: number;
  holdingCountAfter: number;
  dismissed: boolean;
  alreadyOffered: boolean;
}): boolean {
  if (input.classroom) return false;
  if (input.holdingCountBefore > 0) return false;
  if (input.holdingCountAfter <= 0) return false;
  if (input.dismissed) return false;
  if (input.alreadyOffered) return false;
  return true;
}

export function shouldOfferInvite(input: {
  portfolioId: string;
  classroom: boolean;
  holdingCountBefore: number;
  holdingCountAfter: number;
}): boolean {
  if (!input.portfolioId) return false;
  const state = loadState();
  return inviteNudgeEligible({
    classroom: input.classroom,
    holdingCountBefore: input.holdingCountBefore,
    holdingCountAfter: input.holdingCountAfter,
    dismissed: state.dismissed,
    alreadyOffered: state.offered.includes(input.portfolioId),
  });
}

export function markInviteOffered(portfolioId: string) {
  if (!portfolioId) return;
  const state = loadState();
  if (state.offered.includes(portfolioId)) return;
  saveState({ ...state, offered: [...state.offered, portfolioId] });
}

export function dismissInviteNudge() {
  saveState({ ...loadState(), dismissed: true });
}
