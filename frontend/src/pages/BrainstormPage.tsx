import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowUp, Trash2 } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import {
  createBrainstormIdea,
  deleteBrainstormIdea,
  listBrainstormIdeas,
  reactBrainstormIdea,
  voteBrainstormIdea,
} from "../lib/api";
import type { BrainstormIdeaItem } from "../lib/types";
import { Spinner } from "../components/ui/Spinner";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { ConfirmModal } from "../components/ui/ConfirmModal";
import { CardCornerBrackets } from "../components/ui/Card";
import { BrandMark } from "../components/BrandMark";
import { formatRelativeTime } from "../lib/relativeTime";
import { cn } from "../lib/cn";

const CATEGORIES = ["feature", "bug", "fun", "improvement"] as const;
const CATEGORY_LABELS: Record<string, string> = {
  feature: "Feature",
  bug: "Bug",
  fun: "Fun",
  improvement: "Improvement",
};
const CATEGORY_COLORS: Record<string, string> = {
  feature: "text-plum border-plum/30 bg-plum/5",
  bug: "text-ink-soft border-ink/30 bg-ink/5",
  fun: "text-gold-deep border-gold/30 bg-gold/5",
  improvement: "text-ink-soft border-ink/20 bg-ink/5",
};

export function BrainstormPage() {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [ideas, setIdeas] = useState<BrainstormIdeaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCat, setFilterCat] = useState<string>("");

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // New idea form
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [category, setCategory] = useState<string>("feature");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(() => {
    if (!token) return;
    listBrainstormIdeas(token, filterCat || undefined)
      .then(setIdeas)
      .finally(() => setLoading(false));
  }, [token, filterCat]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || !title.trim()) return;
    setSubmitting(true);
    try {
      const idea = await createBrainstormIdea(
        { title: title.trim(), description: desc.trim(), category },
        token,
      );
      setIdeas((prev) => [idea, ...prev]);
      setTitle("");
      setDesc("");
    } finally {
      setSubmitting(false);
    }
  };

  const handleVote = async (id: string) => {
    if (!token) return;
    try {
      const result = await voteBrainstormIdea(id, token);
      setIdeas((prev) =>
        prev.map((idea) =>
          idea._id === id
            ? { ...idea, voteCount: result.voteCount, hasVoted: result.hasVoted }
            : idea,
        ),
      );
    } catch {
      setError("Failed to register vote.");
    }
  };

  const handleReact = async (id: string, emoji: string) => {
    if (!token) return;
    // Optimistic update
    const prev = ideas;
    setIdeas((current) =>
      current.map((idea) => {
        if (idea._id !== id) return idea;
        const existing = idea.reactions.find((r) => r.emoji === emoji);
        if (existing) {
          return {
            ...idea,
            reactions: idea.reactions.map((r) =>
              r.emoji === emoji
                ? {
                    ...r,
                    count: r.hasReacted ? r.count - 1 : r.count + 1,
                    hasReacted: !r.hasReacted,
                  }
                : r,
            ),
          };
        }
        return {
          ...idea,
          reactions: [...idea.reactions, { emoji, count: 1, hasReacted: true }],
        };
      }),
    );
    try {
      await reactBrainstormIdea(id, emoji, token);
    } catch {
      setIdeas(prev);
      setError("Failed to react.");
    }
  };

  const handleDelete = async (id: string) => {
    if (!token) return;
    try {
      await deleteBrainstormIdea(id, token);
      setIdeas((prev) => prev.filter((i) => i._id !== id));
    } catch {
      setError("Failed to delete idea.");
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <div className="min-h-screen bg-paper">
      {/* Header */}
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
          // BRAINSTORM
        </span>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10 animate-ink-bleed">
        {/* Title */}
        <div className="mb-8 border-b border-rule pb-6">
          <h1 className="font-serif italic text-4xl text-ink mb-1">
            Letters to the Editor.
          </h1>
          <p className="font-mono uppercase tracking-[0.14em] text-[10px] text-ink-fade">
            // DROP YOUR IDEAS — NOTHING GETS LOST
          </p>
        </div>

        {/* Quick-add form */}
        <form
          onSubmit={handleSubmit}
          className="relative border border-rule p-4 mb-8 bg-paper"
        >
          <CardCornerBrackets />
          <div className="flex flex-col gap-3">
            <Input
              variant="editorial"
              placeholder="What's on your mind?"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
            <Input
              variant="editorial"
              placeholder="Optional details..."
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
            />
            <div className="flex items-center gap-3">
              <Select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-40"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </option>
                ))}
              </Select>
              <Button type="submit" disabled={!title.trim() || submitting}>
                {submitting ? "Posting..." : "Post idea"}
              </Button>
            </div>
          </div>
        </form>

        {/* Filter */}
        <div className="flex gap-2 mb-6 flex-wrap">
          <button
            type="button"
            onClick={() => setFilterCat("")}
            className={cn(
              "px-3 py-1 text-xs font-mono uppercase tracking-[0.14em] border transition-colors",
              !filterCat
                ? "bg-ink text-paper border-ink"
                : "border-rule text-ink-fade hover:text-ink",
            )}
          >
            All
          </button>
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setFilterCat(filterCat === c ? "" : c)}
              className={cn(
                "px-3 py-1 text-xs font-mono uppercase tracking-[0.14em] border transition-colors",
                filterCat === c
                  ? "bg-ink text-paper border-ink"
                  : "border-rule text-ink-fade hover:text-ink",
              )}
            >
              {CATEGORY_LABELS[c]}
            </button>
          ))}
        </div>

        {/* Ideas */}
        {loading ? (
          <div className="flex justify-center py-20">
            <Spinner />
          </div>
        ) : ideas.length === 0 ? (
          <p className="font-serif italic text-ink-fade text-center py-20">
            No ideas yet — be the first to post!
          </p>
        ) : (
          <div className="space-y-3">
            {ideas.map((idea) => (
              <div
                key={idea._id}
                className="relative border border-rule p-4 bg-paper"
              >
                <CardCornerBrackets />
                <div className="flex gap-4">
                  {/* Vote column */}
                  <button
                    type="button"
                    onClick={() => handleVote(idea._id)}
                    className={cn(
                      "flex flex-col items-center gap-0.5 shrink-0 pt-1 transition-colors",
                      idea.hasVoted ? "text-plum" : "text-ink-fade hover:text-ink",
                    )}
                  >
                    <ArrowUp size={16} />
                    <span className="font-mono text-xs">{idea.voteCount}</span>
                  </button>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-serif italic text-lg text-ink">
                        {idea.title}
                      </h3>
                      <span
                        className={cn(
                          "shrink-0 px-2 py-0.5 text-[9px] font-mono uppercase tracking-[0.14em] border",
                          CATEGORY_COLORS[idea.category] || "text-ink-fade border-rule",
                        )}
                      >
                        {idea.category}
                      </span>
                    </div>
                    {idea.description && (
                      <p className="text-sm text-ink-soft mt-1">
                        {idea.description}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-2">
                      <span className="font-mono uppercase tracking-[0.14em] text-[9px] text-ink-fade">
                        // {idea.authorName} · {formatRelativeTime(idea.createdAt)}
                      </span>
                    </div>
                    {/* Reactions */}
                    <div className="flex items-center gap-1.5 mt-2">
                      {idea.reactions.map((r) => (
                        <button
                          key={r.emoji}
                          type="button"
                          onClick={() => handleReact(idea._id, r.emoji)}
                          className={cn(
                            "inline-flex items-center gap-1 px-2 py-0.5 border text-xs transition-colors",
                            r.hasReacted
                              ? "border-plum/40 bg-plum/10"
                              : "border-rule hover:border-plum/30",
                          )}
                        >
                          <span>{r.emoji}</span>
                          {r.count > 0 && (
                            <span className="font-mono text-[10px] text-ink-fade">
                              {r.count}
                            </span>
                          )}
                        </button>
                      ))}
                      {(idea.authorId === user?.id || user?.isAdmin) && (
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(idea._id)}
                          className="ml-auto text-ink-fade hover:text-destructive transition-colors"
                          title="Delete idea"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="mt-4">
            <div
              className="border border-rule bg-paper-deep px-4 py-3 font-mono uppercase tracking-[0.14em] text-[10px] text-ink-fade cursor-pointer"
              onClick={() => setError(null)}
            >
              // {error}
            </div>
          </div>
        )}

        <ConfirmModal
          open={deleteTarget !== null}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => {
            if (deleteTarget) handleDelete(deleteTarget);
          }}
          title="Delete this idea?"
          description="This action cannot be undone."
          confirmLabel="Delete"
          variant="destructive"
        />
      </main>
    </div>
  );
}
