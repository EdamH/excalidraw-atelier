import type {
  AchievementBadge,
  ActivityLogItem,
  AdminStats,
  AdminUser,
  BrainstormIdeaItem,
  BulkResult,
  CreateSceneBody,
  Folder,
  ImportSceneBody,
  LibraryDetail,
  LibraryListItem,
  LoginResponse,
  SaveResponse,
  SavePayload,
  SceneDetail,
  SceneListItem,
  SceneShare,
  TemplateDetail,
  TemplateListItem,
  UploadLibraryBody,
  User,
  UserProfile,
  UserSearchResult,
  UserStats,
  VersionDetail,
  VersionListItem,
  WeeklyLeaderboard,
} from "./types";

const BASE = import.meta.env.VITE_API_URL ?? "";

// ─── Scene prefetch cache ─────────────────────────────────────────────────
const scenePrefetchCache = new Map<string, { data: SceneDetail; ts: number }>();
const PREFETCH_TTL = 30_000; // 30s

export function prefetchScene(id: string, token: string): void {
  if (scenePrefetchCache.has(id)) return;
  getScene(id, token).then((data) => {
    scenePrefetchCache.set(id, { data, ts: Date.now() });
  }).catch(() => { /* prefetch is best-effort */ });
}

export function consumePrefetchedScene(id: string): SceneDetail | null {
  const entry = scenePrefetchCache.get(id);
  if (!entry) return null;
  scenePrefetchCache.delete(id);
  if (Date.now() - entry.ts > PREFETCH_TTL) return null;
  return entry.data;
}

// ─── Scene list stale-while-revalidate cache ──────────────────────────────
let sceneListCache: { data: SceneListItem[]; key: string; ts: number } | null = null;

