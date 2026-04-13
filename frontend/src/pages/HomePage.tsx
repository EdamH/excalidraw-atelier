import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  Cake,
  Flame,
  FolderPlus,
  LayoutTemplate,
  Lightbulb,
  Pencil,
  Search,
  Settings,
  Star,
  Tag,
  Trash2,
  Trophy,
  Upload,
} from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import {
  ApiError,
  bulkDeleteScenes,
  bulkHardDeleteScenes,
  bulkMoveScenes,
  bulkRestoreScenes,
  bulkShareScenes,
  bulkTagScenes,
  createFolder,
  createScene,
  deleteFolder,
  deleteScene,
  getMyStats,
  getRandomScene,
  getScene,
  hardDeleteScene,
  importScene,
  listFolders,
  listScenes,
  listTags,
  renameFolder,
  renameScene,
  restoreScene,
  setSceneFolder,
  starScene,
  unstarScene,
  type ListScenesOpts,
  getCachedSceneList,
  prefetchScene,
} from "../lib/api";
import type {
  BulkResult,
  Folder,
  SceneDetail,
  SceneListItem,
  UserStats,
} from "../lib/types";
import { DuplicateDialog } from "../components/DuplicateDialog";
import { ShareDialog } from "../components/ShareDialog";
import { TemplatesDialog } from "../components/TemplatesDialog";
import { QuotaBar } from "../components/QuotaBar";
import { StatsDashboard } from "../components/StatsDashboard";
import { ChangePasswordDialog } from "../components/ChangePasswordDialog";
import { Button } from "../components/ui/Button";
import { CardCornerBrackets } from "../components/ui/Card";
import { Alert } from "../components/ui/Alert";
import { RoleBadge } from "../components/ui/Badge";
import { Modal } from "../components/ui/Modal";
import { ConfirmModal } from "../components/ui/ConfirmModal";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { Spinner } from "../components/ui/Spinner";
import { IconButton } from "../components/ui/IconButton";
import { InlineRename } from "../components/ui/InlineRename";
import { BrandMark } from "../components/BrandMark";
import { formatRelativeTime } from "../lib/relativeTime";
import { FOCUS_HOME_SEARCH_EVENT } from "../lib/useKeyboardShortcuts";
import { cn } from "../lib/cn";

function slugify(title: string, id: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 28);
  const tail = id.slice(-4);
  return base ? `${base}-${tail}` : tail;
}

function isSceneBirthday(createdAt: string | undefined | null): boolean {
  if (!createdAt) return false;
  const created = new Date(createdAt);
  const now = new Date();
  const sameDay =
    created.getMonth() === now.getMonth() &&
    created.getDate() === now.getDate();
  const differentYear = created.getFullYear() !== now.getFullYear();
  return sameDay && differentYear;
}

const EDITORIAL_GREETINGS = [
  "Your documents.",
  "Today's edition.",
  "The morning sketch.",
  "All the diagrams fit to print.",
  "Fresh off the press.",
  "The daily dispatch.",
  "Your atelier awaits.",
  "Ink & intention.",
  "The sketch report.",
];

function getEditorialGreeting(): string {
  const day = new Date().getDate();
  return EDITORIAL_GREETINGS[day % EDITORIAL_GREETINGS.length];
}

type SortKey = "updated" | "lastEdited" | "titleAsc" | "titleDesc";
type ConfirmTarget =
  | { kind: "delete-scene"; scene: SceneListItem }
  | { kind: "hard-delete-scene"; scene: SceneListItem }
  | { kind: "delete-folder"; folder: Folder };
type Selection =
  | { kind: "all" }
  | { kind: "starred" }
  | { kind: "unfiled" }
  | { kind: "folder"; id: string }
  | { kind: "trash" };

