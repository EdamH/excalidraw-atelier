import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { getMyBadges } from "../lib/api";
import type { AchievementBadge } from "../lib/types";
import {
  BookOpen,
  FolderOpen,
  Hash,
  Lock,
  Moon,
  Pencil,
  Tag,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { cn } from "../lib/cn";

const BADGE_ICONS: Record<string, LucideIcon> = {
  "first-drawing": Pencil,
  prolific: BookOpen,
  "100-elements": Hash,
  "shared-5": Users,
  "night-owl": Moon,
  "speed-demon": Zap,
  organizer: FolderOpen,
  "tag-master": Tag,
};

interface BadgesShowcaseProps {
  prefetchedBadges?: AchievementBadge[];
}

export function BadgesShowcase({ prefetchedBadges }: BadgesShowcaseProps) {
  const { token } = useAuth();
  const [badges, setBadges] = useState<AchievementBadge[]>([]);
  const [loading, setLoading] = useState(() => !prefetchedBadges);

  useEffect(() => {
    if (prefetchedBadges) {
      setBadges(prefetchedBadges);
      setLoading(false);
      return;
    }
    if (!token) return;
    getMyBadges(token)
      .then(setBadges)
      .finally(() => setLoading(false));
  }, [token, prefetchedBadges]);

  if (loading) {
    return (
      <div className="mt-6 pt-6 border-t border-rule">
        <h3 className="font-mono uppercase tracking-[0.14em] text-[10px] text-ink-fade mb-3">
          // ACHIEVEMENTS
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="relative p-3 border border-rule bg-paper-deep min-h-[80px] animate-pulse-soft"
            >
              <div className="h-5 w-5 mx-auto mb-1 bg-ink-fade/10" />
              <div className="h-3 w-2/3 mx-auto bg-ink-fade/10 mt-1" />
              <div className="h-2 w-4/5 mx-auto bg-ink-fade/10 mt-1" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const earned = badges.filter((b) => b.earned).length;

  return (
    <div className="mt-6 pt-6 border-t border-rule">
      <h3 className="font-mono uppercase tracking-[0.14em] text-[10px] text-ink-fade mb-3">
        // ACHIEVEMENTS · {earned}/{badges.length}
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {badges.map((badge) => (
          <div
            key={badge.id}
            className={cn(
              "relative p-3 border text-center transition-colors",
              badge.earned
                ? "border-plum/40 bg-plum/5"
                : "border-rule bg-paper-deep opacity-50",
            )}
          >
            <span className="flex justify-center mb-1">
              {badge.earned ? (
                (() => {
                  const Icon = BADGE_ICONS[badge.id];
                  return Icon ? (
                    <Icon size={20} className="text-plum" />
                  ) : (
                    <Pencil size={20} className="text-plum" />
                  );
                })()
              ) : (
                <Lock size={20} className="mx-auto text-ink-fade" />
              )}
            </span>
            <p className="font-serif italic text-xs text-ink leading-tight">
              {badge.name}
            </p>
            <p className="font-mono uppercase tracking-[0.12em] text-[9px] text-ink-fade mt-0.5 leading-tight">
              {badge.description}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