export function getCachedSceneList(key: string): SceneListItem[] | null {
  if (!sceneListCache) return null;
  if (sceneListCache.key !== key) return null;
  // Allow stale data up to 5 minutes
  if (Date.now() - sceneListCache.ts > 300_000) return null;
  return sceneListCache.data;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

interface FetchOpts {
  method?: string;
  body?: unknown;
}

export async function apiFetch<T>(
  path: string,
  opts: FetchOpts = {},
  token?: string | null,
): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${BASE}/api${path}`, {
      method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch (e) {
    throw new ApiError(0, (e as Error).message || "Network error");
  }

  if (res.status === 204 || res.status === 304) return undefined as T;

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const msg =
      (data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : null) ||
      (typeof data === "string" ? data : null) ||
      `Request failed (${res.status})`;
    if (res.status === 401) {
      // Broadcast so the auth context can tear down session state.
      // Dispatched before the throw so listeners see the signal even if
      // the caller swallows the error.
      try {
        window.dispatchEvent(new Event("auth:unauthorized"));
      } catch {
        // window may be unavailable in non-browser contexts; safe to ignore.
      }
    }
    throw new ApiError(res.status, msg);
  }

  return data as T;
}

export function login(email: string, password: string): Promise<LoginResponse> {
  return apiFetch<LoginResponse>("/auth/login", { body: { email, password } });
}

export async function getMe(token: string): Promise<User> {
  const res = await apiFetch<{ user: User }>("/me", {}, token);
  return res.user;
}

export interface ListScenesOpts {
  trash?: boolean;
  folder?: string | "unfiled";
  tag?: string;
  starred?: boolean;
}

export async function listScenes(
  token: string,
  opts: ListScenesOpts = {},
): Promise<SceneListItem[]> {
  const params = new URLSearchParams();
  if (opts.trash) params.set("trash", "1");
  if (opts.folder) params.set("folder", opts.folder);
  if (opts.tag) params.set("tag", opts.tag);
  if (opts.starred) params.set("starred", "1");
  const qs = params.toString();
  const cacheKey = qs || "__all__";
  const result = await apiFetch<SceneListItem[]>(
    `/scenes${qs ? `?${qs}` : ""}`,
    {},
    token,
  );
  // Guard against 304 returning undefined — keep existing cache
  if (result) {
    sceneListCache = { data: result, key: cacheKey, ts: Date.now() };
  }
  return result ?? sceneListCache?.data ?? [];
}

export function createScene(
  body: CreateSceneBody,
  token: string,
): Promise<SceneListItem> {
  return apiFetch<SceneListItem>("/scenes", { body }, token);
}

export function getScene(id: string, token: string): Promise<SceneDetail> {
  return apiFetch<SceneDetail>(`/scenes/${encodeURIComponent(id)}`, {}, token);
}

export function saveScene(
  id: string,
  payload: SavePayload,
  token: string,
): Promise<SaveResponse> {
  return apiFetch<SaveResponse>(
    `/scenes/${encodeURIComponent(id)}`,
    { method: "PUT", body: payload },
    token,
  );
}

export function renameScene(
  id: string,
  title: string,
  token: string,
): Promise<SceneListItem> {
  return apiFetch<SceneListItem>(
    `/scenes/${encodeURIComponent(id)}`,
    { method: "PATCH", body: { title } },
    token,
  );
}

export function copyScene(
  sourceId: string,
  body: { title?: string },
  token: string,
): Promise<SceneDetail> {
  return apiFetch<SceneDetail>(
    `/scenes/${encodeURIComponent(sourceId)}/copy`,
    { body },
    token,
  );
}

export function deleteScene(id: string, token: string): Promise<void> {
  return apiFetch<void>(
    `/scenes/${encodeURIComponent(id)}`,
    { method: "DELETE" },
    token,
  );
}

export function hardDeleteScene(id: string, token: string): Promise<void> {
  return apiFetch<void>(
    `/scenes/${encodeURIComponent(id)}?hard=1`,
    { method: "DELETE" },
    token,
  );
}

export function restoreScene(
  id: string,
  token: string,
): Promise<SceneDetail> {
  return apiFetch<SceneDetail>(
    `/scenes/${encodeURIComponent(id)}/restore`,
    { method: "POST", body: {} },
    token,
  );
}

export function transferOwnership(
  id: string,
  email: string,
  token: string,
): Promise<SceneDetail> {
  return apiFetch<SceneDetail>(
    `/scenes/${encodeURIComponent(id)}/transfer`,
    { body: { email } },
    token,
  );
}

export function listVersions(
  id: string,
  token: string,
): Promise<VersionListItem[]> {
  return apiFetch<VersionListItem[]>(
    `/scenes/${encodeURIComponent(id)}/versions`,
    {},
    token,
  );
}

export function getVersion(
  id: string,
  versionId: string,
  token: string,
): Promise<VersionDetail> {
  return apiFetch<VersionDetail>(
    `/scenes/${encodeURIComponent(id)}/versions/${encodeURIComponent(versionId)}`,
    {},
    token,
  );
}

export function addShare(
  id: string,
  email: string,
  role: "viewer" | "editor",
  token: string,
): Promise<SceneShare> {
  return apiFetch<SceneShare>(
    `/scenes/${encodeURIComponent(id)}/shares`,
    { body: { email, role } },
    token,
  );
}

export function importScene(
  body: ImportSceneBody,
  token: string,
): Promise<SceneListItem> {
  return apiFetch<SceneListItem>("/scenes/import", { body }, token);
}

export function listLibraries(token: string): Promise<LibraryListItem[]> {
  return apiFetch<LibraryListItem[]>("/libraries", {}, token);
}

export function getLibrary(
  id: string,
  token: string,
): Promise<LibraryDetail> {
  return apiFetch<LibraryDetail>(
    `/libraries/${encodeURIComponent(id)}`,
    {},
    token,
  );
}

export function uploadLibrary(
  body: UploadLibraryBody,
  token: string,
): Promise<LibraryListItem> {
  return apiFetch<LibraryListItem>("/libraries", { body }, token);
}

export function renameLibrary(
  id: string,
  name: string,
  token: string,
): Promise<LibraryListItem> {
  return apiFetch<LibraryListItem>(
    `/libraries/${encodeURIComponent(id)}`,
    { method: "PATCH", body: { name } },
    token,
  );
}

export function searchUsers(
  q: string,
  excludeIds: readonly string[],
  token: string,
): Promise<UserSearchResult[]> {
  const params = new URLSearchParams({ q });
  if (excludeIds.length > 0) params.set("exclude", excludeIds.join(","));
  return apiFetch<UserSearchResult[]>(
    `/users/search?${params.toString()}`,
    {},
    token,
  );
}

export function deleteLibrary(id: string, token: string): Promise<void> {
  return apiFetch<void>(
    `/libraries/${encodeURIComponent(id)}`,
    { method: "DELETE" },
    token,
  );
}

export function removeShare(
  id: string,
  userId: string,
  token: string,
): Promise<void> {
  return apiFetch<void>(
    `/scenes/${encodeURIComponent(id)}/shares/${encodeURIComponent(userId)}`,
    { method: "DELETE" },
    token,
  );
}

// ─── Bulk scene operations ─────────────────────────────────────────────────

export function bulkDeleteScenes(
  ids: string[],
  token: string,
): Promise<BulkResult> {
  return apiFetch<BulkResult>(
    "/scenes/bulk/delete",
    { body: { ids } },
    token,
  );
}

export function bulkRestoreScenes(
  ids: string[],
  token: string,
): Promise<BulkResult> {
  return apiFetch<BulkResult>(
    "/scenes/bulk/restore",
    { body: { ids } },
    token,
  );
}

export function bulkHardDeleteScenes(
  ids: string[],
  token: string,
): Promise<BulkResult> {
  return apiFetch<BulkResult>(
    "/scenes/bulk/hard-delete",
    { body: { ids } },
    token,
  );
}

export function bulkMoveScenes(
  ids: string[],
  folderId: string | null,
  token: string,
): Promise<BulkResult> {
  return apiFetch<BulkResult>(
    "/scenes/bulk/move",
    { body: { ids, folderId } },
    token,
  );
}

export function bulkTagScenes(
  ids: string[],
  patch: { add?: string[]; remove?: string[] },
  token: string,
): Promise<BulkResult> {
  return apiFetch<BulkResult>(
    "/scenes/bulk/tags",
    { body: { ids, ...patch } },
    token,
  );
}

export function bulkShareScenes(
  ids: string[],
  email: string,
  role: "viewer" | "editor",
  token: string,
): Promise<BulkResult> {
  return apiFetch<BulkResult>(
    "/scenes/bulk/share",
    { body: { ids, email, role } },
    token,
  );
}

export function bulkUnshareScenes(
  ids: string[],
  userId: string,
  token: string,
): Promise<BulkResult> {
  return apiFetch<BulkResult>(
    "/scenes/bulk/unshare",
    { body: { ids, userId } },
    token,
  );
}

// ─── Folders ───────────────────────────────────────────────────────────────

export function listFolders(token: string): Promise<Folder[]> {
  return apiFetch<Folder[]>("/folders", {}, token);
}

export function createFolder(name: string, token: string): Promise<Folder> {
  return apiFetch<Folder>("/folders", { body: { name } }, token);
}

export function renameFolder(
  id: string,
  name: string,
  token: string,
): Promise<Folder> {
  return apiFetch<Folder>(
    `/folders/${encodeURIComponent(id)}`,
    { method: "PATCH", body: { name } },
    token,
  );
}

export function deleteFolder(id: string, token: string): Promise<void> {
  return apiFetch<void>(
    `/folders/${encodeURIComponent(id)}`,
    { method: "DELETE" },
    token,
  );
}

// ─── Tags ──────────────────────────────────────────────────────────────────

export function listTags(token: string): Promise<string[]> {
  return apiFetch<string[]>("/tags", {}, token);
}

export function setSceneTags(
  id: string,
  tags: string[],
  token: string,
): Promise<SceneListItem> {
  return apiFetch<SceneListItem>(
    `/scenes/${encodeURIComponent(id)}`,
    { method: "PATCH", body: { tags } },
    token,
  );
}

export function setSceneFolder(
  id: string,
  folderId: string | null,
  token: string,
): Promise<SceneListItem> {
  return apiFetch<SceneListItem>(
    `/scenes/${encodeURIComponent(id)}`,
    { method: "PATCH", body: { folderId } },
    token,
  );
}

// ─── Stars ─────────────────────────────────────────────────────────────────

export function starScene(
  id: string,
  token: string,
): Promise<{ starred: true }> {
  return apiFetch<{ starred: true }>(
    `/scenes/${encodeURIComponent(id)}/star`,
    { method: "POST", body: {} },
    token,
  );
}

export function unstarScene(
  id: string,
  token: string,
): Promise<{ starred: false }> {
  return apiFetch<{ starred: false }>(
    `/scenes/${encodeURIComponent(id)}/star`,
    { method: "DELETE" },
    token,
  );
}

// ─── Admin users ───────────────────────────────────────────────────────────

export function listAdminUsers(token: string): Promise<AdminUser[]> {
  return apiFetch<AdminUser[]>("/admin/users", {}, token);
}

export function createAdminUser(
  body: { email: string; password: string; name: string },
  token: string,
): Promise<AdminUser> {
  return apiFetch<AdminUser>("/admin/users", { body }, token);
}

export function updateAdminUser(
  id: string,
  patch: { name?: string; password?: string; disabled?: boolean },
  token: string,
): Promise<AdminUser> {
  return apiFetch<AdminUser>(
    `/admin/users/${encodeURIComponent(id)}`,
    { method: "PATCH", body: patch },
    token,
  );
}

export function deleteAdminUser(id: string, token: string): Promise<void> {
  return apiFetch<void>(
    `/admin/users/${encodeURIComponent(id)}`,
    { method: "DELETE" },
    token,
  );
}

// ─── Templates ─────────────────────────────────────────────────────────────

export function listTemplates(token: string): Promise<TemplateListItem[]> {
  return apiFetch<TemplateListItem[]>("/templates", {}, token);
}

export function getTemplate(
  id: string,
  token: string,
): Promise<TemplateDetail> {
  return apiFetch<TemplateDetail>(
    `/templates/${encodeURIComponent(id)}`,
    {},
    token,
  );
}

export function createTemplate(
  body: {
    name: string;
    description: string;
    elements: readonly unknown[];
    appState: Record<string, unknown>;
  },
  token: string,
): Promise<TemplateDetail> {
  return apiFetch<TemplateDetail>("/templates", { body }, token);
}

export function updateTemplate(
  id: string,
  patch: {
    name?: string;
    description?: string;
    elements?: readonly unknown[];
    appState?: Record<string, unknown>;
  },
  token: string,
): Promise<TemplateDetail> {
  return apiFetch<TemplateDetail>(
    `/templates/${encodeURIComponent(id)}`,
    { method: "PATCH", body: patch },
    token,
  );
}

export function trackTemplateUsage(id: string, token: string): Promise<void> {
  return apiFetch<void>(
    `/templates/${encodeURIComponent(id)}/use`,
    { method: "POST", body: {} },
    token,
  );
}

export function deleteTemplate(id: string, token: string): Promise<void> {
  return apiFetch<void>(
    `/templates/${encodeURIComponent(id)}`,
    { method: "DELETE" },
    token,
  );
}

// ─── Stats ─────────────────────────────────────────────────────────────────

export function getMyStats(token: string): Promise<UserStats> {
  return apiFetch<UserStats>("/users/me/stats", {}, token);
}

export function getAdminStats(token: string): Promise<AdminStats> {
  return apiFetch<AdminStats>("/admin/stats", {}, token);
}

export function getAdminScenes(token: string): Promise<SceneListItem[]> {
  return apiFetch<SceneListItem[]>("/admin/scenes", {}, token);
}

export function updateUserQuota(
  userId: string,
  storageQuota: number,
  token: string,
): Promise<AdminUser> {
  return apiFetch<AdminUser>(
    `/admin/users/${encodeURIComponent(userId)}/quota`,
    { method: "PATCH", body: { storageQuota } },
    token,
  );
}

// ─── Random Scene ─────────────────────────────────────────────────────────

export function getRandomScene(token: string): Promise<{ sceneId: string | null }> {
  return apiFetch<{ sceneId: string | null }>("/scenes/random", {}, token);
}

// ─── Activity Log ─────────────────────────────────────────────────────────

export function getSceneActivity(
  sceneId: string,
  token: string,
  before?: string,
): Promise<{ items: ActivityLogItem[]; hasMore: boolean }> {
  const params = new URLSearchParams();
  if (before) params.set("before", before);
  const qs = params.toString();
  return apiFetch<{ items: ActivityLogItem[]; hasMore: boolean }>(
    `/scenes/${encodeURIComponent(sceneId)}/activity${qs ? `?${qs}` : ""}`,
    {},
    token,
  );
}

// ─── Leaderboard ──────────────────────────────────────────────────────────

export function getWeeklyLeaderboard(token: string): Promise<WeeklyLeaderboard> {
  return apiFetch<WeeklyLeaderboard>("/leaderboard/weekly", {}, token);
}

export function getUserProfile(userId: string, token: string): Promise<UserProfile> {
  return apiFetch<UserProfile>(`/profile/${encodeURIComponent(userId)}/badges`, {}, token);
}

// ─── Badges ──────────────────────────────────────────────────────────────

export function getMyBadges(token: string): Promise<AchievementBadge[]> {
  return apiFetch<AchievementBadge[]>("/users/me/badges", {}, token);
}

// ─── Tamagotchi Pet ──────────────────────────────────────────────────────

export function updatePetName(
  token: string,
  name: string | null
): Promise<{ petName: string | null }> {
  return apiFetch<{ petName: string | null }>("/users/me/pet", {
    method: "PATCH",
    body: { name },
  }, token);
}

export function interactWithPet(
  token: string,
  action: "feed" | "bathe" | "pet"
): Promise<{ action: string; performedAt: string }> {
  return apiFetch<{ action: string; performedAt: string }>("/users/me/pet/interact", {
    method: "POST",
    body: { action },
  }, token);
}

// ─── Brainstorm ──────────────────────────────────────────────────────────

export function listBrainstormIdeas(
  token: string,
  category?: string,
): Promise<BrainstormIdeaItem[]> {
  const params = category ? `?category=${encodeURIComponent(category)}` : "";
  return apiFetch<BrainstormIdeaItem[]>(`/brainstorm${params}`, {}, token);
}

export function createBrainstormIdea(
  body: { title: string; description?: string; category?: string },
  token: string,
): Promise<BrainstormIdeaItem> {
  return apiFetch<BrainstormIdeaItem>("/brainstorm", { body }, token);
}

export function voteBrainstormIdea(
  id: string,
  token: string,
): Promise<{ voteCount: number; hasVoted: boolean }> {
  return apiFetch<{ voteCount: number; hasVoted: boolean }>(
    `/brainstorm/${encodeURIComponent(id)}/vote`,
    { method: "PATCH", body: {} },
    token,
  );
}

export function reactBrainstormIdea(
  id: string,
  emoji: string,
  token: string,
): Promise<{ toggled: boolean }> {
  return apiFetch<{ toggled: boolean }>(
    `/brainstorm/${encodeURIComponent(id)}/react`,
    { method: "PATCH", body: { emoji } },
    token,
  );
}

export function deleteBrainstormIdea(id: string, token: string): Promise<void> {
  return apiFetch<void>(
    `/brainstorm/${encodeURIComponent(id)}`,
    { method: "DELETE" },
    token,
  );
}

// ─── Password ──────────────────────────────────────────────────────────────

export function changePassword(
  currentPassword: string,
  newPassword: string,
  token: string,
): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(
    "/auth/change-password",
    { body: { currentPassword, newPassword } },
    token,
  );
}