export function HomePage() {
  const { token, user, logout } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const [scenes, setScenes] = useState<SceneListItem[] | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [renameFolderTarget, setRenameFolderTarget] = useState<Folder | null>(
    null,
  );
  const [duplicateTarget, setDuplicateTarget] = useState<SceneListItem | null>(
    null,
  );
  const [moveTarget, setMoveTarget] = useState<SceneListItem | null>(null);
  const [shareScene, setShareScene] = useState<SceneDetail | null>(null);
  const [loadingShareId, setLoadingShareId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{
    id: string;
    message: string;
  } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget | null>(
    null,
  );

  const [selection, setSelection] = useState<Selection>({ kind: "all" });
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("updated");

  const [openTagsId, setOpenTagsId] = useState<string | null>(null);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const lastToggledIdRef = useRef<string | null>(null);
  const [bulkMoveOpen, setBulkMoveOpen] = useState(false);
  const [bulkTagOpen, setBulkTagOpen] = useState(false);
  const [bulkShareOpen, setBulkShareOpen] = useState(false);
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
  const [bulkHardDeleteConfirmOpen, setBulkHardDeleteConfirmOpen] =
    useState(false);
  const [bulkNotice, setBulkNotice] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  // User stats + menu + dialogs
  const [stats, setStats] = useState<UserStats | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [statsDashboardOpen, setStatsDashboardOpen] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [randomLoading, setRandomLoading] = useState(false);

  const isTrash = selection.kind === "trash";

  const loadStats = useCallback(async () => {
    if (!token) return;
    try {
      const res = await getMyStats(token);
      setStats(res);
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
      }
    }
  }, [token, logout]);

  const loadScenes = useCallback(async () => {
    if (!token) return;
    try {
      const opts: ListScenesOpts = {};
      if (selection.kind === "trash") opts.trash = true;
      else if (selection.kind === "starred") opts.starred = true;
      else if (selection.kind === "unfiled") opts.folder = "unfiled";
      else if (selection.kind === "folder") opts.folder = selection.id;
      if (selectedTag && selection.kind !== "trash") opts.tag = selectedTag;
      // Show cached data immediately if available (stale-while-revalidate)
      const params = new URLSearchParams();
      if (opts.trash) params.set("trash", "1");
      if (opts.folder) params.set("folder", opts.folder!);
      if (opts.tag) params.set("tag", opts.tag);
      if (opts.starred) params.set("starred", "1");
      const cacheKey = params.toString() || "__all__";
      const cached = getCachedSceneList(cacheKey);
      if (cached) setScenes(cached);
      const list = await listScenes(token, opts);
      setScenes(list);
      setError(null);
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to load");
    }
  }, [token, logout, selection, selectedTag]);

  const loadFolders = useCallback(async () => {
    if (!token) return;
    try {
      const list = await listFolders(token);
      setFolders(list);
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
      }
    }
  }, [token, logout]);

  const loadTags = useCallback(async () => {
    if (!token) return;
    try {
      const list = await listTags(token);
      setTags(list);
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
      }
    }
  }, [token, logout]);

  useEffect(() => {
    void loadScenes();
  }, [loadScenes]);

  // Clear bulk selection whenever the nav view or tag filter changes.
  useEffect(() => {
    setSelectedIds(new Set());
    lastToggledIdRef.current = null;
    setBulkNotice(null);
  }, [selection, selectedTag]);

  // Close the tags popover on any outside click or Escape.
  useEffect(() => {
    if (!openTagsId) return;
    const onDocDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("[data-tags-popover]")) return;
      setOpenTagsId(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenTagsId(null);
    };
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [openTagsId]);

  const toggleSelect = useCallback(
    (id: string, shiftKey = false, orderedIds: string[] = []) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (
          shiftKey &&
          lastToggledIdRef.current &&
          lastToggledIdRef.current !== id &&
          orderedIds.length > 0
        ) {
          const lastIdx = orderedIds.indexOf(lastToggledIdRef.current);
          const curIdx = orderedIds.indexOf(id);
          if (lastIdx !== -1 && curIdx !== -1) {
            const [from, to] =
              lastIdx < curIdx ? [lastIdx, curIdx] : [curIdx, lastIdx];
            // Range-add (don't toggle off existing ones).
            for (let i = from; i <= to; i += 1) {
              next.add(orderedIds[i]);
            }
            lastToggledIdRef.current = id;
            return next;
          }
        }
        if (next.has(id)) next.delete(id);
        else next.add(id);
        lastToggledIdRef.current = id;
        return next;
      });
    },
    [],
  );

  const selectAll = useCallback((ids: string[]) => {
    setSelectedIds(new Set(ids));
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    lastToggledIdRef.current = null;
  }, []);

  useEffect(() => {
    void loadFolders();
    void loadTags();
    void loadStats();
  }, [loadFolders, loadTags, loadStats]);

  // Close the user menu on outside click or Escape.
  useEffect(() => {
    if (!userMenuOpen) return;
    const onDocDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("[data-user-menu]")) return;
      setUserMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setUserMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [userMenuOpen]);

  // Listen for keyboard-shortcut focus event from anywhere in the app.
  useEffect(() => {
    function onFocusSearch() {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    }
    function onNewDoc() {
      setModalOpen(true);
    }
    function onGotoTrash() {
      setSelection({ kind: "trash" });
      setSelectedTag(null);
    }
    window.addEventListener(FOCUS_HOME_SEARCH_EVENT, onFocusSearch);
    window.addEventListener("home-new-doc", onNewDoc);
    window.addEventListener("home-goto-trash", onGotoTrash);
    return () => {
      window.removeEventListener(FOCUS_HOME_SEARCH_EVENT, onFocusSearch);
      window.removeEventListener("home-new-doc", onNewDoc);
      window.removeEventListener("home-goto-trash", onGotoTrash);
    };
  }, []);

  // DEL / Cmd+Backspace → delete selected cards (opens confirm dialog).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (selectedIds.size === 0) return;
      const target = e.target as HTMLElement;
      const tag = target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) return;

      const isDel = e.key === "Delete";
      const isCmdBack = (e.metaKey || e.ctrlKey) && e.key === "Backspace";
      if (!isDel && !isCmdBack) return;

      e.preventDefault();
      if (isTrash) {
        setBulkHardDeleteConfirmOpen(true);
      } else {
        setBulkDeleteConfirmOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedIds.size, isTrash]);

  function selectNav(next: Selection) {
    setSelection(next);
    setSelectedTag(null);
    setQuery("");
    setSortKey("updated");
    setScenes(null);
    setError(null);
    setRowError(null);
  }

  const filteredScenes = useMemo<SceneListItem[] | null>(() => {
    if (!scenes) return null;
    const q = query.trim().toLowerCase();
    const filtered = q
      ? scenes.filter((s) => s.title.toLowerCase().includes(q))
      : scenes.slice();
    switch (sortKey) {
      case "titleAsc":
        filtered.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case "titleDesc":
        filtered.sort((a, b) => b.title.localeCompare(a.title));
        break;
      case "lastEdited":
        filtered.sort((a, b) => {
          const av = new Date(a.lastEditedAt ?? a.updatedAt).getTime();
          const bv = new Date(b.lastEditedAt ?? b.updatedAt).getTime();
          return bv - av;
        });
        break;
      case "updated":
      default:
        filtered.sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        );
        break;
    }
    return filtered;
  }, [scenes, query, sortKey]);

  // Cmd/Ctrl+A → select all visible scenes.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.key !== "a") return;
      const target = e.target as HTMLElement;
      const tag = target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) return;

      e.preventDefault();
      if (filteredScenes && filteredScenes.length > 0) {
        setSelectedIds(new Set(filteredScenes.map((s) => s._id)));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filteredScenes]);

  async function openShare(scene: SceneListItem) {
    if (!token) return;
    setLoadingShareId(scene._id);
    setRowError(null);
    try {
      const full = await getScene(scene._id, token);
      setShareScene(full);
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
        return;
      }
      setRowError({
        id: scene._id,
        message: err instanceof Error ? err.message : "Failed to load scene",
      });
    } finally {
      setLoadingShareId(null);
    }
  }

  async function handleRename(scene: SceneListItem, next: string) {
    if (!token) return;
    setRowError(null);
    try {
      await renameScene(scene._id, next, token);
      setScenes((prev) =>
        prev
          ? prev.map((s) => (s._id === scene._id ? { ...s, title: next } : s))
          : prev,
      );
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
        return;
      }
      setRowError({
        id: scene._id,
        message: err instanceof Error ? err.message : "Rename failed",
      });
      throw err;
    }
  }

  function handleDelete(scene: SceneListItem) {
    setConfirmTarget({ kind: "delete-scene", scene });
  }

  async function performDeleteScene(scene: SceneListItem) {
    if (!token) return;
    setBusyId(scene._id);
    setRowError(null);
    try {
      await deleteScene(scene._id, token);
      await loadScenes();
      await loadFolders();
      void loadStats();
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
        return;
      }
      setRowError({
        id: scene._id,
        message: err instanceof Error ? err.message : "Delete failed",
      });
    } finally {
      setBusyId(null);
      setConfirmTarget(null);
    }
  }

  async function handleRestore(scene: SceneListItem) {
    if (!token) return;
    setBusyId(scene._id);
    setRowError(null);
    try {
      await restoreScene(scene._id, token);
      await loadScenes();
      await loadFolders();
      void loadStats();
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
        return;
      }
      setRowError({
        id: scene._id,
        message: err instanceof Error ? err.message : "Restore failed",
      });
    } finally {
      setBusyId(null);
    }
  }

  function handleHardDelete(scene: SceneListItem) {
    setConfirmTarget({ kind: "hard-delete-scene", scene });
  }

  async function performHardDelete(scene: SceneListItem) {
    if (!token) return;
    setBusyId(scene._id);
    setRowError(null);
    try {
      await hardDeleteScene(scene._id, token);
      await loadScenes();
      void loadStats();
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
        return;
      }
      setRowError({
        id: scene._id,
        message: err instanceof Error ? err.message : "Delete failed",
      });
    } finally {
      setBusyId(null);
      setConfirmTarget(null);
    }
  }

  async function handleToggleStar(scene: SceneListItem) {
    if (!token) return;
    const next = !scene.isStarred;
    // Optimistic
    setScenes((prev) =>
      prev
        ? prev.map((s) =>
            s._id === scene._id ? { ...s, isStarred: next } : s,
          )
        : prev,
    );
    try {
      if (next) await starScene(scene._id, token);
      else await unstarScene(scene._id, token);
      // If we're in the starred view and just unstarred, drop it from the list.
      if (selection.kind === "starred" && !next) {
        setScenes((prev) =>
          prev ? prev.filter((s) => s._id !== scene._id) : prev,
        );
      }
    } catch (err: unknown) {
      // Roll back
      setScenes((prev) =>
        prev
          ? prev.map((s) =>
              s._id === scene._id ? { ...s, isStarred: !next } : s,
            )
          : prev,
      );
      if (err instanceof ApiError && err.status === 401) logout();
    }
  }

  async function handleMoveScene(
    scene: SceneListItem,
    folderId: string | null,
  ) {
    if (!token) return;
    setBusyId(scene._id);
    setRowError(null);
    try {
      await setSceneFolder(scene._id, folderId, token);
      await loadScenes();
      await loadFolders();
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
        return;
      }
      setRowError({
        id: scene._id,
        message: err instanceof Error ? err.message : "Move failed",
      });
    } finally {
      setBusyId(null);
      setMoveTarget(null);
    }
  }

  async function handleDropScenes(
    sceneIds: string[],
    folderId: string | null,
  ) {
    if (!token || sceneIds.length === 0) return;
    setRowError(null);
    try {
      if (sceneIds.length === 1) {
        await setSceneFolder(sceneIds[0], folderId, token);
      } else {
        await bulkMoveScenes(sceneIds, folderId, token);
      }
      await loadScenes();
      await loadFolders();
      void loadStats();
      setSelectedIds(new Set());
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
        return;
      }
      console.error("Drop move failed:", err);
    }
  }

  function handleDeleteFolder(folder: Folder) {
    setConfirmTarget({ kind: "delete-folder", folder });
  }

  async function performDeleteFolder(folder: Folder) {
    if (!token) return;
    try {
      await deleteFolder(folder._id, token);
      // If we were viewing it, go back to All.
      if (selection.kind === "folder" && selection.id === folder._id) {
        setSelection({ kind: "all" });
      }
      await loadFolders();
      await loadScenes();
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) logout();
    } finally {
      setConfirmTarget(null);
    }
  }

  async function toggleTag(tag: string) {
    setSelectedTag((prev) => (prev === tag ? null : tag));
  }

  // ─── Bulk action runners ────────────────────────────────────────────────
  async function runBulk(
    op: () => Promise<BulkResult>,
    label: string,
    reloadTags = false,
  ): Promise<void> {
    if (!token) return;
    setBulkBusy(true);
    setBulkNotice(null);
    try {
      const res = await op();
      await loadScenes();
      await loadFolders();
      if (reloadTags) await loadTags();
      void loadStats();
      clearSelection();
      if (res.failed.length > 0) {
        setBulkNotice(
          `${label}: ${res.ok.length} succeeded, ${res.failed.length} failed.`,
        );
      }
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
        return;
      }
      setBulkNotice(
        `${label} failed: ${err instanceof Error ? err.message : "unknown error"}`,
      );
    } finally {
      setBulkBusy(false);
    }
  }

  async function performBulkDelete(): Promise<void> {
    const ids = Array.from(selectedIds);
    setBulkDeleteConfirmOpen(false);
    await runBulk(() => bulkDeleteScenes(ids, token!), "Move to trash");
  }

  async function performBulkRestore(): Promise<void> {
    const ids = Array.from(selectedIds);
    await runBulk(() => bulkRestoreScenes(ids, token!), "Restore");
  }

  async function performBulkHardDelete(): Promise<void> {
    const ids = Array.from(selectedIds);
    setBulkHardDeleteConfirmOpen(false);
    await runBulk(
      () => bulkHardDeleteScenes(ids, token!),
      "Delete forever",
    );
  }

  async function performBulkMove(folderId: string | null): Promise<void> {
    const ids = Array.from(selectedIds);
    setBulkMoveOpen(false);
    await runBulk(() => bulkMoveScenes(ids, folderId, token!), "Move");
  }

  async function performBulkTag(
    add: string[],
    remove: string[],
  ): Promise<void> {
    const ids = Array.from(selectedIds);
    setBulkTagOpen(false);
    await runBulk(
      () => bulkTagScenes(ids, { add, remove }, token!),
      "Tag update",
      true,
    );
  }

  async function performBulkShare(
    email: string,
    role: "viewer" | "editor",
  ): Promise<void> {
    const ids = Array.from(selectedIds);
    setBulkShareOpen(false);
    await runBulk(() => bulkShareScenes(ids, email, role, token!), "Share");
  }

  function openImportPicker() {
    setError(null);
    fileInputRef.current?.click();
  }

  async function handleImportFile(
    e: React.ChangeEvent<HTMLInputElement>,
  ): Promise<void> {
    const input = e.target;
    const file = input.files?.[0];
    input.value = "";
    if (!file || !token) return;
    setImporting(true);
    setError(null);
    try {
      const text = await file.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        setError("// IMPORT ERROR — not a valid .excalidraw file");
        return;
      }
      if (
        !parsed ||
        typeof parsed !== "object" ||
        (parsed as { type?: unknown }).type !== "excalidraw" ||
        !Array.isArray((parsed as { elements?: unknown }).elements)
      ) {
        setError("// IMPORT ERROR — not a valid .excalidraw file");
        return;
      }
      const payload = parsed as {
        elements: readonly unknown[];
        appState?: Record<string, unknown>;
      };
      const title = file.name.replace(/\.excalidraw$/i, "") || "Imported scene";
      const created = await importScene(
        {
          title,
          elements: payload.elements,
          appState: payload.appState,
        },
        token,
      );
      navigate(`/d/${encodeURIComponent(created._id)}`);
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
        return;
      }
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  const totalCount = scenes?.length ?? 0;
  const displayCount = filteredScenes?.length ?? 0;
  const isFiltered = query.trim().length > 0;
  const selectedFolder =
    selection.kind === "folder"
      ? folders.find((f) => f._id === selection.id) ?? null
      : null;

  return (
    <div className="min-h-screen bg-paper">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-ink text-paper border-b border-gold/70">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
          <BrandMark size={24} withSubtitle tone="paper" />
          <div className="flex items-center gap-5">
            {user?.isAdmin && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/admin")}
                className="text-paper/80 hover:bg-paper/10 hover:text-gold"
              >
                <Settings /> Admin
              </Button>
            )}
            {user && (
              <div data-user-menu className="relative">
                <button
                  type="button"
                  onClick={() => setUserMenuOpen((v) => !v)}
                  aria-haspopup="menu"
                  aria-expanded={userMenuOpen}
                  className="flex items-center gap-3 px-2 py-1 text-paper/90 hover:text-gold transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold"
                >
                  <span className="hidden sm:inline font-mono uppercase tracking-[0.16em] text-[9px] text-paper/60">
                    // YOU
                  </span>
                  <span className="font-serif italic text-base max-w-[160px] truncate">
                    {user.name}
                  </span>
                  <span className="flex h-6 w-6 items-center justify-center bg-paper/10 border border-paper/20 text-[11px] font-serif italic text-gold">
                    {user.name.charAt(0).toUpperCase()}
                  </span>
                </button>
                {userMenuOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 top-full mt-2 z-50 min-w-[220px] border border-ink bg-paper-deep text-ink shadow-[6px_6px_0_0_rgba(26,14,46,0.25)]"
                  >
                    <div className="border-b border-rule px-4 py-3">
                      <p className="font-mono uppercase tracking-[0.14em] text-[9px] text-ink-fade">
                        // SIGNED IN AS
                      </p>
                      <p className="mt-1 font-serif italic text-base text-ink truncate">
                        {user.email}
                      </p>
                    </div>
                    <ul>
                      <UserMenuItem
                        label="// MY PROFILE"
                        onClick={() => {
                          setUserMenuOpen(false);
                          navigate(`/profile/${user.id}`);
                        }}
                      />
                      <UserMenuItem
                        label="// MY STATS"
                        onClick={() => {
                          setUserMenuOpen(false);
                          setStatsDashboardOpen(true);
                        }}
                      />
                      <UserMenuItem
                        label="// CHANGE PASSWORD"
                        onClick={() => {
                          setUserMenuOpen(false);
                          setChangePasswordOpen(true);
                        }}
                      />
                      <li>
                        <div className="h-px bg-rule" />
                      </li>
                      <UserMenuItem
                        label="// LOG OUT"
                        tone="destructive"
                        onClick={() => {
                          setUserMenuOpen(false);
                          logout();
                        }}
                      />
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 sm:px-8">
        {/* Masthead */}
        <section className="pt-14 pb-10 opacity-0 animate-ink-bleed">
          <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
            <div className="flex-1 min-w-0">
              <p className="mb-4 font-mono uppercase tracking-[0.22em] text-[10px] text-ink-fade">
                // THE COLLECTION
              </p>
              <h1 className="font-serif italic text-5xl sm:text-6xl text-ink tracking-tight leading-[0.95]">
                {selectedFolder ? selectedFolder.name : getEditorialGreeting()}
              </h1>
            </div>
            <div className="flex flex-col items-start md:items-end gap-3 shrink-0">
              <span className="font-mono uppercase tracking-[0.18em] text-[10px] text-ink-fade">
                // {String(displayCount).padStart(2, "0")} ITEM
                {displayCount === 1 ? "" : "S"}
                {isFiltered && (
                  <span className="text-ink-fade/70">
                    {" "}
                    // showing {displayCount} of {totalCount}
                  </span>
                )}
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  onClick={openImportPicker}
                  disabled={importing}
                >
                  {importing ? (
                    <>
                      <Spinner /> Importing
                    </>
                  ) : (
                    <>
                      <Upload /> Import
                    </>
                  )}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setTemplatesOpen(true)}
                >
                  <LayoutTemplate /> From template
                </Button>
                <Button
                  variant="ghost"
                  disabled={randomLoading}
                  onClick={async () => {
                    if (!token || randomLoading) return;
                    setRandomLoading(true);
                    try {
                      const result = await getRandomScene(token);
                      if (result.sceneId) {
                        navigate(`/d/${result.sceneId}`);
                      }
                    } catch {
                      setError("Failed to load a random scene.");
                    } finally {
                      setRandomLoading(false);
                    }
                  }}
                >
                  {randomLoading ? "Loading..." : "I'm feeling lucky"}
                </Button>
                <Button onClick={() => setModalOpen(true)}>
                  New Document &rarr;
                </Button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".excalidraw,application/json"
                className="hidden"
                onChange={(e) => void handleImportFile(e)}
              />
            </div>
          </div>

          {stats && (
            <div className="mt-8 max-w-md">
              <QuotaBar
                usage={stats.quotaUsage}
                onClick={() => setStatsDashboardOpen(true)}
              />
            </div>
          )}

          <div className="mt-8 flex items-center gap-3">
            <span
              aria-hidden="true"
              className="inline-block h-1.5 w-1.5 bg-gold shrink-0"
            />
            <div className="h-px flex-1 bg-rule" />
          </div>
        </section>

        {/* Sidebar + content */}
        <div className="flex flex-col lg:flex-row gap-8 pb-20">
          {/* Sidebar (lg+) */}
          <aside className="hidden lg:block w-[220px] shrink-0">
            <Sidebar
              folders={folders}
              selection={selection}
              onSelect={selectNav}
              onNewFolder={() => setNewFolderOpen(true)}
              onRenameFolder={(f) => setRenameFolderTarget(f)}
              onDeleteFolder={(f) => void handleDeleteFolder(f)}
              onDropScenes={handleDropScenes}
            />
          </aside>

          {/* Mobile chip bar */}
          <div className="lg:hidden -mx-5 sm:-mx-8 px-5 sm:px-8 overflow-x-auto pb-2">
            <NavChipBar
              folders={folders}
              selection={selection}
              onSelect={selectNav}
              onNewFolder={() => setNewFolderOpen(true)}
            />
          </div>

          <div className="flex-1 min-w-0">
            {/* Search + sort row */}
            <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex-1 max-w-lg">
                <label
                  htmlFor="scene-search"
                  className="mb-1 block font-mono uppercase tracking-[0.16em] text-[10px] text-ink-fade"
                >
                  // FILTER
                </label>
                <div className="relative">
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 text-ink-fade [&_svg]:size-3.5"
                  >
                    <Search />
                  </span>
                  <input
                    ref={searchInputRef}
                    id="scene-search"
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={
                      isTrash ? "Search trash…" : "Search documents…"
                    }
                    className="flex h-10 w-full rounded-none border-0 border-b border-rule bg-transparent pl-6 pr-0 text-base text-ink placeholder:italic placeholder:font-serif placeholder:text-ink-fade/60 focus:border-b-2 focus:border-ink focus:outline-none focus:ring-0"
                  />
                </div>
              </div>
              <div className="flex items-end gap-3">
                <div>
                  <label
                    htmlFor="scene-sort"
                    className="mb-1 block font-mono uppercase tracking-[0.16em] text-[10px] text-ink-fade"
                  >
                    // SORT
                  </label>
                  <Select
                    id="scene-sort"
                    value={sortKey}
                    onChange={(e) => setSortKey(e.target.value as SortKey)}
                    className="w-[180px]"
                  >
                    <option value="updated">Recently updated</option>
                    <option value="lastEdited">Last edited</option>
                    <option value="titleAsc">Title A → Z</option>
                    <option value="titleDesc">Title Z → A</option>
                  </Select>
                </div>
              </div>
            </div>

            {/* Tag chips */}
            {!isTrash && tags.length > 0 && (
              <div className="mb-6 -mx-1 flex items-center gap-2 overflow-x-auto pb-1 pl-1">
                <span className="font-mono uppercase tracking-[0.18em] text-[9px] text-ink-fade shrink-0 pr-2">
                  // TAGS
                </span>
                {tags.map((t) => {
                  const active = selectedTag === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => void toggleTag(t)}
                      className={cn(
                        "shrink-0 border px-2 py-1 font-mono uppercase tracking-[0.12em] text-[9px] transition-colors",
                        active
                          ? "bg-ink text-paper border-ink"
                          : "border-rule text-ink-soft hover:text-ink hover:border-ink/40",
                      )}
                    >
                      {t}
                    </button>
                  );
                })}
                {selectedTag && (
                  <button
                    type="button"
                    onClick={() => setSelectedTag(null)}
                    className="shrink-0 ml-1 font-mono uppercase tracking-[0.12em] text-[9px] text-ink-fade hover:text-destructive"
                  >
                    × clear
                  </button>
                )}
              </div>
            )}

            {error && (
              <div className="mb-6">
                <Alert variant="destructive">{error}</Alert>
              </div>
            )}

            {scenes === null ? (
              <LoadingSkeleton />
            ) : filteredScenes && filteredScenes.length === 0 ? (
              isFiltered ? (
                <NoMatchesState query={query} />
              ) : isTrash ? (
                <EmptyTrashState />
              ) : (
                <EmptyState />
              )
            ) : (
              <div className="grid gap-px bg-rule grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 border border-rule">
                {(filteredScenes ?? []).map((s, i) => {
                  const orderedIds = (filteredScenes ?? []).map((x) => x._id);
                  const isOwner = s.role === "owner";
                  const busyShare = loadingShareId === s._id;
                  const busyRow = busyId === s._id;
                  const delay = `${Math.min(i, 8) * 60}ms`;
                  const slug = slugify(s.title, s._id);
                  const numeral = String(i + 1).padStart(2, "0");
                  const isSelected = selectedIds.has(s._id);
                  return (
                    <article
                      key={s._id}
                      role="button"
                      aria-pressed={isSelected}
                      aria-label={`Select scene "${s.title}"`}
                      draggable
                      onMouseEnter={() => { if (token) prefetchScene(s._id, token); }}
                      onDragStart={(e) => {
                        // If the dragged card is part of a multi-selection,
                        // drag all selected scenes. Otherwise drag just this one.
                        const ids =
                          isSelected && selectedIds.size > 1
                            ? Array.from(selectedIds)
                            : [s._id];
                        e.dataTransfer.setData(
                          "application/x-excalidraw-scenes",
                          JSON.stringify(ids),
                        );
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onClick={(e) => {
                        const target = e.target as HTMLElement;
                        if (
                          target.closest(
                            'a, button, input, textarea, [contenteditable="true"]',
                          )
                        ) {
                          return;
                        }
                        toggleSelect(s._id, e.shiftKey, orderedIds);
                      }}
                      className={cn(
                        "group/card relative cursor-pointer opacity-0 animate-numeral-rise transition-all duration-200 hover:-translate-y-px",
                        isSelected
                          ? "bg-paper-deep ring-1 ring-inset ring-ink"
                          : "bg-paper",
                      )}
                      style={{ animationDelay: delay }}
                    >
                      <CardCornerBrackets />

                      <span
                        aria-hidden="true"
                        className={cn(
                          "absolute left-4 top-3 font-serif italic text-5xl select-none leading-none",
                          isTrash
                            ? "text-destructive/30"
                            : "text-ink-fade/30",
                        )}
                      >
                        {numeral}
                      </span>

                      <div className="absolute right-4 top-4 flex items-center gap-1">
                        {/* Scene birthday candle */}
                        {!isTrash && isSceneBirthday(s.createdAt) && (
                          <span title={`Happy birthday! Created ${new Date(s.createdAt!).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`}>
                            <Cake size={12} className="text-gold" />
                          </span>
                        )}
                        {/* Scene health: stale (30+ days) */}
                        {!isTrash && Date.now() - new Date(s.updatedAt).getTime() > 30 * 24 * 60 * 60 * 1000 && (
                          <span title="Stale — untouched for 30+ days" className="font-mono text-[9px] text-ink-fade/50 uppercase">
                            STALE
                          </span>
                        )}
                        {/* Active: edited in last 24h */}
                        {!isTrash && Date.now() - new Date(s.updatedAt).getTime() < 24 * 60 * 60 * 1000 && (
                          <span title="Hot — edited in the last 24 hours">
                            <Flame size={12} className="text-gold" />
                          </span>
                        )}
                        {s.tags.length > 0 && (
                          <div data-tags-popover className="relative">
                            <button
                              type="button"
                              aria-label={`Show tags (${s.tags.length})`}
                              aria-expanded={openTagsId === s._id}
                              onClick={() =>
                                setOpenTagsId((cur) =>
                                  cur === s._id ? null : s._id,
                                )
                              }
                              className="inline-flex h-6 w-6 items-center justify-center text-ink-fade hover:text-plum transition-colors"
                            >
                              <Tag size={13} />
                            </button>
                            {openTagsId === s._id && (
                              <div className="absolute right-0 top-7 z-30 min-w-[140px] max-w-[240px] border border-ink bg-paper p-2 shadow-[6px_6px_0_0_rgba(26,14,46,0.12)]">
                                <div className="font-mono uppercase tracking-[0.14em] text-[9px] text-ink-fade mb-1.5">
                                  // TAGS
                                </div>
                                <div className="flex flex-wrap items-center gap-1">
                                  {s.tags.map((t) => (
                                    <button
                                      key={t}
                                      type="button"
                                      onClick={() => {
                                        setOpenTagsId(null);
                                        void toggleTag(t);
                                      }}
                                      className="border border-rule px-1.5 py-0.5 font-mono uppercase tracking-[0.12em] text-[9px] text-ink-soft hover:text-ink hover:border-ink/40"
                                    >
                                      {t}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                        {!isTrash && (
                          <button
                            type="button"
                            aria-label={s.isStarred ? "Unstar" : "Star"}
                            onClick={() => void handleToggleStar(s)}
                            className={cn(
                              "inline-flex h-6 w-6 items-center justify-center transition-colors",
                              s.isStarred
                                ? "text-gold"
                                : "text-ink-fade hover:text-gold",
                            )}
                          >
                            <Star
                              size={14}
                              fill={s.isStarred ? "currentColor" : "none"}
                            />
                          </button>
                        )}
                        <RoleBadge role={s.role} />
                      </div>

                      <div className="flex flex-col px-5 pt-20 pb-4 min-h-[220px]">
                        <div className="relative inline-block self-start max-w-full">
                            {isOwner ? (
                              <InlineRename
                                value={s.title}
                                canEdit
                                onSubmit={(next) => handleRename(s, next)}
                                ariaLabel="Rename document"
                                className="font-serif italic text-2xl text-ink leading-tight"
                              />
                            ) : (
                              <Link
                                to={`/d/${encodeURIComponent(s._id)}`}
                                className="block max-w-full"
                              >
                                <h3 className="truncate font-serif italic text-2xl text-ink leading-tight">
                                  {s.title}
                                </h3>
                              </Link>
                            )}
                          <span
                            aria-hidden="true"
                            className="pointer-events-none absolute left-0 -bottom-1 h-px w-0 bg-gold transition-[width] duration-500 ease-out group-hover/card:w-full"
                          />
                        </div>
                        <p className="mt-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-ink-fade truncate">
                          // {slug}
                        </p>

                        <dl className="mt-5 space-y-2 text-[11px]">
                          <div className="flex items-baseline gap-2">
                            <dt className="font-mono uppercase tracking-[0.14em] text-[9px] text-ink-fade shrink-0">
                              // OWNED BY
                            </dt>
                            <dd className="text-ink-soft truncate">
                              {s.ownerName}
                            </dd>
                          </div>
                          {!isTrash && isOwner && (
                            <div className="flex items-baseline gap-2">
                              <dt className="font-mono uppercase tracking-[0.14em] text-[9px] text-ink-fade shrink-0">
                                // FOLDER
                              </dt>
                              <dd className="min-w-0 flex-1 truncate">
                                <button
                                  type="button"
                                  onClick={() => setMoveTarget(s)}
                                  title="Move to folder"
                                  className="inline-flex items-center gap-1 italic font-serif text-sm text-ink-soft hover:text-plum transition-colors"
                                >
                                  <span className="truncate">
                                    {s.folderId
                                      ? folders.find((f) => f._id === s.folderId)?.name ?? "—"
                                      : "Unfiled"}
                                  </span>
                                  <span aria-hidden="true" className="text-[10px] opacity-60">⌄</span>
                                </button>
                              </dd>
                            </div>
                          )}
                          {isTrash && s.deletedAt ? (
                            <div className="flex items-baseline gap-2">
                              <dt className="font-mono uppercase tracking-[0.14em] text-[9px] text-destructive shrink-0">
                                // DELETED
                              </dt>
                              <dd
                                className="text-ink-soft truncate italic font-serif text-sm"
                                title={new Date(s.deletedAt).toLocaleString()}
                              >
                                {formatRelativeTime(s.deletedAt)}
                              </dd>
                            </div>
                          ) : (
                            <div className="flex items-baseline gap-2">
                              <dt className="font-mono uppercase tracking-[0.14em] text-[9px] text-ink-fade shrink-0">
                                // UPDATED
                              </dt>
                              <dd
                                className="text-ink-soft truncate italic font-serif text-sm"
                                title={new Date(s.updatedAt).toLocaleString()}
                              >
                                {formatRelativeTime(s.updatedAt)}
                              </dd>
                            </div>
                          )}
                          {!isTrash &&
                            s.lastEditedById &&
                            s.lastEditedAt &&
                            (() => {
                              const ownerIsEditor =
                                s.lastEditedByName === s.ownerName;
                              return (
                                <div className="flex items-baseline gap-2">
                                  <dt className="font-mono uppercase tracking-[0.14em] text-[9px] text-ink-fade shrink-0">
                                    // LAST EDIT
                                  </dt>
                                  <dd
                                    className="text-ink-soft truncate italic font-serif text-sm"
                                    title={new Date(
                                      s.lastEditedAt,
                                    ).toLocaleString()}
                                  >
                                    {ownerIsEditor
                                      ? formatRelativeTime(s.lastEditedAt)
                                      : `${s.lastEditedByName} • ${formatRelativeTime(s.lastEditedAt)}`}
                                  </dd>
                                </div>
                              );
                            })()}
                        </dl>

                        {rowError && rowError.id === s._id && (
                          <div className="mt-3 font-mono uppercase tracking-[0.12em] text-[9px] text-destructive">
                            // {rowError.message}
                          </div>
                        )}
                      </div>

                      <div className="mt-auto border-t border-rule flex items-center">
                        {isTrash ? (
                          <>
                            <CardAction
                              as="button"
                              label={busyRow ? "…" : "Restore"}
                              glyph="↺"
                              tone="plum"
                              disabled={busyRow}
                              onClick={() => void handleRestore(s)}
                            />
                            <span
                              className="h-8 w-px bg-rule"
                              aria-hidden="true"
                            />
                            <CardAction
                              as="button"
                              label={busyRow ? "…" : "Delete forever"}
                              glyph="×"
                              tone="destructive"
                              disabled={busyRow}
                              onClick={() => void handleHardDelete(s)}
                            />
                          </>
                        ) : (
                          <>
                            <CardAction
                              to={`/d/${encodeURIComponent(s._id)}`}
                              label="Open"
                              glyph="↗"
                              tone="plum"
                            />
                            <span
                              className="h-8 w-px bg-rule"
                              aria-hidden="true"
                            />
                            <div className="flex items-center">
                              <IconAction
                                label="Duplicate"
                                glyph="⎘"
                                onClick={() => setDuplicateTarget(s)}
                              />
                              {isOwner && (
                                <IconAction
                                  label={busyShare ? "Loading…" : "Share"}
                                  glyph="◐"
                                  disabled={busyShare}
                                  onClick={() => void openShare(s)}
                                />
                              )}
                              {isOwner && (
                                <IconAction
                                  label={busyRow ? "Deleting…" : "Delete"}
                                  glyph="×"
                                  tone="destructive"
                                  disabled={busyRow}
                                  onClick={() => void handleDelete(s)}
                                />
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Bulk action bar — appears when any cards are selected. */}
      {selectedIds.size > 0 && (
        <BulkActionBar
          count={selectedIds.size}
          isTrash={isTrash}
          busy={bulkBusy}
          notice={bulkNotice}
          onMove={() => setBulkMoveOpen(true)}
          onTag={() => setBulkTagOpen(true)}
          onShare={() => setBulkShareOpen(true)}
          onDelete={() => setBulkDeleteConfirmOpen(true)}
          onRestore={() => void performBulkRestore()}
          onHardDelete={() => setBulkHardDeleteConfirmOpen(true)}
          onClear={clearSelection}
          onSelectAllVisible={() =>
            selectAll((filteredScenes ?? []).map((s) => s._id))
          }
        />
      )}

      {bulkMoveOpen && (
        <BulkMoveModal
          count={selectedIds.size}
          folders={folders}
          onClose={() => setBulkMoveOpen(false)}
          onMove={(folderId) => void performBulkMove(folderId)}
        />
      )}

      {bulkTagOpen && (
        <BulkTagModal
          count={selectedIds.size}
          onClose={() => setBulkTagOpen(false)}
          onSubmit={(add, remove) => void performBulkTag(add, remove)}
        />
      )}

      {bulkShareOpen && (
        <BulkShareModal
          count={selectedIds.size}
          onClose={() => setBulkShareOpen(false)}
          onSubmit={(email, role) => void performBulkShare(email, role)}
        />
      )}

      <ConfirmModal
        open={bulkDeleteConfirmOpen}
        onClose={() => setBulkDeleteConfirmOpen(false)}
        onConfirm={() => performBulkDelete()}
        title="Move to trash."
        description={`${selectedIds.size} scene${selectedIds.size === 1 ? "" : "s"} will go to the trash. You can restore them later.`}
        confirmLabel="Move to trash"
      />

      <ConfirmModal
        open={bulkHardDeleteConfirmOpen}
        onClose={() => setBulkHardDeleteConfirmOpen(false)}
        onConfirm={() => performBulkHardDelete()}
        title="Delete forever."
        description={`Permanently delete ${selectedIds.size} scene${selectedIds.size === 1 ? "" : "s"}? This cannot be undone.`}
        confirmLabel="Delete forever"
      />

      <NewDocModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={(id) => {
          setModalOpen(false);
          navigate(`/d/${encodeURIComponent(id)}`);
        }}
      />

      {newFolderOpen && (
        <NewFolderModal
          onClose={() => setNewFolderOpen(false)}
          onCreated={() => {
            setNewFolderOpen(false);
            void loadFolders();
          }}
        />
      )}

      {renameFolderTarget && (
        <RenameFolderModal
          folder={renameFolderTarget}
          onClose={() => setRenameFolderTarget(null)}
          onUpdated={() => {
            setRenameFolderTarget(null);
            void loadFolders();
          }}
        />
      )}

      {moveTarget && (
        <MoveToFolderModal
          scene={moveTarget}
          folders={folders}
          onClose={() => setMoveTarget(null)}
          onMove={(folderId) => void handleMoveScene(moveTarget, folderId)}
          onCreateFolder={() => {
            setMoveTarget(null);
            setNewFolderOpen(true);
          }}
        />
      )}

      {templatesOpen && (
        <TemplatesDialog
          onClose={() => setTemplatesOpen(false)}
          onCreated={(id) => {
            setTemplatesOpen(false);
            navigate(`/d/${encodeURIComponent(id)}`);
          }}
        />
      )}

      {duplicateTarget && (
        <DuplicateDialog
          sourceId={duplicateTarget._id}
          sourceTitle={duplicateTarget.title}
          onClose={() => setDuplicateTarget(null)}
          onDuplicated={(newId) => {
            setDuplicateTarget(null);
            navigate(`/d/${encodeURIComponent(newId)}`);
          }}
        />
      )}

      {shareScene && (
        <ShareDialog
          scene={shareScene}
          onClose={() => setShareScene(null)}
          onUpdated={(s) => setShareScene(s)}
        />
      )}

      <ConfirmModal
        open={confirmTarget?.kind === "delete-scene"}
        onClose={() => setConfirmTarget(null)}
        onConfirm={() => {
          if (confirmTarget?.kind === "delete-scene") {
            return performDeleteScene(confirmTarget.scene);
          }
        }}
        title="Move to trash."
        description={
          confirmTarget?.kind === "delete-scene"
            ? `"${confirmTarget.scene.title}" will go to the trash. You can restore it later.`
            : undefined
        }
        confirmLabel="Move to trash"
      />

      <ConfirmModal
        open={confirmTarget?.kind === "hard-delete-scene"}
        onClose={() => setConfirmTarget(null)}
        onConfirm={() => {
          if (confirmTarget?.kind === "hard-delete-scene") {
            return performHardDelete(confirmTarget.scene);
          }
        }}
        title="Delete forever."
        description={
          confirmTarget?.kind === "hard-delete-scene"
            ? `"${confirmTarget.scene.title}" will be permanently deleted. This cannot be undone.`
            : undefined
        }
        confirmLabel="Delete forever"
      />

      <StatsDashboard
        open={statsDashboardOpen}
        onClose={() => setStatsDashboardOpen(false)}
      />

      <ChangePasswordDialog
        open={changePasswordOpen}
        onClose={() => setChangePasswordOpen(false)}
      />

      <ConfirmModal
        open={confirmTarget?.kind === "delete-folder"}
        onClose={() => setConfirmTarget(null)}
        onConfirm={() => {
          if (confirmTarget?.kind === "delete-folder") {
            return performDeleteFolder(confirmTarget.folder);
          }
        }}
        title="Delete folder."
        description={
          confirmTarget?.kind === "delete-folder"
            ? `"${confirmTarget.folder.name}" will be removed. Documents inside become unfiled.`
            : undefined
        }
        confirmLabel="Delete folder"
      />
    </div>
  );
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────

interface SidebarProps {
  folders: Folder[];
  selection: Selection;
  onSelect: (next: Selection) => void;
  onNewFolder: () => void;
  onRenameFolder: (folder: Folder) => void;
  onDeleteFolder: (folder: Folder) => void;
  onDropScenes?: (sceneIds: string[], folderId: string | null) => void;
}

const DRAG_MIME = "application/x-excalidraw-scenes";

function extractSceneIds(e: React.DragEvent): string[] | null {
  try {
    const raw = e.dataTransfer.getData(DRAG_MIME);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) {
      return parsed as string[];
    }
  } catch {
    /* ignore */
  }
  return null;
}

function Sidebar({
  folders,
  selection,
  onSelect,
  onNewFolder,
  onRenameFolder,
  onDeleteFolder,
  onDropScenes,
}: SidebarProps) {
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const totalAll = folders.reduce((acc, f) => acc + f.sceneCount, 0);
  return (
    <nav className="border border-rule bg-paper">
      <ul>
        <SidebarRow
          label="All"
          count={totalAll}
          active={selection.kind === "all"}
          onClick={() => onSelect({ kind: "all" })}
        />
        <SidebarRow
          label="★ Starred"
          active={selection.kind === "starred"}
          onClick={() => onSelect({ kind: "starred" })}
        />
        <SidebarRow
          label="Unfiled"
          active={selection.kind === "unfiled"}
          onClick={() => onSelect({ kind: "unfiled" })}
          dropTarget
          isDragOver={dragOverId === "__unfiled__"}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes(DRAG_MIME)) {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setDragOverId("__unfiled__");
            }
          }}
          onDragLeave={() => setDragOverId((cur) => cur === "__unfiled__" ? null : cur)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOverId(null);
            const ids = extractSceneIds(e);
            if (ids && onDropScenes) {
              onDropScenes(ids, null);
            }
          }}
        />
      </ul>
      <div className="h-px bg-rule" />
      <div className="px-4 pt-3 pb-1 flex items-center justify-between">
        <span className="font-mono uppercase tracking-[0.18em] text-[9px] text-ink-fade">
          // FOLDERS
        </span>
        <button
          type="button"
          aria-label="New folder"
          onClick={onNewFolder}
          className="text-ink-fade hover:text-ink"
        >
          <FolderPlus size={12} />
        </button>
      </div>
      <ul>
        {folders.length === 0 ? (
          <li className="px-4 py-2 font-serif italic text-sm text-ink-fade">
            No folders yet
          </li>
        ) : (
          folders.map((f) => {
            const active =
              selection.kind === "folder" && selection.id === f._id;
            const isDragOver = dragOverId === f._id;
            return (
              <li
                key={f._id}
                onDragOver={(e) => {
                  if (e.dataTransfer.types.includes(DRAG_MIME)) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    setDragOverId(f._id);
                  }
                }}
                onDragLeave={() => setDragOverId((cur) => cur === f._id ? null : cur)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverId(null);
                  const ids = extractSceneIds(e);
                  if (ids && onDropScenes) {
                    onDropScenes(ids, f._id);
                  }
                }}
                className={cn(
                  "group/folder relative flex items-center justify-between gap-2 pr-2 transition-colors",
                  isDragOver
                    ? "bg-plum-haze ring-1 ring-inset ring-plum"
                    : active
                      ? "bg-plum-haze"
                      : "",
                )}
              >
                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute left-0 top-0 bottom-0 w-[2px] bg-gold"
                  />
                )}
                <button
                  type="button"
                  onClick={() => onSelect({ kind: "folder", id: f._id })}
                  className="flex-1 min-w-0 flex items-center justify-between gap-2 px-4 py-2 text-left"
                >
                  <span
                    className={cn(
                      "truncate font-serif italic text-base",
                      active ? "text-ink" : "text-ink-soft",
                    )}
                  >
                    {f.name}
                  </span>
                  <span className="font-mono uppercase tracking-[0.12em] text-[9px] text-ink-fade shrink-0">
                    {f.sceneCount}
                  </span>
                </button>
                {active && (
                  <div className="flex items-center gap-0.5 pr-1 opacity-0 group-hover/folder:opacity-100 transition-opacity">
                    <IconButton
                      label="Rename folder"
                      onClick={() => onRenameFolder(f)}
                    >
                      <Pencil />
                    </IconButton>
                    <IconButton
                      label="Delete folder"
                      variant="destructive"
                      onClick={() => onDeleteFolder(f)}
                    >
                      <Trash2 />
                    </IconButton>
                  </div>
                )}
              </li>
            );
          })
        )}
      </ul>
      <div className="h-px bg-rule" />
      <ul>
        <SidebarRow
          label="// TRASH"
          mono
          active={selection.kind === "trash"}
          onClick={() => onSelect({ kind: "trash" })}
        />
      </ul>
      <div className="h-px bg-rule" />
      <div className="px-4 pt-3 pb-1">
        <span className="font-mono uppercase tracking-[0.18em] text-[9px] text-ink-fade">
          // COMMUNITY
        </span>
      </div>
      <ul>
        <li>
          <Link
            to="/brainstorm"
            className="block px-4 py-2 font-serif italic text-base text-ink-soft hover:text-ink hover:bg-plum-haze transition-colors"
          >
            <Lightbulb size={16} className="inline mr-1.5 -mt-0.5" /> Brainstorm Board
          </Link>
        </li>
        <li>
          <Link
            to="/leaderboard"
            className="block px-4 py-2 font-serif italic text-base text-ink-soft hover:text-ink hover:bg-plum-haze transition-colors"
          >
            <Trophy size={16} className="inline mr-1.5 -mt-0.5" /> Leaderboard
          </Link>
        </li>
      </ul>
    </nav>
  );
}

interface SidebarRowProps {
  label: string;
  count?: number;
  active: boolean;
  mono?: boolean;
  onClick: () => void;
  dropTarget?: boolean;
  isDragOver?: boolean;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: () => void;
  onDrop?: (e: React.DragEvent) => void;
}

function SidebarRow({
  label,
  count,
  active,
  mono,
  onClick,
  dropTarget,
  isDragOver,
  onDragOver,
  onDragLeave,
  onDrop,
}: SidebarRowProps) {
  return (
    <li
      className={cn(
        "relative transition-colors",
        isDragOver
          ? "bg-plum-haze ring-1 ring-inset ring-plum"
          : active
            ? "bg-plum-haze"
            : "",
      )}
      onDragOver={dropTarget ? onDragOver : undefined}
      onDragLeave={dropTarget ? onDragLeave : undefined}
      onDrop={dropTarget ? onDrop : undefined}
    >
      {active && (
        <span
          aria-hidden="true"
          className="absolute left-0 top-0 bottom-0 w-[2px] bg-gold"
        />
      )}
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "w-full flex items-center justify-between gap-2 px-4 py-2 text-left",
          mono
            ? cn(
                "font-mono uppercase tracking-[0.18em] text-[10px]",
                active ? "text-ink" : "text-ink-fade hover:text-ink-soft",
              )
            : cn(
                "font-serif italic text-base",
                active ? "text-ink" : "text-ink-soft hover:text-ink",
              ),
        )}
      >
        <span className="truncate">{label}</span>
        {typeof count === "number" && (
          <span className="font-mono uppercase tracking-[0.12em] text-[9px] text-ink-fade shrink-0">
            {count}
          </span>
        )}
      </button>
    </li>
  );
}

// ─── Mobile chip bar ────────────────────────────────────────────────────────

interface NavChipBarProps {
  folders: Folder[];
  selection: Selection;
  onSelect: (next: Selection) => void;
  onNewFolder: () => void;
}

function NavChipBar({
  folders,
  selection,
  onSelect,
  onNewFolder,
}: NavChipBarProps) {
  function chipCx(active: boolean) {
    return cn(
      "shrink-0 border px-2.5 py-1 font-mono uppercase tracking-[0.14em] text-[10px] transition-colors",
      active
        ? "bg-ink text-paper border-ink"
        : "border-rule text-ink-soft hover:border-ink/40 hover:text-ink",
    );
  }
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onSelect({ kind: "all" })}
        className={chipCx(selection.kind === "all")}
      >
        All
      </button>
      <button
        type="button"
        onClick={() => onSelect({ kind: "starred" })}
        className={chipCx(selection.kind === "starred")}
      >
        ★ Starred
      </button>
      <button
        type="button"
        onClick={() => onSelect({ kind: "unfiled" })}
        className={chipCx(selection.kind === "unfiled")}
      >
        Unfiled
      </button>
      {folders.map((f) => (
        <button
          key={f._id}
          type="button"
          onClick={() => onSelect({ kind: "folder", id: f._id })}
          className={chipCx(
            selection.kind === "folder" && selection.id === f._id,
          )}
        >
          {f.name} {f.sceneCount}
        </button>
      ))}
      <button
        type="button"
        onClick={onNewFolder}
        className="shrink-0 border border-rule text-ink-fade hover:text-ink hover:border-ink/40 px-2.5 py-1 font-mono uppercase tracking-[0.14em] text-[10px]"
      >
        + Folder
      </button>
      <button
        type="button"
        onClick={() => onSelect({ kind: "trash" })}
        className={chipCx(selection.kind === "trash")}
      >
        // Trash
      </button>
    </div>
  );
}

// ─── Card action helper (unchanged) ────────────────────────────────────────

interface CardActionBaseProps {
  label: string;
  glyph: string;
  tone?: "plum" | "destructive" | "default";
  disabled?: boolean;
}

interface CardActionLinkProps extends CardActionBaseProps {
  as?: "link";
  to: string;
  onClick?: never;
}
interface CardActionButtonProps extends CardActionBaseProps {
  as: "button";
  to?: never;
  onClick: () => void;
}
type CardActionProps = CardActionLinkProps | CardActionButtonProps;

function CardAction(props: CardActionProps) {
  const tone = props.tone ?? "default";
  const toneClass =
    tone === "plum"
      ? "text-plum hover:text-plum-deep"
      : tone === "destructive"
        ? "text-ink-fade hover:text-destructive"
        : "text-ink-fade hover:text-ink";
  const inner = (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-[13px] leading-none">{props.glyph}</span>
      <span>{props.label}</span>
    </span>
  );
  const className = cn(
    "flex-1 inline-flex items-center justify-center h-11 font-mono uppercase tracking-[0.14em] text-[10px] transition-colors",
    toneClass,
    props.disabled && "opacity-50 pointer-events-none",
  );
  if (props.as === "button") {
    return (
      <button type="button" onClick={props.onClick} className={className}>
        {inner}
      </button>
    );
  }
  return (
    <Link to={props.to} className={className}>
      {inner}
    </Link>
  );
}

interface IconActionProps {
  label: string;
  glyph: string;
  tone?: "default" | "destructive";
  disabled?: boolean;
  onClick: () => void;
}

function IconAction({
  label,
  glyph,
  tone = "default",
  disabled,
  onClick,
}: IconActionProps) {
  const toneClass =
    tone === "destructive"
      ? "text-ink-fade hover:text-destructive hover:bg-destructive/5"
      : "text-ink-fade hover:text-ink hover:bg-plum-haze";
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex h-11 w-11 items-center justify-center text-base leading-none border-l border-rule transition-colors",
        toneClass,
        disabled && "opacity-50 pointer-events-none",
      )}
    >
      <span aria-hidden="true">{glyph}</span>
    </button>
  );
}

interface UserMenuItemProps {
  label: string;
  onClick: () => void;
  tone?: "default" | "destructive";
}

function UserMenuItem({ label, onClick, tone = "default" }: UserMenuItemProps) {
  return (
    <li>
      <button
        type="button"
        role="menuitem"
        onClick={onClick}
        className={cn(
          "w-full text-left px-4 py-2.5 font-mono uppercase tracking-[0.14em] text-[10px] transition-colors",
          tone === "destructive"
            ? "text-ink-fade hover:text-destructive hover:bg-destructive/5"
            : "text-ink-soft hover:text-ink hover:bg-plum-haze",
        )}
      >
        {label}
      </button>
    </li>
  );
}

function LoadingSkeleton() {
  return (
    <div className="grid gap-px bg-rule border border-rule grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="group/card relative bg-paper min-h-[220px] flex items-center justify-center"
        >
          <CardCornerBrackets />
          <span className="font-serif italic text-xl text-ink-fade animate-pulse-soft">
            Loading<Spinner />
          </span>
        </div>
      ))}
    </div>
  );
}

