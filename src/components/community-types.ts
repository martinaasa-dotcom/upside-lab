import type { ClassroomTrade } from "@/lib/classroom";
import type { PortfolioPersonality } from "@/lib/portfolio-personality";
import type { Portfolio } from "@/lib/types";

export type CommunityProfile = {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio?: string | null;
};

export type CommunityMember = {
  user_id: string;
  user_ids?: string[];
  emails?: string[];
  role: string;
  joined_at: string;
  profile: CommunityProfile | null;
  is_you?: boolean;
};

export type CommunityPendingMember = {
  key: string;
  label: string;
  portfolio_ids: string[];
  emails: string[];
};

export type CommunityMeta = {
  id: string;
  name: string;
  visibility?: "public" | "private";
  /** Public circles: asking to join is joining, unless an admin says no. */
  auto_approve_joins?: boolean;
  kind?: "circle" | "classroom";
  starting_cash?: number;
  house_note?: string | null;
  class_plan?: unknown;
  classTrade?: ClassroomTrade | null;
  created_by: string | null;
};

export type CommunityJoinRequest = {
  id: string;
  user_id: string;
  message: string | null;
  requested_at: string;
  profile: {
    display_name: string | null;
    email: string | null;
    avatar_url: string | null;
  } | null;
};

export type OwnedPortfolio = Portfolio & { owner_id?: string };

export type PersonMilestone = {
  total: number;
  hitCount: number;
  goalCount: number;
  next: number | null;
  remaining: number;
  progress: number;
  lastGoal: number;
};

export type MemberStat = {
  id: string;
  name: string;
  isYou: boolean;
  isPending: boolean;
  sheetCount: number;
  sheetKey: string;
  totalValue: number;
  todayDollar: number;
  todayPct: number | null;
  /** Always 0 in community. Cost is not shared. */
  roiPct: number;
  personality: PortfolioPersonality | null;
  milestone: PersonMilestone;
};

export type CommunityAchievement = {
  id: string;
  emoji: string;
  title: string;
  winner: string;
  winnerId: string;
  stat: string;
  description: string;
};

export type CommunityViewTab = "overview" | "play" | "members";
