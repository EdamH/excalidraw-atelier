import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ApiError, getMyStats, getMyBadges, updatePetName, interactWithPet } from "../lib/api";
import type { UserStats, AchievementBadge } from "../lib/types";
import { formatBytes } from "../lib/formatBytes";
import { formatRelativeTime } from "../lib/relativeTime";
import { Flame } from "lucide-react";
import { Alert } from "./ui/Alert";
import { Modal } from "./ui/Modal";
import { Spinner } from "./ui/Spinner";
import { QuotaBar } from "./QuotaBar";
import { BadgesShowcase } from "./BadgesShowcase";
import { TamagotchiPet } from "./TamagotchiPet";

interface StatsDashboardProps {
  open: boolean;
  onClose: () => void;
}

export function StatsDashboard({ open, onClose }: StatsDashboardProps) {
  const { token, logout } = useAuth();
  const [stats, setStats] = useState<UserStats | null>(null);
  const [badges, setBadges] = useState<AchievementBadge[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !token) return;
    let cancelled = false;
    setStats(null);
    setBadges([]);
    setError(null);
    (async () => {
      try {
        const [statsRes, badgesRes] = await Promise.all([
          getMyStats(token),
          getMyBadges(token).catch(() => [] as AchievementBadge[]),
        ]);
        if (cancelled) return;
        setStats(statsRes);
        setBadges(badgesRes);
      } catch (err: unknown) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          logout();
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to load stats");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, token, logout]);

  return (
    <Modal open={open} onClose={onClose} title="Your atelier." size="lg">
      {error && (
        <div className="mb-5">
          <Alert variant="destructive">{error}</Alert>
        </div>
      )}
      {!stats && !error ? (
        <div className="flex items-center gap-3 py-10 text-ink-fade">
          <Spinner size={14} />
          <span className="font-mono uppercase tracking-[0.14em] text-[10px]">
            // LOADING STATS
          </span>
        </div>
      ) : stats ? (
        <div className="space-y-6">
          {/* Tamagotchi Pet */}
          {stats.pet && (
            <TamagotchiPet
              pet={stats.pet}
              badges={badges}
              onRename={async (name) => {
                await updatePetName(token!, name);
                setStats((prev) =>
                  prev?.pet ? { ...prev, pet: { ...prev.pet, name } } : prev
                );
              }}
              onInteract={async (action) => {
                await interactWithPet(token!, action);
              }}
            />
          )}

          {/* Storage section */}
          <div className="border border-rule p-5">
            <QuotaBar variant="full" usage={stats.quotaUsage} />
          </div>

          {/* Two-column grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-rule border border-rule">
            <StatCell
              label="// SCENE COUNT"
              value={String(stats.sceneCount)}
              decorativeNumeral={String(stats.sceneCount).padStart(2, "0")}
            />
            <StatCell
              label="// TOTAL ELEMENTS"
              value={String(stats.totalElements)}
              decorativeNumeral={
                stats.totalElements > 0
                  ? String(stats.totalElements % 100).padStart(2, "0")
                  : undefined
              }
            />
            <StatCell
              label="// STORAGE USED"
              value={formatBytes(stats.totalBytes)}
            />
            <StatCell
              label="// DRAWING STREAK"
              value={
                <span className="inline-flex items-center gap-2">
                  {stats.drawingStreak ?? 0} day{(stats.drawingStreak ?? 0) === 1 ? '' : 's'}
                  {(stats.drawingStreak ?? 0) > 0 && <Flame size={18} className="text-gold" />}
                </span>
              }
            />
            <StatCell
              label="// LONGEST STREAK"
              value={
                <span className="inline-flex items-center gap-2">
                  {stats.longestStreak ?? 0} day{(stats.longestStreak ?? 0) === 1 ? '' : 's'}
                </span>
              }
            />
            {stats.largestScene ? (
              <StatCell
                label="// LARGEST SCENE"
                value={
                  <Link
                    to={`/d/${encodeURIComponent(stats.largestScene.id)}`}
                    onClick={onClose}
                    className="font-serif italic text-2xl text-ink hover:text-plum transition-colors truncate block"
                  >
                    {stats.largestScene.title}
                  </Link>
                }
                footer={formatBytes(stats.largestScene.size)}
              />
            ) : (
              <StatCell label="// LARGEST SCENE" value="—" />
            )}
            {stats.oldestScene && (
              <StatCell
                label="// OLDEST"
                value={stats.oldestScene.title}
                footer={formatRelativeTime(stats.oldestScene.createdAt)}
              />
            )}
            {stats.newestScene && (
              <StatCell
                label="// NEWEST"
                value={stats.newestScene.title}
                footer={formatRelativeTime(stats.newestScene.createdAt)}
              />
            )}
          </div>

          {/* Word Cloud */}
          {stats.topWords && stats.topWords.length > 0 && (
            <div className="mt-6 pt-6 border-t border-rule">
              <h3 className="font-mono uppercase tracking-[0.14em] text-[10px] text-ink-fade mb-3">
                // YOUR VOCABULARY
              </h3>
              <div className="flex flex-wrap gap-2">
                {stats.topWords.map((word, i) => (
                  <span
                    key={word}
                    className="font-serif italic text-ink/80"
                    style={{ fontSize: `${Math.max(24 - i * 2, 12)}px` }}
                  >
                    {word}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Achievement Badges */}
          <BadgesShowcase prefetchedBadges={badges.length > 0 ? badges : undefined} />
        </div>
      ) : null}
    </Modal>
  );
}

interface StatCellProps {
  label: string;
  value: React.ReactNode;
  footer?: string;
  decorativeNumeral?: string;
}

function StatCell({ label, value, footer, decorativeNumeral }: StatCellProps) {
  return (
    <div className="relative bg-paper px-5 py-5 overflow-hidden min-h-[110px]">
      {decorativeNumeral && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-0 font-serif italic text-6xl text-ink-fade/20 leading-none select-none"
        >
          {decorativeNumeral}
        </span>
      )}
      <p className="relative font-mono uppercase tracking-[0.14em] text-[10px] text-ink-fade">
        {label}
      </p>
      <div className="relative mt-3 font-serif italic text-2xl text-ink leading-tight truncate">
        {value}
      </div>
      {footer && (
        <p className="relative mt-1 font-mono uppercase tracking-[0.12em] text-[9px] text-ink-fade truncate">
          // {footer}
        </p>
      )}
    </div>
  );
}