function NoMatchesState({ query }: { query: string }) {
  return (
    <div className="relative border border-rule bg-paper px-8 py-16 overflow-hidden opacity-0 animate-ink-bleed">
      <CardCornerBrackets />
      <p className="relative font-mono uppercase tracking-[0.18em] text-[10px] text-ink-fade mb-4">
        // NO MATCHES
      </p>
      <h2 className="relative font-serif italic text-3xl text-ink leading-tight max-w-2xl">
        Nothing titled &ldquo;{query}&rdquo;.{" "}
        <span className="text-ink-fade">Try another search.</span>
      </h2>
    </div>
  );
}

function EmptyTrashState() {
  return (
    <div className="relative border border-rule bg-paper px-8 py-20 overflow-hidden opacity-0 animate-ink-bleed">
      <CardCornerBrackets />
      <p className="relative font-mono uppercase tracking-[0.18em] text-[10px] text-ink-fade mb-4">
        // TRASH IS EMPTY
      </p>
      <h2 className="relative font-serif italic text-4xl text-ink leading-tight max-w-2xl">
        Nothing discarded —{" "}
        <span className="text-ink-fade">a tidy archive.</span>
      </h2>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="relative border border-rule bg-paper px-8 py-20 overflow-hidden opacity-0 animate-ink-bleed">
      <CardCornerBrackets />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-4 -bottom-16 font-serif italic text-[240px] text-ink-fade/10 leading-none select-none"
      >
        &amp;
      </span>
      <p className="relative font-mono uppercase tracking-[0.18em] text-[10px] text-ink-fade mb-4">
        // EMPTY FOLIO
      </p>
      <h2 className="relative font-serif italic text-4xl text-ink leading-tight max-w-2xl">
        No documents yet —{" "}
        <span className="text-ink-fade">start a new one above.</span>
      </h2>
    </div>
  );
}

