import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  FileText,
  Moon,
  Trophy,
  Users,
  Puzzle,
  Zap,
} from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { getWeeklyLeaderboard } from "../lib/api";
import type { WeeklyLeaderboard } from "../lib/types";
import { Spinner } from "../components/ui/Spinner";
import { Alert } from "../components/ui/Alert";
import { CardCornerBrackets } from "../components/ui/Card";
import { BrandMark } from "../components/BrandMark";
import type { ReactNode } from "react";

const RANK_COLORS: Record<number, string> = {
  1: "border-l-2 border-l-gold",
  2: "border-l-2 border-l-ink-fade",
  3: "border-l-2 border-l-ink-fade/50",
};

const AWARD_ICONS: Record<string, ReactNode> = {
  "night-owl": <Moon size={18} />,
  "most-scenes": <FileText size={18} />,
  berserker: <Zap size={18} />,
  "template-creator": <Puzzle size={18} />,
  "community-man": <Users size={18} />,
};

export function LeaderboardPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<WeeklyLeaderboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    getWeeklyLeaderboard(token)
      .then(setData)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load"),
      )
      .finally(() => setLoading(false));
  }, [token]);

  const weekLabel = data
    ? `${new Date(data.weekStart).toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${new Date(data.weekEnd).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
    : "";

  return (
    <div className="min-h-screen bg-paper">
      <header className="bg-ink text-paper px-6 py-3 flex items-center gap-4">
        <button
          type="button"
          aria-label="Back"
          onClick={() => navigate("/")}
          className="text-paper/60 hover:text-paper"
        >
          <ArrowLeft size={18} />
        </button>
        <BrandMark tone="paper" />
        <span className="font-mono uppercase tracking-[0.18em] text-[9px] text-paper/60">
          // LEADERBOARD
        </span>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10 opacity-0 animate-ink-bleed">
        <div className="mb-8 border-b border-rule pb-6">
          <h1 className="font-serif italic text-4xl text-ink mb-1 flex items-center gap-3">
            <Trophy size={32} className="text-gold" />
            Person of the Week.
          </h1>
          <p className="font-mono uppercase tracking-[0.14em] text-[10px] text-ink-fade">
            // {weekLabel}
          </p>
        </div>

        {error && (
          <div className="mb-6">
            <Alert variant="destructive">{error}</Alert>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-20">
            <Spinner />
          </div>
        ) : !data ? (
          <p className="font-serif italic text-ink-fade text-center py-20">
            No data available yet.
          </p>
        ) : (
          <>
            <section className="mb-12">
              <h2 className="font-mono uppercase tracking-[0.14em] text-[10px] text-ink-fade mb-4">
                // TOP SKETCHERS
              </h2>
              {data.topEditors.length === 0 ? (
                <p className="font-serif italic text-ink-fade">
                  No edits this week — everyone is coding!
                </p>
              ) : (
                <div className="space-y-3">
                  {data.topEditors.map((editor) => (
                    <div
                      key={editor.userId}
                      className={`relative border border-rule p-5 bg-paper ${RANK_COLORS[editor.rank] || ""}`}
                    >
                      <CardCornerBrackets />
                      <div className="flex items-center gap-4">
                        <span className="font-serif italic text-4xl text-gold leading-none w-14 text-center">
                          {editor.rank === 1
                            ? "1st"
                            : editor.rank === 2
                              ? "2nd"
                              : "3rd"}
                        </span>
                        <div className="flex-1 min-w-0">
                          <Link
                            to={`/profile/${editor.userId}`}
                            className="font-serif italic text-xl text-ink hover:text-plum transition-colors"
                          >
                            {editor.name}
                          </Link>
                          <p className="font-mono uppercase tracking-[0.14em] text-[10px] text-ink-fade mt-0.5">
                            // {editor.editCount} SCENES TOUCHED
                          </p>
                        </div>
                        <span className="font-serif italic text-5xl text-ink/10">
                          {String(editor.rank).padStart(2, "0")}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {data.honorary.length > 0 && (
              <section>
                <h2 className="font-mono uppercase tracking-[0.14em] text-[10px] text-ink-fade mb-4">
                  // HONORARY AWARDS
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {data.honorary.map((award) => (
                    <div
                      key={award.awardType}
                      className="relative border border-rule p-4 bg-paper"
                    >
                      <CardCornerBrackets />
                      <div className="flex items-start gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-rule text-plum">
                          {AWARD_ICONS[award.awardType] || (
                            <Trophy size={18} />
                          )}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="font-serif italic text-lg text-ink">
                            {award.label}
                          </p>
                          <p className="font-mono uppercase tracking-[0.14em] text-[9px] text-ink-fade mt-0.5">
                            {award.description}
                          </p>
                          <div className="mt-2 flex items-center gap-2">
                            <Link
                              to={`/profile/${award.userId}`}
                              className="font-serif italic text-sm text-plum hover:underline"
                            >
                              {award.name}
                            </Link>
                            <span className="font-mono text-[10px] text-gold-deep">
                              ({award.value})
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
