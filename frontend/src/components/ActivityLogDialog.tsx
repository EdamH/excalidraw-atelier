import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { getSceneActivity } from "../lib/api";
import type { ActivityLogItem } from "../lib/types";
import { Modal } from "./ui/Modal";
import { Spinner } from "./ui/Spinner";
import { formatRelativeTime } from "../lib/relativeTime";

const ACTION_VERBS: Record<string, string> = {
  created: "created this scene",
  edited: "edited",
  renamed: "renamed",
  moved: "moved to a folder",
  tagged: "updated tags",
  shared: "shared",
  unshared: "removed a share",
  deleted: "moved to trash",
  restored: "restored from trash",
  duplicated: "duplicated",
  transferred: "transferred ownership",
};

interface ActivityLogDialogProps {
  open: boolean;
  onClose: () => void;
  sceneId: string;
}

export function ActivityLogDialog({
  open,
  onClose,
  sceneId,
}: ActivityLogDialogProps) {
  const { token } = useAuth();
  const [entries, setEntries] = useState<ActivityLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    if (!open || !token || !sceneId) return;
    let cancelled = false;
    setLoading(true);
    setEntries([]);
    setHasMore(false);
    getSceneActivity(sceneId, token)
      .then((data) => {
        if (!cancelled) {
          setEntries(data.items);
          setHasMore(data.hasMore);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, token, sceneId]);

  const loadMore = useCallback(() => {
    if (!token || !sceneId || loadingMore || entries.length === 0) return;
    const lastEntry = entries[entries.length - 1];
    setLoadingMore(true);
    getSceneActivity(sceneId, token, lastEntry.createdAt)
      .then((data) => {
        setEntries((prev) => [...prev, ...data.items]);
        setHasMore(data.hasMore);
      })
      .finally(() => setLoadingMore(false));
  }, [token, sceneId, loadingMore, entries]);

  return (
    <Modal open={open} onClose={onClose} title="Activity." size="md">
      {loading ? (
        <div className="flex items-center gap-3 py-10 text-ink-fade">
          <Spinner size={14} />
          <span className="font-mono uppercase tracking-[0.14em] text-[10px]">
            // LOADING ACTIVITY
          </span>
        </div>
      ) : entries.length === 0 ? (
        <p className="font-serif italic text-ink-fade py-10 text-center">
          No activity recorded yet.
        </p>
      ) : (
        <div className="space-y-0 divide-y divide-rule max-h-[400px] overflow-y-auto">
          {entries.map((entry) => (
            <div key={entry._id} className="py-3 flex items-start gap-3">
              <span className="shrink-0 flex h-6 w-6 items-center justify-center bg-plum/10 text-plum font-serif italic text-xs">
                {entry.userName.charAt(0).toUpperCase()}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-ink">
                  <Link
                    to={`/profile/${entry.userId}`}
                    onClick={onClose}
                    className="font-serif italic hover:text-plum transition-colors"
                  >
                    {entry.userName}
                  </Link>{" "}
                  <span className="text-ink-soft">
                    {ACTION_VERBS[entry.action] || entry.action}
                  </span>
                  {entry.detail && (
                    <span className="text-ink-fade"> — {entry.detail}</span>
                  )}
                </p>
                <p className="font-mono uppercase tracking-[0.12em] text-[9px] text-ink-fade mt-0.5">
                  // {formatRelativeTime(entry.createdAt)}
                </p>
              </div>
            </div>
          ))}
          {hasMore && (
            <div className="py-3 text-center">
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="font-mono uppercase tracking-[0.14em] text-[10px] text-plum hover:text-plum-deep transition-colors disabled:opacity-50"
              >
                {loadingMore ? (
                  <span className="inline-flex items-center gap-2">
                    <Spinner size={10} /> // LOADING
                  </span>
                ) : (
                  "// LOAD MORE"
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
