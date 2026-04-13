import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { ApiError, listTags, setSceneTags } from "../lib/api";
import { useAuth } from "../auth/AuthContext";
import { cn } from "../lib/cn";

interface Props {
  sceneId: string;
  tags: string[];
  onChange: (tags: string[]) => void;
}

function normalize(tag: string): string {
  return tag.trim().toLowerCase().replace(/\s+/g, "-");
}

export function TagEditor({ sceneId, tags, onChange }: Props) {
  const { token, logout } = useAuth();
  const [input, setInput] = useState("");
  const [allTags, setAllTags] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Fetch the universe of tags once on mount.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const handle = window.setTimeout(async () => {
      try {
        const list = await listTags(token);
        if (cancelled) return;
        setAllTags(list);
      } catch (err: unknown) {
        if (err instanceof ApiError && err.status === 401) logout();
      }
    }, 150);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [token, logout]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  async function persist(next: string[]): Promise<void> {
    if (!token) return;
    onChange(next);
    try {
      await setSceneTags(sceneId, next, token);
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) logout();
      // Silent fail — caller already updated optimistically.
    }
  }

  async function addTag(raw: string): Promise<void> {
    const tag = normalize(raw);
    if (!tag) return;
    if (tags.includes(tag)) {
      setInput("");
      return;
    }
    const next = [...tags, tag];
    setInput("");
    setOpen(false);
    setAllTags((prev) => (prev.includes(tag) ? prev : [...prev, tag]));
    await persist(next);
  }

  async function removeTag(tag: string): Promise<void> {
    const next = tags.filter((t) => t !== tag);
    await persist(next);
  }

  const q = input.trim().toLowerCase();
  const suggestions = q
    ? allTags
        .filter((t) => t.includes(q) && !tags.includes(t))
        .slice(0, 6)
    : [];

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      if (open && suggestions.length > 0 && q) {
        const choice = suggestions[highlight] ?? input;
        void addTag(choice);
      } else {
        void addTag(input);
      }
      return;
    }
    if (e.key === "Backspace" && !input && tags.length > 0) {
      e.preventDefault();
      void removeTag(tags[tags.length - 1]);
      return;
    }
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => (h + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight(
        (h) => (h - 1 + suggestions.length) % suggestions.length,
      );
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b border-rule bg-paper-deep">
      <span className="font-mono uppercase tracking-[0.18em] text-[9px] text-ink-fade shrink-0">
        // TAGS
      </span>
      <div className="flex flex-wrap items-center gap-1.5 flex-1">
        {tags.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1 border border-rule bg-paper px-2 py-0.5 font-mono uppercase tracking-[0.12em] text-[9px] text-ink"
          >
            {t}
            <button
              type="button"
              aria-label={`Remove tag ${t}`}
              onClick={() => void removeTag(t)}
              className="text-ink-fade hover:text-destructive"
            >
              <X size={9} />
            </button>
          </span>
        ))}
        <div ref={wrapRef} className="relative">
          <input
            type="text"
            value={input}
            autoFocus
            onChange={(e) => {
              setInput(e.target.value);
              setOpen(true);
              setHighlight(0);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder={tags.length === 0 ? "add a tag…" : "+"}
            className="h-6 w-[120px] bg-transparent border-0 border-b border-transparent hover:border-rule focus:border-ink focus:outline-none focus:ring-0 px-1 font-mono uppercase tracking-[0.10em] text-[10px] text-ink placeholder:text-ink-fade/60 placeholder:normal-case placeholder:tracking-normal placeholder:font-serif placeholder:italic"
          />
          {open && suggestions.length > 0 && (
            <div className="absolute left-0 top-full z-20 mt-1 min-w-[160px] border border-rule bg-paper shadow-[0_18px_40px_-22px_rgba(26,14,46,0.45)]">
              <ul className="max-h-56 overflow-auto divide-y divide-rule">
                {suggestions.map((s, i) => (
                  <li key={s}>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => void addTag(s)}
                      onMouseEnter={() => setHighlight(i)}
                      className={cn(
                        "flex w-full items-center px-3 py-1.5 text-left font-mono uppercase tracking-[0.12em] text-[10px] text-ink transition-colors",
                        i === highlight
                          ? "bg-plum-haze"
                          : "bg-paper hover:bg-plum-haze/60",
                      )}
                    >
                      {s}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
