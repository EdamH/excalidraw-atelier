import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { Pencil } from "lucide-react";
import { cn } from "../../lib/cn";

interface Props {
  value: string;
  onSubmit: (next: string) => Promise<void> | void;
  /** Whether the user is allowed to edit (e.g. owner). When false, just renders the value. */
  canEdit: boolean;
  /** Tailwind classes for the displayed text. */
  className?: string;
  /** Optional inline style for the displayed text. */
  style?: CSSProperties;
  /** Aria label for the edit button when collapsed. */
  ariaLabel?: string;
  /** Tone variant — affects hover/edit affordance colors. */
  tone?: "ink" | "paper";
}

export function InlineRename({
  value,
  onSubmit,
  canEdit,
  className,
  style,
  ariaLabel = "Rename",
  tone = "ink",
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  async function commit() {
    const next = draft.trim();
    if (!next || next === value) {
      setEditing(false);
      setDraft(value);
      return;
    }
    setBusy(true);
    try {
      await onSubmit(next);
      setEditing(false);
    } catch {
      // Caller is expected to surface errors via its own state.
      setDraft(value);
      setEditing(false);
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      void commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setDraft(value);
      setEditing(false);
    }
  }

  const inputColors =
    tone === "paper"
      ? "text-paper border-b-2 border-gold/80 focus:border-gold"
      : "text-ink border-b-2 border-ink/40 focus:border-ink";

  if (!canEdit) {
    return (
      <span className={className} style={style}>
        {value}
      </span>
    );
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => void commit()}
        disabled={busy}
        spellCheck={false}
        className={cn(
          "min-w-0 max-w-full bg-transparent outline-none px-0 py-0 disabled:opacity-60",
          inputColors,
          className,
        )}
        style={style}
      />
    );
  }

  const hoverColor =
    tone === "paper"
      ? "hover:text-gold"
      : "hover:text-plum";

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      title={ariaLabel}
      aria-label={ariaLabel}
      className={cn(
        "group/rename inline-flex max-w-full items-center gap-1.5 bg-transparent text-left transition-colors",
        hoverColor,
        className,
      )}
      style={style}
    >
      <span className="min-w-0 truncate">{value}</span>
      <Pencil
        size={11}
        className="shrink-0 opacity-0 transition-opacity group-hover/rename:opacity-70"
        aria-hidden
      />
    </button>
  );
}