// ─── Modals ────────────────────────────────────────────────────────────────

interface NewDocModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}

function NewDocModal({ open, onClose, onCreated }: NewDocModalProps) {
  const { token, logout } = useAuth();
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setTitle("");
      setError(null);
      setBusy(false);
    }
  }, [open]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const created = await createScene({ title: title.trim() }, token);
      onCreated(created._id);
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
        return;
      }
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="A new sheet."
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button form="new-doc-form" type="submit" disabled={busy}>
            {busy ? (
              <>
                <Spinner /> Creating
              </>
            ) : (
              <>Begin &rarr;</>
            )}
          </Button>
        </>
      }
    >
      <form id="new-doc-form" onSubmit={submit} className="space-y-5">
        <div>
          <label
            htmlFor="new-doc-title"
            className="mb-1 block font-mono uppercase tracking-[0.16em] text-[10px] text-ink-fade"
          >
            // TITLE
          </label>
          <input
            id="new-doc-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Untitled composition"
            autoFocus
            className="flex h-11 w-full rounded-none border-0 border-b border-rule bg-transparent px-0 text-base text-ink placeholder:italic placeholder:font-serif placeholder:text-ink-fade/60 focus:border-b-2 focus:border-ink focus:outline-none focus:ring-0"
          />
        </div>
        {error && <Alert variant="destructive">{error}</Alert>}
      </form>
    </Modal>
  );
}

