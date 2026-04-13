import { useEffect, useRef, useState, type ReactNode } from "react";
import type { BinaryFiles } from "@excalidraw/excalidraw/types/types";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Excalidraw } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types/types";
import {
  Activity,
  ArrowLeft,
  BookmarkPlus,
  Copy,
  Download,
  History,
  Library as LibraryIcon,
  Lock,
  Share2,
  Tag as TagIcon,
} from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { useExcalidrawPersistence } from "../hooks/useExcalidrawPersistence";
import { useExcalidrawCollab } from "../hooks/useExcalidrawCollab";
import { CollaboratorsBar } from "../components/CollaboratorsBar";
import { ShareDialog } from "../components/ShareDialog";
import { VersionsDialog } from "../components/VersionsDialog";
import { DuplicateDialog } from "../components/DuplicateDialog";
import { LibrariesDialog } from "../components/LibrariesDialog";
import { ExportDialog } from "../components/ExportDialog";
import { SaveAsTemplateDialog } from "../components/SaveAsTemplateDialog";
import { TagsDialog } from "../components/TagsDialog";
import { ActivityLogDialog } from "../components/ActivityLogDialog";
import { sanitizeAppState } from "../lib/sanitizeAppState";
import { formatRelativeTime } from "../lib/relativeTime";
import { ApiError, getLibrary, listLibraries, renameScene } from "../lib/api";
import type { SceneDetail } from "../lib/types";
import { Button } from "../components/ui/Button";
import { Alert } from "../components/ui/Alert";
import { RoleBadge } from "../components/ui/Badge";
import { Spinner } from "../components/ui/Spinner";
import { IconButton } from "../components/ui/IconButton";
import { InlineRename } from "../components/ui/InlineRename";
import { BrandMark } from "../components/BrandMark";
import { useNetworkStatus } from "../hooks/useNetworkStatus";
import { cn } from "../lib/cn";

