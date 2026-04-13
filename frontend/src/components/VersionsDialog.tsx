import { useEffect, useRef, useState } from "react";
import { Excalidraw } from "@excalidraw/excalidraw";
import { ApiError, getVersion, listVersions, saveScene } from "../lib/api";
import { useAuth } from "../auth/AuthContext";
import { sanitizeAppState } from "../lib/sanitizeAppState";
import type { VersionDetail, VersionListItem } from "../lib/types";
import { Modal } from "./ui/Modal";
import { Button } from "./ui/Button";
import { Alert } from "./ui/Alert";
import { Spinner } from "./ui/Spinner";
import { formatRelativeTime } from "../lib/relativeTime";
import { cn } from "../lib/cn";

interface Props {
  sceneId: string;
  canEdit: boolean;
  onClose: () => void;
  onRestored: () => void;
}

function shortId(id: string): string {
  return id.slice(-6).toUpperCase();
}

export function VersionsDialog({
  sceneId,
  canEdit,
  onClose,
  onRestored,
}: Props) {
  const { token, logout } = useAuth();
  const [versions, setVersions] = useState<VersionListItem[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<VersionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const latestSelectionRef = useRef<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    listVersions(sceneId, token)
      .then((v) => {
        if (!cancelled) setVersions(v);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          logout();
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to load");
      });
    return () => {
      cancelled = true;
    };
  }, [sceneId, token, logout]);

  async function selectVersion(id: string) {
    if (!token) return;
    latestSelectionRef.current = id;
    setSelectedId(id);
    setSelected(null);
    setError(null);
    try {
      const data = await getVersion(sceneId, id, token);
      if (latestSelectionRef.current !== id) return;
      setSelected(data);
    } catch (err: unknown) {
      if (latestSelectionRef.current !== id) return;
      if (err instanceof ApiError && err.status === 401) {
        logout();
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to fetch version");
    }
  }

  async function restore() {
    if (!token || !selected || !canEdit) return;
    setBusy(true);
    setError(null);
    try {
      await saveScene(
        sceneId,
        {
          elements: selected.elements,
          appState: sanitizeAppState(selected.appState),
        },
        token,
      );
      onRestored();
      onClose();
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
        return;
      }
      setError(err instanceof Error ? err.message : "Restore failed");
    } finally {
      setBusy(false);
    }
  }

  const count = versions?.length ?? 0;

  return (
    <Modal
      open
      onClose={onClose}
      title="Version history."
      description={`${String(count).padStart(2, "0")} SNAPSHOT${count === 1 ? "" : "S"}`}
      size="xl"
      className="h-[86vh]"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {selected && canEdit && (
            <Button onClick={restore} disabled={busy}>
              {busy ? (
                <>
                  <Spinner /> Restoring
                </>
              ) : (
                <>Restore &rarr;</>
              )}
            </Button>
          )}
        </>
      }
    >
      <div className="flex h-full min-h-[420px] gap-0 border border-rule">
        <aside className="w-[280px] shrink-0 overflow-y-auto border-r border-rule bg-paper-deep">
          {versions === null ? (
            <div className="flex items-center gap-2 p-5 text-ink-fade">
              <Spinner />
              <span className="font-mono uppercase tracking-[0.14em] text-[10px]">
                // LOADING
              </span>
            </div>
          ) : versions.length === 0 ? (
            <div className="p-5 font-serif italic text-ink-fade">
              No snapshots yet.
            </div>
          ) : (
            <ul>
              {versions.map((v) => {
                const active = selectedId === v._id;
                return (
                  <li key={v._id} className="border-b border-rule last:border-b-0">
                    <button
                      type="button"
                      onClick={() => void selectVersion(v._id)}
                      className={cn(
                        "relative w-full text-left px-5 py-4 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ink",
                        active
                          ? "bg-plum-haze"
                          : "hover:bg-paper",
                      )}
                    >
                      {active && (
                        <span
                          aria-hidden="true"
                          className="absolute left-0 top-0 bottom-0 w-[2px] bg-gold"
                        />
                      )}
                      <div className="font-mono uppercase tracking-[0.14em] text-[9px] text-ink-fade">
                        // #{shortId(v._id)}
                      </div>
                      <div className="mt-1 font-serif italic text-lg text-ink leading-tight">
                        {formatRelativeTime(v.createdAt)}
                      </div>
                      <div className="mt-1 font-mono uppercase tracking-[0.12em] text-[9px] text-ink-fade truncate">
                        // BY {v.createdByName}
                      </div>
                      <div className="mt-1 font-mono text-[9px] text-ink-fade/70">
                        {new Date(v.createdAt).toLocaleString()}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        <div className="relative min-h-0 flex-1 overflow-hidden bg-paper">
          {error && (
            <div className="absolute inset-x-4 top-4 z-10">
              <Alert variant="destructive">{error}</Alert>
            </div>
          )}
          {selected ? (
            <Excalidraw
              key={selectedId ?? "none"}
              initialData={{
                elements: selected.elements as never,
                appState: selected.appState as never,
                scrollToContent: true,
              }}
              viewModeEnabled
            />
          ) : (
            <div className="flex h-full items-center justify-center font-serif italic text-xl text-ink-fade">
              {versions && versions.length > 0
                ? "Select a version to preview."
                : "No versions to preview."}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