interface NewFolderModalProps {
  onClose: () => void;
  onCreated: () => void;
}

function NewFolderModal({ onClose, onCreated }: NewFolderModalProps) {
  const { token, logout } = useAuth();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameId = useId();

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createFolder(name.trim(), token);
      onCreated();
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
        return;
      }
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="A new folder."
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button form="new-folder-form" type="submit" disabled={busy}>
            {busy ? (
              <>
                <Spinner /> Creating
              </>
            ) : (
              <>Create &rarr;</>
            )}
          </Button>
        </>
      }
    >
      <form id="new-folder-form" onSubmit={submit} className="space-y-5">
        <div>
          <label
            htmlFor={nameId}
            className="mb-1 block font-mono uppercase tracking-[0.16em] text-[10px] text-ink-fade"
          >
            // NAME
          </label>
          <input
            id={nameId}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            className="flex h-11 w-full rounded-none border-0 border-b border-rule bg-transparent px-0 text-base text-ink placeholder:italic placeholder:font-serif placeholder:text-ink-fade/60 focus:border-b-2 focus:border-ink focus:outline-none focus:ring-0"
          />
        </div>
        {error && <Alert variant="destructive">{error}</Alert>}
      </form>
    </Modal>
  );
}

interface RenameFolderModalProps {
  folder: Folder;
  onClose: () => void;
  onUpdated: () => void;
}

