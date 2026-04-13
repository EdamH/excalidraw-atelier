import { useState, type FormEvent } from "react";
import { ApiError, createTemplate } from "../lib/api";
import { useAuth } from "../auth/AuthContext";
import { Modal } from "./ui/Modal";
import { Button } from "./ui/Button";
import { Alert } from "./ui/Alert";
import { Spinner } from "./ui/Spinner";

interface Props {
  onClose: () => void;
  onSaved: () => void;
  getElements: () => readonly unknown[];
  getAppState: () => Record<string, unknown>;
  defaultName?: string;
}

export function SaveAsTemplateDialog({
  onClose,
  onSaved,
  getElements,
  getAppState,
  defaultName,
}: Props) {
  const { token, logout } = useAuth();
  const [name, setName] = useState(defaultName ?? "");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    if (!name.trim() || !description.trim()) {
      setError("Name and description are required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createTemplate(
        {
          name: name.trim(),
          description: description.trim(),
          elements: getElements(),
          appState: getAppState(),
        },
        token,
      );
      onSaved();
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
        return;
      }
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Save as template."
      description="ADMIN ONLY"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button form="save-template-form" type="submit" disabled={busy}>
            {busy ? (
              <>
                <Spinner /> Saving
              </>
            ) : (
              <>Save &rarr;</>
            )}
          </Button>
        </>
      }
    >
      <form id="save-template-form" onSubmit={submit} className="space-y-5">
        <div>
          <label className="mb-1 block font-mono uppercase tracking-[0.16em] text-[10px] text-ink-fade">
            // NAME
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            className="flex h-11 w-full rounded-none border-0 border-b border-rule bg-transparent px-0 text-base text-ink placeholder:italic placeholder:font-serif placeholder:text-ink-fade/60 focus:border-b-2 focus:border-ink focus:outline-none focus:ring-0"
          />
        </div>
        <div>
          <label className="mb-1 block font-mono uppercase tracking-[0.16em] text-[10px] text-ink-fade">
            // DESCRIPTION
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="flex w-full rounded-none border-0 border-b border-rule bg-transparent px-0 py-2 text-base text-ink placeholder:italic placeholder:font-serif placeholder:text-ink-fade/60 focus:border-b-2 focus:border-ink focus:outline-none focus:ring-0 resize-none"
          />
        </div>
        {error && <Alert variant="destructive">{error}</Alert>}
      </form>
    </Modal>
  );
}
