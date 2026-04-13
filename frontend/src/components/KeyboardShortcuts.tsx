import { useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { useKeyboardShortcuts } from "../lib/useKeyboardShortcuts";
import { Modal } from "./ui/Modal";
import { Button } from "./ui/Button";

interface ShortcutRow {
  combo: string;
  label: string;
  adminOnly?: boolean;
}

const ROWS: ShortcutRow[] = [
  { combo: "⌘/Ctrl + K", label: "Focus the search input" },
  { combo: "/", label: "Focus the search input" },
  { combo: "⌘/Ctrl + N", label: "New document" },
  { combo: "Del / ⌘+⌫", label: "Delete selected cards" },
  { combo: "g then h", label: "Go to home" },
  { combo: "g then t", label: "Go to trash" },
  { combo: "g then a", label: "Go to admin", adminOnly: true },
  { combo: "?", label: "Show this help" },
  { combo: "Esc", label: "Close any open modal" },
];

export function KeyboardShortcuts() {
  const [helpOpen, setHelpOpen] = useState(false);
  const { user } = useAuth();
  useKeyboardShortcuts({ helpOpen, setHelpOpen });

  const visibleRows = ROWS.filter((r) => !r.adminOnly || user?.isAdmin);

  if (!helpOpen) return null;

  return (
    <Modal
      open
      onClose={() => setHelpOpen(false)}
      title="Keyboard shortcuts."
      description="A QUICK REFERENCE"
      size="lg"
      footer={
        <Button variant="ghost" onClick={() => setHelpOpen(false)}>
          Close
        </Button>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
        {visibleRows.map((row) => (
          <div
            key={row.combo + row.label}
            className="flex items-baseline justify-between gap-4 border-b border-rule pb-2"
          >
            <span className="font-serif italic text-base text-ink">
              {row.label}
            </span>
            <kbd className="font-mono uppercase tracking-[0.14em] text-[10px] text-ink-fade border border-rule px-2 py-1 bg-paper-deep">
              {row.combo}
            </kbd>
          </div>
        ))}
      </div>
    </Modal>
  );
}