function RenameFolderModal({
  folder,
  onClose,
  onUpdated,
}: RenameFolderModalProps) {
  const { token, logout } = useAuth();
  const [name, setName] = useState(folder.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameId = useId();

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await renameFolder(folder._id, name.trim(), token);
      onUpdated();
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
        return;
      }
      setError(err instanceof Error ? err.message : "Rename failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Rename folder."
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button form="rename-folder-form" type="submit" disabled={busy}>
            {busy ? (
              <>
                <Spinner /> Saving
              </>
            ) : (
              <>Save &rarr;</>
            )}
          </Button>
        </>
      }
    >
      <form id="rename-folder-form" onSubmit={submit} className="space-y-5">
        <div>
          <label
            htmlFor={nameId}
            className="mb-1 block font-mono uppercase tracking-[0.16em] text-[10px] text-ink-fade"
          >
            // NAME
          </label>
          <input
            id={nameId}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            className="flex h-11 w-full rounded-none border-0 border-b border-rule bg-transparent px-0 text-base text-ink focus:border-b-2 focus:border-ink focus:outline-none focus:ring-0"
          />
        </div>
        {error && <Alert variant="destructive">{error}</Alert>}
      </form>
    </Modal>
  );
}

interface MoveToFolderModalProps {
  scene: SceneListItem;
  folders: Folder[];
  onClose: () => void;
  onMove: (folderId: string | null) => void;
  onCreateFolder: () => void;
}

