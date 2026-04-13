import { useEffect, useState, type ReactNode } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  FileText,
  Flame,
  Moon,
  Puzzle,
  Trophy,
  Users,
  Zap,
} from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { getUserProfile } from "../lib/api";
import type { UserProfile } from "../lib/types";
import { Spinner } from "../components/ui/Spinner";
import { CardCornerBrackets } from "../components/ui/Card";
import { BrandMark } from "../components/BrandMark";
import { TamagotchiPet } from "../components/TamagotchiPet";

const AWARD_DISPLAY: Record<string, { icon: ReactNode; label: string }> = {
  gold: { icon: <Trophy size={20} className="text-gold" />, label: "Gold Medal" },
  silver: { icon: <Trophy size={20} className="text-ink-fade" />, label: "Silver Medal" },
  bronze: { icon: <Trophy size={20} className="text-ink-fade/50" />, label: "Bronze Medal" },
  "night-owl": { icon: <Moon size={20} />, label: "Night Owl" },
  "most-scenes": { icon: <FileText size={20} />, label: "Most Scenes" },
  berserker: { icon: <Zap size={20} />, label: "Berserker" },
  "template-creator": { icon: <Puzzle size={20} />, label: "Template Creator" },
  "community-man": { icon: <Users size={20} />, label: "Community Man" },
};

const FALLBACK_ICON = <Trophy size={20} />;

export function ProfilePage() {
  const { userId } = useParams<{ userId: string }>();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token || !userId) return;
    getUserProfile(userId, token)
      .then(setProfile)
      .finally(() => setLoading(false));
  }, [token, userId]);

  const badgeCounts = new Map<string, number>();
  if (profile) {
    for (const award of profile.awards) {
      badgeCounts.set(
        award.awardType,
        (badgeCounts.get(award.awardType) || 0) + 1,
      );
    }
  }

  return (
    <div className="min-h-screen bg-paper">
      <header className="bg-ink text-paper px-6 py-3 flex items-center gap-4">
        <button
          type="button"
          aria-label="Back"
          onClick={() => {
            if (window.history.length > 1) navigate(-1);
            else navigate("/");
          }}
          className="text-paper/60 hover:text-paper"
        >
          <ArrowLeft size={18} />
        </button>
        <BrandMark tone="paper" />
        <span className="font-mono uppercase tracking-[0.18em] text-[9px] text-paper/60">
          // PROFILE
        </span>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-10 opacity-0 animate-ink-bleed">
        {loading ? (
          <div className="flex justify-center py-20">
            <Spinner />
          </div>
        ) : !profile ? (
          <p className="font-serif italic text-ink-fade text-center py-20">
            User not found.
          </p>
        ) : (
          <>
            <div className="mb-8 border-b border-rule pb-6">
              <h1 className="font-serif italic text-4xl text-ink mb-1">
                {profile.user.name}
              </h1>
              <p className="font-mono uppercase tracking-[0.14em] text-[10px] text-ink-fade">
                // MEMBER SINCE{" "}
                {new Date(profile.user.createdAt).toLocaleDateString("en-US", {
                  month: "short",
                  year: "numeric",
                })}
              </p>
              {profile.streak > 0 && (
                <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 border border-gold bg-gold/5">
                  <Flame size={14} className="text-gold" />
                  <span className="font-mono uppercase tracking-[0.14em] text-[10px] text-gold-deep">
                    {profile.streak}-week streak
                  </span>
                </div>
              )}
            </div>

            {profile.pet && (
              <div className="mb-8">
                <TamagotchiPet
                  pet={{
                    mood: profile.pet.mood,
                    speech: profile.pet.speech,
                    name: profile.pet.name,
                    lastActivityAt: null,
                    lastActions: null,
                  }}
                  badges={[]}
                  onRename={async () => {}}
                  readOnly
                />
              </div>
            )}

            <section>
              <h2 className="font-mono uppercase tracking-[0.14em] text-[10px] text-ink-fade mb-4">
                // EARNED BADGES
              </h2>
              {badgeCounts.size === 0 ? (
                <p className="font-serif italic text-ink-fade">
                  No awards earned yet — keep sketching!
                </p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {Array.from(badgeCounts.entries()).map(([type, count]) => {
                    const display = AWARD_DISPLAY[type] || {
                      icon: FALLBACK_ICON,
                      label: type,
                    };
                    return (
                      <div
                        key={type}
                        className="relative border border-rule p-4 bg-paper text-center"
                      >
                        <CardCornerBrackets />
                        <span className="flex h-8 w-8 mx-auto items-center justify-center text-plum mb-2">
                          {display.icon}
                        </span>
                        <p className="font-serif italic text-sm text-ink">
                          {display.label}
                        </p>
                        <p className="font-mono uppercase tracking-[0.14em] text-[9px] text-ink-fade mt-1">
                          // ×{count}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {profile.awards.length > 0 && (
              <section className="mt-10">
                <h2 className="font-mono uppercase tracking-[0.14em] text-[10px] text-ink-fade mb-4">
                  // AWARD HISTORY
                </h2>
                <div className="space-y-2">
                  {profile.awards.slice(0, 20).map((award, i) => {
                    const display = AWARD_DISPLAY[award.awardType] || {
                      icon: FALLBACK_ICON,
                      label: award.awardType,
                    };
                    return (
                      <div
                        key={`${award.awardType}-${award.weekStart}-${i}`}
                        className="flex items-center gap-3 py-2 border-b border-rule last:border-b-0"
                      >
                        <span className="flex h-6 w-6 items-center justify-center text-plum [&_svg]:size-4">
                          {display.icon}
                        </span>
                        <span className="font-serif italic text-sm text-ink flex-1">
                          {display.label}
                        </span>
                        <span className="font-mono uppercase tracking-[0.14em] text-[9px] text-ink-fade">
                          {new Date(award.weekStart).toLocaleDateString(
                            "en-US",
                            { month: "short", day: "numeric" },
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
