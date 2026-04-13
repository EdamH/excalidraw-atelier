export type Role = "owner" | "editor" | "viewer";

export interface User {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export interface SceneListItem {
  _id: string;
  title: string;
  ownerName: string;
  role: Role;
  createdAt?: string;
  updatedAt: string;
  lastEditedById: string | null;
  lastEditedByName: string | null;
  lastEditedAt: string | null;
  deletedAt: string | null;
  folderId: string | null;
  tags: string[];
  isStarred: boolean;
}

export interface SceneShare {
  userId: string;
  email: string;
  name: string;
  role: "viewer" | "editor";
}

export interface SceneDetail {
  _id: string;
  title: string;
  elements: readonly unknown[];
  appState: Record<string, unknown>;
  updatedAt: string;
  role: Role;
  shares: SceneShare[];
  ownerName?: string;
  lastEditedById: string | null;
  lastEditedByName: string | null;
  lastEditedAt: string | null;
  deletedAt: string | null;
  folderId: string | null;
  tags: string[];
  isStarred: boolean;
}

export interface Folder {
  _id: string;
  name: string;
  sceneCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface TemplateListItem {
  _id: string;
  name: string;
  description: string;
  elementCount: number;
  usageCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface TemplateDetail {
  _id: string;
  name: string;
  description: string;
  elements: readonly unknown[];
  appState: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  disabled: boolean;
  createdAt: string;
  isAdmin: boolean;
  storageQuota?: number;
}

export interface SaveResponse {
  updatedAt: string;
  quotaUsage?: QuotaUsage;
}

export interface VersionListItem {
  _id: string;
  createdAt: string;
  createdByName: string;
}

export interface VersionDetail {
  elements: readonly unknown[];
  appState: Record<string, unknown>;
  createdAt: string;
}

export interface CreateSceneBody {
  title: string;
}

export interface ImportSceneBody {
  title: string;
  elements?: readonly unknown[];
  appState?: Record<string, unknown>;
}

export interface LibraryListItem {
  _id: string;
  name: string;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface LibraryDetail extends LibraryListItem {
  libraryItems: unknown[];
}

export interface UploadLibraryBody {
  name: string;
  libraryItems: unknown[];
}

export interface SavePayload {
  elements: readonly unknown[];
  appState: Record<string, unknown>;
}

export interface UserSearchResult {
  id: string;
  email: string;
  name: string;
}

export type BulkResult = {
  ok: string[];
  failed: { id: string; error: string }[];
};

export interface QuotaUsage {
  used: number;
  limit: number;
  over: boolean;
}

export interface UserStats {
  sceneCount: number;
  totalElements: number;
  totalBytes: number;
  drawingStreak?: number;
  longestStreak?: number;
  largestScene: { id: string; title: string; size: number } | null;
  oldestScene: { id: string; title: string; createdAt: string } | null;
  newestScene: { id: string; title: string; createdAt: string } | null;
  quotaUsage: QuotaUsage;
  topWords?: string[];
  pet?: PetState;
}

// ─── Leaderboard ────────────────────────────────────────────────────────

export interface LeaderboardEntry {
  userId: string;
  name: string;
  editCount: number;
  rank: number;
}

export interface HonoraryAward {
  awardType: string;
  label: string;
  description: string;
  userId: string;
  name: string;
  value: number;
}

export interface WeeklyLeaderboard {
  weekStart: string;
  weekEnd: string;
  topEditors: LeaderboardEntry[];
  honorary: HonoraryAward[];
}

// ─── Profile Badges ─────────────────────────────────────────────────────

export interface ProfileBadge {
  awardType: string;
  weekStart: string;
  rank: number | null;
  value: number;
}

export interface UserProfile {
  user: { id: string; name: string; createdAt: string };
  awards: ProfileBadge[];
  streak: number;
  pet?: {
    mood: PetMood;
    speech: string;
    name: string | null;
  };
}

// ─── Tamagotchi Pet ──────────────────────────────────────────────────────

export type PetMood = 'ECSTATIC' | 'HAPPY' | 'CONTENT' | 'HUNGRY' | 'SLEEPY' | 'SICK' | 'GHOST';

export interface PetState {
  mood: PetMood;
  speech: string;
  name: string | null;
  lastActivityAt: string | null;
  lastActions: {
    feed: string | null;
    bathe: string | null;
    pet: string | null;
  } | null;
}

// ─── Achievement Badges ─────────────────────────────────────────────────

export interface AchievementBadge {
  id: string;
  name: string;
  description: string;
  earned: boolean;
  earnedAt?: string;
}

// ─── Brainstorm ─────────────────────────────────────────────────────────

export interface BrainstormReaction {
  emoji: string;
  count: number;
  hasReacted: boolean;
}

export interface BrainstormIdeaItem {
  _id: string;
  title: string;
  description: string;
  authorId: string;
  authorName: string;
  category: "feature" | "bug" | "fun" | "improvement";
  voteCount: number;
  hasVoted: boolean;
  reactions: BrainstormReaction[];
  createdAt: string;
}

// ─── Activity Log ───────────────────────────────────────────────────────

export interface ActivityLogItem {
  _id: string;
  sceneId: string;
  userId: string;
  userName: string;
  action: string;
  detail?: string;
  createdAt: string;
}

export interface AdminStats {
  sceneCount: number;
  trashedSceneCount: number;
  userCount: number;
  versionCount: number;
  totalBytes: number;
  sceneBytes: number;
  versionBytes: number;
  largestScene: {
    id: string;
    title: string;
    size: number;
    ownerName: string;
  } | null;
  storageHealth: "ok" | "warning" | "critical";
  perUser: Array<{
    userId: string;
    email: string;
    name: string;
    sceneCount: number;
    totalBytes: number;
    quotaLimit: number;
    percentUsed: number;
  }>;
}