function MoveToFolderModal({
  scene,
  folders,
  onClose,
  onMove,
  onCreateFolder,
}: MoveToFolderModalProps) {
  return (
    <Modal
      open
      onClose={onClose}
      title="Move to folder."
      description={scene.title}
      size="sm"
      footer={
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      }
    >
      <ul className="border border-rule bg-paper-deep divide-y divide-rule">
        <li>
          <button
            type="button"
            onClick={() => onMove(null)}
            className={cn(
              "w-full flex items-center justify-between gap-2 px-4 py-3 text-left hover:bg-plum-haze",
              scene.folderId === null && "bg-plum-haze",
            )}
          >
            <span className="font-serif italic text-base text-ink">
              Unfiled
            </span>
            <span className="font-mono uppercase tracking-[0.12em] text-[9px] text-ink-fade">
              // NO FOLDER
            </span>
          </button>
        </li>
        {folders.map((f) => (
          <li key={f._id}>
            <button
              type="button"
              onClick={() => onMove(f._id)}
              className={cn(
                "w-full flex items-center justify-between gap-2 px-4 py-3 text-left hover:bg-plum-haze",
                scene.folderId === f._id && "bg-plum-haze",
              )}
            >
              <span className="font-serif italic text-base text-ink truncate">
                {f.name}
              </span>
              <span className="font-mono uppercase tracking-[0.12em] text-[9px] text-ink-fade">
                {f.sceneCount} ITEMS
              </span>
            </button>
          </li>
        ))}
        <li>
          <button
            type="button"
            onClick={onCreateFolder}
            className="w-full flex items-center px-4 py-3 text-left hover:bg-plum-haze font-mono uppercase tracking-[0.14em] text-[10px] text-plum"
          >
            + New folder…
          </button>
        </li>
      </ul>
    </Modal>
  );
}

