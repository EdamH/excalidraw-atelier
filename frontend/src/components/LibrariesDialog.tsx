import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Trash2, UploadCloud } from "lucide-react";
import {
  ApiError,
  deleteLibrary,
  listLibraries,
  renameLibrary,
  uploadLibrary,
} from "../lib/api";
import { useAuth } from "../auth/AuthContext";
import type { LibraryListItem } from "../lib/types";
import { Modal } from "./ui/Modal";
import { Button } from "./ui/Button";
import { Alert } from "./ui/Alert";
import { Spinner } from "./ui/Spinner";
import { IconButton } from "./ui/IconButton";
import { formatRelativeTime } from "../lib/relativeTime";

interface Props {
  onClose: () => void;
  onChanged: () => void;
}

interface ParsedLibrary {
  name: string;
  libraryItems: unknown[];
}

export function LibrariesDialog({ onClose, onChanged }: Props) {
  const { token, logout } = useAuth();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [libraries, setLibraries] = useState<LibraryListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<ParsedLibrary | null>(null);
  const [pendingName, setPendingName] = useState("");
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const list = await listLibraries(token);
      setLibraries(list);
      setError(null);
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to load libraries");
    }
  }, [token, logout]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    setError(null);
    try {
      const text = await file.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        setError("// NOT A VALID .excalidrawlib FILE");
        return;
      }
      if (
        !parsed ||
        typeof parsed !== "object" ||
        (parsed as { type?: unknown }).type !== "excalidrawlib" ||
        !Array.isArray((parsed as { libraryItems?: unknown }).libraryItems)
      ) {
        setError("// NOT A VALID .excalidrawlib FILE");
        return;
      }
      const items = (parsed as { libraryItems: unknown[] }).libraryItems;
      const defaultName =
        file.name.replace(/\.excalidrawlib$/i, "") || "Untitled library";
      setPending({ name: defaultName, libraryItems: items });
      setPendingName(defaultName);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Parse failed");
    }
  }

  async function submitUpload(e: FormEvent) {
    e.preventDefault();
    if (!token || !pending) return;
    const name = pendingName.trim();
    if (!name) {
      setError("Name is required.");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      await uploadLibrary({ name, libraryItems: pending.libraryItems }, token);
      setPending(null);
      setPendingName("");
      await load();
      onChanged();
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
        return;
      }
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(lib: LibraryListItem) {
    if (!token) return;
    if (!window.confirm(`Delete library "${lib.name}"?`)) return;
    setRowBusy(lib._id);
    setError(null);
    try {
      await deleteLibrary(lib._id, token);
      await load();
      onChanged();
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
        return;
      }
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setRowBusy(null);
    }
  }

  async function commitRename(lib: LibraryListItem) {
    if (!token) return;
    const next = (renameDraft[lib._id] ?? lib.name).trim();
    if (!next || next === lib.name) {
      setRenameDraft((d) => {
        const copy = { ...d };
        delete copy[lib._id];
        return copy;
      });
      return;
    }
    setRowBusy(lib._id);
    setError(null);
    try {
      await renameLibrary(lib._id, next, token);
      setRenameDraft((d) => {
        const copy = { ...d };
        delete copy[lib._id];
        return copy;
      });
      await load();
      onChanged();
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
        return;
      }
      setError(err instanceof Error ? err.message : "Rename failed");
    } finally {
      setRowBusy(null);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Your libraries."
      description="MANAGE EXCALIDRAW LIBRARIES"
      size="lg"
      footer={
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="space-y-7">
        <section>
          <p className="mb-3 font-mono uppercase tracking-[0.14em] text-[10px] text-ink-fade">
            // INSTALLED &bull;{" "}
            {libraries === null
              ? "…"
              : `${String(libraries.length).padStart(2, "0")} ENTRIES`}
          </p>
          {libraries === null ? (
            <div className="border border-rule bg-paper-deep px-5 py-6 font-mono uppercase tracking-[0.14em] text-[10px] text-ink-fade inline-flex items-center gap-2">
              <Spinner size={12} /> // LOADING
            </div>
          ) : libraries.length === 0 ? (
            <div className="border border-rule bg-paper-deep px-5 py-6 font-serif italic text-base text-ink-fade">
              No libraries uploaded yet.
            </div>
          ) : (
            <ul className="border border-rule divide-y divide-rule bg-paper-deep">
              {libraries.map((lib) => {
                const draftValue = renameDraft[lib._id];
                const isEditing = draftValue !== undefined;
                const busy = rowBusy === lib._id;
                return (
                  <li
                    key={lib._id}
                    className="flex items-center gap-4 px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      {isEditing ? (
                        <input
                          value={draftValue}
                          autoFocus
                          onChange={(e) =>
                            setRenameDraft((d) => ({
                              ...d,
                              [lib._id]: e.target.value,
                            }))
                          }
                          onBlur={() => void commitRename(lib)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              void commitRename(lib);
                            } else if (e.key === "Escape") {
                              setRenameDraft((d) => {
                                const copy = { ...d };
                                delete copy[lib._id];
                                return copy;
                              });
                            }
                          }}
                          className="w-full rounded-none border-0 border-b border-ink bg-transparent px-0 pb-0.5 font-serif italic text-lg text-ink focus:outline-none focus:ring-0"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            setRenameDraft((d) => ({
                              ...d,
                              [lib._id]: lib.name,
                            }))
                          }
                          className="block max-w-full truncate text-left font-serif italic text-lg text-ink hover:text-plum"
                          title="Click to rename"
                        >
                          {lib.name}
                        </button>
                      )}
                      <div className="truncate font-mono text-[9px] uppercase tracking-[0.12em] text-ink-fade">
                        // {String(lib.itemCount).padStart(2, "0")} ITEM
                        {lib.itemCount === 1 ? "" : "S"} &middot; UPLOADED{" "}
                        {formatRelativeTime(lib.createdAt)}
                      </div>
                    </div>
                    {busy && <Spinner size={12} />}
                    <IconButton
                      label="Delete library"
                      variant="destructive"
                      disabled={busy}
                      onClick={() => void handleDelete(lib)}
                    >
                      <Trash2 />
                    </IconButton>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <div className="h-px w-full bg-rule" />

        <section>
          <p className="mb-3 font-mono uppercase tracking-[0.14em] text-[10px] text-ink-fade">
            // UPLOAD A NEW LIBRARY
          </p>
          <form onSubmit={submitUpload} className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-2 h-10 px-4 border border-ink/60 text-ink font-sans font-medium uppercase tracking-[0.18em] text-[11px] cursor-pointer hover:bg-ink hover:text-paper transition-colors">
                <UploadCloud size={14} />
                Choose file
                <input
                  ref={fileRef}
                  type="file"
                  accept=".excalidrawlib,application/json"
                  className="hidden"
                  onChange={(e) => void handleFileChange(e)}
                />
              </label>
              {pending && (
                <span className="font-mono uppercase tracking-[0.12em] text-[9px] text-ink-fade">
                  // {String(pending.libraryItems.length).padStart(2, "0")}{" "}
                  ITEM
                  {pending.libraryItems.length === 1 ? "" : "S"} READY
                </span>
              )}
            </div>

            {pending && (
              <div>
                <label
                  htmlFor="library-upload-name"
                  className="mb-1 block font-mono uppercase tracking-[0.16em] text-[10px] text-ink-fade"
                >
                  // LIBRARY NAME
                </label>
                <input
                  id="library-upload-name"
                  value={pendingName}
                  onChange={(e) => setPendingName(e.target.value)}
                  className="flex h-11 w-full rounded-none border-0 border-b border-rule bg-transparent px-0 text-base text-ink placeholder:italic placeholder:font-serif placeholder:text-ink-fade/60 focus:border-b-2 focus:border-ink focus:outline-none focus:ring-0"
                />
              </div>
            )}

            <div className="flex justify-end">
              <Button type="submit" disabled={!pending || uploading}>
                {uploading ? (
                  <>
                    <Spinner /> Uploading
                  </>
                ) : (
                  <>Upload &rarr;</>
                )}
              </Button>
            </div>
          </form>
        </section>

        {error && <Alert variant="destructive">{error}</Alert>}
      </div>
    </Modal>
  );
}