export function EditorPage() {
  const { docId } = useParams<{ docId: string }>();
  const { token, user, logout } = useAuth();
  const navigate = useNavigate();
  const { isOnline } = useNetworkStatus();
  const [shareOpen, setShareOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [librariesOpen, setLibrariesOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportSnapshot, setExportSnapshot] = useState<{
    elements: readonly unknown[];
    appState: Record<string, unknown>;
    files: BinaryFiles | null;
  } | null>(null);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [librariesRevision, setLibrariesRevision] = useState(0);
  const [sceneOverride, setSceneOverride] = useState<SceneDetail | null>(null);
  const excalidrawApiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const [excalidrawApiReady, setExcalidrawApiReady] = useState(0);

  const id = docId ?? "";
  const collabEnabled = import.meta.env.VITE_ENABLE_COLLAB === "true";

  const {
    collaborators,
    isConnected,
    collabError,
    ignoreNextOnChange,
    lastActiveMap,
    onCollabChange,
    onCollabPointerUpdate,
  } = useExcalidrawCollab({
    docId: id,
    excalidrawAPI: excalidrawApiRef.current,
    enabled: collabEnabled,
  });

  const {
    setExcalidrawAPI: setPersistenceAPI,
    onChange,
    loading,
    saving,
    saved,
    scene,
    error,
    reload,
  } = useExcalidrawPersistence(id, { token, ignoreNextOnChange });

  const setExcalidrawAPI = (api: ExcalidrawImperativeAPI | null) => {
    excalidrawApiRef.current = api;
    setPersistenceAPI(api);
    if (api) setExcalidrawApiReady((n) => n + 1);
  };

  // Load all user libraries and merge into the Excalidraw library panel
  useEffect(() => {
    if (!token) return;
    const api = excalidrawApiRef.current;
    if (!api) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await listLibraries(token);
        const details = await Promise.all(
          list.map((l) => getLibrary(l._id, token)),
        );
        if (cancelled) return;
        const combined: unknown[] = [];
        for (const d of details) {
          if (Array.isArray(d.libraryItems)) {
            combined.push(...d.libraryItems);
          }
        }
        // updateLibrary accepts LibraryItemsSource; cast through unknown.
        await api.updateLibrary({
          libraryItems: combined as never,
          merge: false,
          openLibraryMenu: false,
        });
      } catch (err: unknown) {
        if (err instanceof ApiError && err.status === 401) {
          logout();
        }
        // Silently swallow other errors — library sync is non-critical.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, logout, excalidrawApiReady, librariesRevision]);

  const current = sceneOverride ?? scene;
  const canEdit = !!scene && scene.role !== "viewer";
  const isOwner = current?.role === "owner";
  const isAdmin = !!user?.isAdmin;

  function applyTagsToCurrent(next: string[]): void {
    if (!current) return;
    setSceneOverride({ ...current, tags: next });
  }

  async function handleRename(next: string) {
    if (!token || !current) return;
    try {
      await renameScene(current._id, next, token);
      setSceneOverride({ ...current, title: next });
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
      }
      throw err;
    }
  }

  return (
    <div className="flex h-screen flex-col bg-paper">
      {!isOnline && (
        <div className="w-full bg-ink px-4 py-1.5 text-center">
          <span className="font-mono uppercase tracking-[0.14em] text-[10px] text-gold">
            // OFFLINE — changes saved locally
          </span>
        </div>
      )}
      <header className="shrink-0 bg-ink text-paper border-b border-gold/70">
        <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
          <Link
            to="/"
            aria-label="Back to documents"
            title="Back to documents"
            className="inline-flex h-9 w-9 items-center justify-center rounded-none text-paper/75 transition-colors hover:bg-paper/10 hover:text-gold"
          >
            <ArrowLeft size={17} />
          </Link>

          <div className="hidden md:block">
            <BrandMark size={22} tone="paper" />
          </div>

          <div className="mx-2 hidden h-6 w-px bg-paper/25 md:block" />

          <div className="flex min-w-0 flex-1 items-center gap-3">
            {current ? (
              <InlineRename
                value={current.title}
                canEdit={isOwner}
                onSubmit={handleRename}
                ariaLabel="Rename document"
                tone="paper"
                className="truncate font-serif italic text-lg sm:text-xl text-paper"
              />
            ) : (
              <h1 className="truncate font-serif italic text-lg sm:text-xl text-paper">
                {loading ? "Loading…" : id}
              </h1>
            )}
            {current && <RoleBadge role={current.role} tone="paper" />}
            <SaveStatus
              loading={loading}
              saving={saving}
              saved={saved}
              canEdit={canEdit}
              error={error}
            />
          </div>

          {collabEnabled && scene && (
            <CollaboratorsBar
              collaborators={collaborators}
              isConnected={isConnected}
              collabError={collabError}
              lastActiveMap={lastActiveMap}
            />
          )}

          {current && current.lastEditedById && current.lastEditedAt && (
            <span className="hidden md:inline-flex items-center whitespace-nowrap text-paper/60 font-mono uppercase tracking-[0.16em] text-[9px]">
              // LAST EDIT BY {current.lastEditedByName ?? "—"}{" "}
              {formatRelativeTime(current.lastEditedAt)}
            </span>
          )}

          <div className="flex items-center gap-0.5">
            <OnPrimaryIconButton
              label="Duplicate"
              onClick={() => setDuplicateOpen(true)}
              disabled={!current}
            >
              <Copy />
            </OnPrimaryIconButton>
            <OnPrimaryIconButton
              label="Export"
              onClick={() => {
                if (!current) return;
                const api = excalidrawApiRef.current;
                setExportSnapshot({
                  elements: (api
                    ? api.getSceneElements()
                    : current.elements) as unknown as readonly unknown[],
                  appState: (api
                    ? api.getAppState()
                    : current.appState) as unknown as Record<string, unknown>,
                  files: api ? api.getFiles() : null,
                });
                setExportOpen(true);
              }}
              disabled={!current}
            >
              <Download />
            </OnPrimaryIconButton>
            <OnPrimaryIconButton
              label="Versions"
              onClick={() => setVersionsOpen(true)}
              disabled={!current}
            >
              <History />
            </OnPrimaryIconButton>
            <OnPrimaryIconButton
              label="Activity"
              onClick={() => setActivityOpen(true)}
              disabled={!current}
            >
              <Activity />
            </OnPrimaryIconButton>
            <OnPrimaryIconButton
              label="Libraries"
              onClick={() => setLibrariesOpen(true)}
            >
              <LibraryIcon />
            </OnPrimaryIconButton>
            {canEdit && (
              <OnPrimaryIconButton
                label="Tags"
                onClick={() => setTagsOpen(true)}
                disabled={!current}
              >
                <TagIcon />
              </OnPrimaryIconButton>
            )}
            {isOwner && (
              <OnPrimaryIconButton
                label="Share"
                onClick={() => setShareOpen(true)}
              >
                <Share2 />
              </OnPrimaryIconButton>
            )}
            {isAdmin && (
              <OnPrimaryIconButton
                label="Save as template"
                onClick={() => setSaveTemplateOpen(true)}
                disabled={!current}
              >
                <BookmarkPlus />
              </OnPrimaryIconButton>
            )}
          </div>
        </div>
      </header>

      <div className="relative min-h-0 flex-1 p-2">
        {error && !current ? (
          <div className="mx-auto max-w-lg p-6">
            <Alert variant="destructive" className="mb-5">
              {error}
            </Alert>
            <Button variant="outline" onClick={() => navigate("/")}>
              &larr; Back to home
            </Button>
          </div>
        ) : !scene ? (
          <div className="flex h-full items-center justify-center">
            <div className="inline-flex items-center gap-3 text-ink-fade">
              <Spinner size={18} />
              <span className="font-mono uppercase tracking-[0.18em] text-[10px]">
                // LOADING SCENE
              </span>
            </div>
          </div>
        ) : (
          <div className="relative h-full w-full border border-rule bg-paper">
            <Excalidraw
              key={scene._id}
              initialData={{
                elements: scene.elements as never,
                appState: scene.appState as never,
                scrollToContent: true,
              }}
              excalidrawAPI={(api) => setExcalidrawAPI(api)}
              onChange={(elements, appState) => {
                const els = elements as unknown as readonly unknown[];
                const state = appState as unknown as Record<string, unknown>;
                onCollabChange(els);
                onChange(els, state);
              }}
              onPointerUpdate={collabEnabled ? onCollabPointerUpdate : undefined}
              isCollaborating={collabEnabled && isConnected}
              viewModeEnabled={!canEdit}
            />
          </div>
        )}
      </div>

      {shareOpen && current && isOwner && (
        <ShareDialog
          scene={current}
          onClose={() => setShareOpen(false)}
          onUpdated={(s) => setSceneOverride(s)}
        />
      )}
      {duplicateOpen && current && (
        <DuplicateDialog
          sourceId={current._id}
          sourceTitle={current.title}
          onClose={() => setDuplicateOpen(false)}
          onDuplicated={(newId) => {
            setDuplicateOpen(false);
            navigate(`/d/${encodeURIComponent(newId)}`);
          }}
        />
      )}
      {exportOpen && current && exportSnapshot && (
        <ExportDialog
          title={current.title}
          elements={exportSnapshot.elements}
          appState={exportSnapshot.appState}
          files={exportSnapshot.files}
          onClose={() => {
            setExportOpen(false);
            setExportSnapshot(null);
          }}
        />
      )}
      {librariesOpen && (
        <LibrariesDialog
          onClose={() => setLibrariesOpen(false)}
          onChanged={() => setLibrariesRevision((n) => n + 1)}
        />
      )}
      {versionsOpen && current && (
        <VersionsDialog
          sceneId={current._id}
          canEdit={canEdit}
          onClose={() => setVersionsOpen(false)}
          onRestored={() => reload()}
        />
      )}
      {tagsOpen && current && (
        <TagsDialog
          sceneId={current._id}
          tags={current.tags}
          onChange={applyTagsToCurrent}
          onClose={() => setTagsOpen(false)}
        />
      )}
      {activityOpen && current && (
        <ActivityLogDialog
          open
          sceneId={current._id}
          onClose={() => setActivityOpen(false)}
        />
      )}
      {saveTemplateOpen && current && (
        <SaveAsTemplateDialog
          defaultName={current.title}
          onClose={() => setSaveTemplateOpen(false)}
          onSaved={() => setSaveTemplateOpen(false)}
          getElements={() =>
            (excalidrawApiRef.current
              ? excalidrawApiRef.current.getSceneElements()
              : current.elements) as unknown as readonly unknown[]
          }
          getAppState={() =>
            sanitizeAppState(
              (excalidrawApiRef.current
                ? excalidrawApiRef.current.getAppState()
                : current.appState) as unknown as Record<string, unknown>,
            )
          }
        />
      )}
    </div>
  );
}

interface OnPrimaryIconButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}

function OnPrimaryIconButton({
  label,
  onClick,
  disabled,
  children,
}: OnPrimaryIconButtonProps) {
  return (
    <IconButton
      label={label}
      variant="onPrimary"
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </IconButton>
  );
}

interface SaveStatusProps {
  loading: boolean;
  saving: boolean;
  saved: boolean;
  canEdit: boolean;
  error: string | null;
}

/**
 * Editorial "save stamp". A square chip with hairline border and
 * mono caps — reads like a print-proof approval stamp.
 */
function SaveStatus({
  loading,
  saving,
  saved,
  canEdit,
  error,
}: SaveStatusProps) {
  let content: ReactNode = null;
  let tone = "border-paper/30 text-paper/75 bg-paper/5";
  let animate = "";

  if (error) {
    content = <>// SAVE ERROR</>;
    tone = "border-destructive text-destructive bg-paper";
  } else if (loading) {
    content = (
      <>
        // LOADING
        <Spinner size={10} />
      </>
    );
  } else if (saving) {
    content = (
      <>
        // SAVING
        <Spinner size={10} />
      </>
    );
  } else if (saved) {
    content = (
      <>
        // SAVED
        <span
          aria-hidden="true"
          className="inline-block h-1.5 w-1.5 bg-gold"
        />
      </>
    );
    tone = "border-gold/60 text-paper bg-paper/5";
    animate = "animate-pop-in";
  } else if (!canEdit) {
    content = (
      <>
        <Lock size={10} />
        // READ-ONLY
      </>
    );
  } else {
    return null;
  }

  return (
    <span
      className={cn(
        "hidden sm:inline-flex items-center gap-1.5 border px-2 py-1 font-mono uppercase tracking-[0.14em] text-[9px] rounded-none",
        tone,
        animate,
      )}
    >
      {content}
    </span>
  );
}