// ─── Bulk action bar ───────────────────────────────────────────────────────

interface BulkActionBarProps {
  count: number;
  isTrash: boolean;
  busy: boolean;
  notice: string | null;
  onMove: () => void;
  onTag: () => void;
  onShare: () => void;
  onDelete: () => void;
  onRestore: () => void;
  onHardDelete: () => void;
  onClear: () => void;
  onSelectAllVisible: () => void;
}

function BulkBarButton({
  label,
  onClick,
  disabled,
  tone = "default",
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "default" | "destructive";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "h-8 px-3 font-mono uppercase tracking-[0.16em] text-[10px] border transition-colors",
        tone === "destructive"
          ? "border-paper/60 text-paper hover:bg-destructive hover:text-paper hover:border-destructive"
          : "border-paper/60 text-paper hover:bg-paper hover:text-ink",
        disabled && "opacity-50 pointer-events-none",
      )}
    >
      {label}
    </button>
  );
}

function BulkActionBar({
  count,
  isTrash,
  busy,
  notice,
  onMove,
  onTag,
  onShare,
  onDelete,
  onRestore,
  onHardDelete,
  onClear,
  onSelectAllVisible,
}: BulkActionBarProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-rule bg-ink text-paper">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-3 sm:px-8 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div
            role="status"
            aria-live="polite"
            className="font-mono uppercase tracking-[0.18em] text-[10px] text-gold"
          >
            // {String(count).padStart(2, "0")} SELECTED
          </div>
          <button
            type="button"
            onClick={onSelectAllVisible}
            className="font-mono uppercase tracking-[0.14em] text-[9px] text-paper/70 hover:text-gold"
          >
            Select all visible
          </button>
          {notice && (
            <span className="font-mono uppercase tracking-[0.12em] text-[9px] text-destructive/90">
              // {notice}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isTrash ? (
            <>
              <BulkBarButton
                label="Restore"
                onClick={onRestore}
                disabled={busy}
              />
              <BulkBarButton
                label="Delete forever"
                tone="destructive"
                onClick={onHardDelete}
                disabled={busy}
              />
            </>
          ) : (
            <>
              <BulkBarButton label="Move" onClick={onMove} disabled={busy} />
              <BulkBarButton label="Tag" onClick={onTag} disabled={busy} />
              <BulkBarButton label="Share" onClick={onShare} disabled={busy} />
              <BulkBarButton
                label="Delete"
                tone="destructive"
                onClick={onDelete}
                disabled={busy}
              />
            </>
          )}
          <span aria-hidden="true" className="mx-1 h-5 w-px bg-paper/30" />
          <BulkBarButton label="Clear" onClick={onClear} disabled={busy} />
        </div>
      </div>
    </div>
  );
}

// ─── Bulk modals ───────────────────────────────────────────────────────────

interface BulkMoveModalProps {
  count: number;
  folders: Folder[];
  onClose: () => void;
  onMove: (folderId: string | null) => void;
}

function BulkMoveModal({
  count,
  folders,
  onClose,
  onMove,
}: BulkMoveModalProps) {
  return (
    <Modal
      open
      onClose={onClose}
      title="Move to folder."
      description={`${count} selected`}
      size="sm"
      footer={
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      }
    >
      <ul className="border border-rule bg-paper-deep divide-y divide-rule">
        <li>
          <button
            type="button"
            onClick={() => onMove(null)}
            className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left hover:bg-plum-haze"
          >
            <span className="font-serif italic text-base text-ink">
              Unfiled
            </span>
            <span className="font-mono uppercase tracking-[0.12em] text-[9px] text-ink-fade">
              // NO FOLDER
            </span>
          </button>
        </li>
        {folders.map((f) => (
          <li key={f._id}>
            <button
              type="button"
              onClick={() => onMove(f._id)}
              className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left hover:bg-plum-haze"
            >
              <span className="font-serif italic text-base text-ink truncate">
                {f.name}
              </span>
              <span className="font-mono uppercase tracking-[0.12em] text-[9px] text-ink-fade">
                {f.sceneCount} ITEMS
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

interface BulkTagModalProps {
  count: number;
  onClose: () => void;
  onSubmit: (add: string[], remove: string[]) => void;
}

function parseTagList(value: string): string[] {
  return value
    .split(/[,\s]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

function BulkTagModal({ count, onClose, onSubmit }: BulkTagModalProps) {
  const [addInput, setAddInput] = useState("");
  const [removeInput, setRemoveInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const addId = useId();
  const removeId = useId();

  function submit(e: FormEvent) {
    e.preventDefault();
    const add = parseTagList(addInput);
    const remove = parseTagList(removeInput);
    if (add.length === 0 && remove.length === 0) {
      setError("Enter at least one tag to add or remove.");
      return;
    }
    setError(null);
    onSubmit(add, remove);
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Bulk tag."
      description={`${count} selected`}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button form="bulk-tag-form" type="submit">
            Apply &rarr;
          </Button>
        </>
      }
    >
      <form id="bulk-tag-form" onSubmit={submit} className="space-y-5">
        <div>
          <label
            htmlFor={addId}
            className="mb-1 block font-mono uppercase tracking-[0.16em] text-[10px] text-ink-fade"
          >
            // TAGS TO ADD
          </label>
          <Input
            id={addId}
            variant="editorial"
            value={addInput}
            onChange={(e) => setAddInput(e.target.value)}
            placeholder="design, review, wip"
            autoFocus
          />
        </div>
        <div>
          <label
            htmlFor={removeId}
            className="mb-1 block font-mono uppercase tracking-[0.16em] text-[10px] text-ink-fade"
          >
            // TAGS TO REMOVE
          </label>
          <Input
            id={removeId}
            variant="editorial"
            value={removeInput}
            onChange={(e) => setRemoveInput(e.target.value)}
            placeholder="old, stale"
          />
        </div>
        {error && <Alert variant="destructive">{error}</Alert>}
        <p className="font-mono uppercase tracking-[0.12em] text-[9px] text-ink-fade">
          // separate tags with commas or spaces
        </p>
      </form>
    </Modal>
  );
}

interface BulkShareModalProps {
  count: number;
  onClose: () => void;
  onSubmit: (email: string, role: "viewer" | "editor") => void;
}

function BulkShareModal({ count, onClose, onSubmit }: BulkShareModalProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"viewer" | "editor">("viewer");
  const [error, setError] = useState<string | null>(null);
  const emailId = useId();
  const roleId = useId();

  function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes("@")) {
      setError("Enter a valid email address.");
      return;
    }
    setError(null);
    onSubmit(trimmed, role);
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Bulk share."
      description={`${count} selected`}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button form="bulk-share-form" type="submit">
            Share &rarr;
          </Button>
        </>
      }
    >
      <form id="bulk-share-form" onSubmit={submit} className="space-y-5">
        <div>
          <label
            htmlFor={emailId}
            className="mb-1 block font-mono uppercase tracking-[0.16em] text-[10px] text-ink-fade"
          >
            // EMAIL
          </label>
          <Input
            id={emailId}
            variant="editorial"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="someone@team.com"
            autoFocus
          />
        </div>
        <div>
          <label
            htmlFor={roleId}
            className="mb-1 block font-mono uppercase tracking-[0.16em] text-[10px] text-ink-fade"
          >
            // ROLE
          </label>
          <Select
            id={roleId}
            value={role}
            onChange={(e) =>
              setRole(e.target.value as "viewer" | "editor")
            }
          >
            <option value="viewer">Viewer</option>
            <option value="editor">Editor</option>
          </Select>
        </div>
        {error && <Alert variant="destructive">{error}</Alert>}
      </form>
    </Modal>
  );
}
