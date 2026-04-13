import { useState, type FormEvent } from "react";
import { ApiError, copyScene } from "../lib/api";
import { useAuth } from "../auth/AuthContext";
import { Modal } from "./ui/Modal";
import { Button } from "./ui/Button";
import { Alert } from "./ui/Alert";
import { Spinner } from "./ui/Spinner";

interface Props {
  sourceId: string;
  sourceTitle: string;
  onClose: () => void;
  onDuplicated: (newId: string) => void;
}

export function DuplicateDialog({
  sourceId,
  sourceTitle,
  onClose,
  onDuplicated,
}: Props) {
  const { token, logout } = useAuth();
  const [title, setTitle] = useState(`Copy of ${sourceTitle}`);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const created = await copyScene(sourceId, { title: title.trim() }, token);
      onDuplicated(created._id);
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
        return;
      }
      setError(err instanceof Error ? err.message : "Duplicate failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Duplicate."
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button form="duplicate-form" type="submit" disabled={busy}>
            {busy ? (
              <>
                <Spinner /> Duplicating
              </>
            ) : (
              <>Create Copy &rarr;</>
            )}
          </Button>
        </>
      }
    >
      <form id="duplicate-form" onSubmit={submit} className="space-y-6">
        <p className="font-mono uppercase tracking-[0.14em] text-[10px] text-ink-fade">
          // FROM &ldquo;{sourceTitle}&rdquo;
        </p>
        <div>
          <label
            htmlFor="duplicate-title"
            className="mb-1 block font-mono uppercase tracking-[0.16em] text-[10px] text-ink-fade"
          >
            // NEW TITLE
          </label>
          <input
            id="duplicate-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
            className="flex h-11 w-full rounded-none border-0 border-b border-rule bg-transparent px-0 text-base text-ink placeholder:italic placeholder:font-serif placeholder:text-ink-fade/60 focus:border-b-2 focus:border-ink focus:outline-none focus:ring-0"
          />
        </div>
        {error && <Alert variant="destructive">{error}</Alert>}
      </form>
    </Modal>
  );
}
