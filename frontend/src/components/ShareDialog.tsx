import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { cn } from "../lib/cn";
import { Trash2 } from "lucide-react";
import {
  ApiError,
  addShare,
  getScene,
  removeShare,
  searchUsers,
  transferOwnership,
} from "../lib/api";
import { useAuth } from "../auth/AuthContext";
import type {
  SceneDetail,
  SceneShare,
  UserSearchResult,
} from "../lib/types";
import { Modal } from "./ui/Modal";
import { Button } from "./ui/Button";
import { Select } from "./ui/Select";
import { Alert } from "./ui/Alert";
import { Spinner } from "./ui/Spinner";
import { IconButton } from "./ui/IconButton";

const EMPTY_EXCLUDE: readonly string[] = [];

interface Props {
  scene: SceneDetail;
  onClose: () => void;
  onUpdated: (scene: SceneDetail) => void;
}

export function ShareDialog({ scene, onClose, onUpdated }: Props) {
  const { user, token, logout } = useAuth();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"viewer" | "editor">("editor");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Transfer ownership state
  const [transferEmail, setTransferEmail] = useState("");
  const [transferName, setTransferName] = useState<string | null>(null);
  const [transferBusy, setTransferBusy] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);

  // Already-shared user IDs are excluded server-side from the results.
  const excludeIds = useMemo(
    () => scene.shares.map((s) => s.userId),
    [scene.shares],
  );

  async function refresh() {
    if (!token) return;
    try {
      const fresh = await getScene(scene._id, token);
      onUpdated(fresh);
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) logout();
    }
  }

  async function addOne(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    if (user && email.trim().toLowerCase() === user.email.toLowerCase()) {
      setError("You can't share a document with yourself.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await addShare(scene._id, email, role, token);
      setEmail("");
      await refresh();
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
        return;
      }
      setError(err instanceof Error ? err.message : "Add share failed");
    } finally {
      setBusy(false);
    }
  }

  async function doTransfer(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    const target = transferEmail.trim();
    if (!target) {
      setTransferError("Pick a member first.");
      return;
    }
    const displayName = transferName ?? target;
    const confirmed = window.confirm(
      `Transfer ownership of "${scene.title}" to ${displayName}? You will become an editor and will no longer be able to share or delete it.`,
    );
    if (!confirmed) return;
    setTransferBusy(true);
    setTransferError(null);
    try {
      const updated = await transferOwnership(scene._id, target, token);
      onUpdated(updated);
      onClose();
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
        return;
      }
      setTransferError(
        err instanceof Error ? err.message : "Transfer failed",
      );
    } finally {
      setTransferBusy(false);
    }
  }

  async function changeRole(share: SceneShare, newRole: "viewer" | "editor") {
    if (!token) return;
    setError(null);
    try {
      await addShare(scene._id, share.email, newRole, token);
      await refresh();
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
        return;
      }
      setError(err instanceof Error ? err.message : "Update failed");
    }
  }

  async function remove(share: SceneShare) {
    if (!token) return;
    setError(null);
    try {
      await removeShare(scene._id, share.userId, token);
      await refresh();
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
        return;
      }
      setError(err instanceof Error ? err.message : "Remove failed");
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="People with access."
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
            // CURRENT ACCESS &bull; {scene.shares.length} ENTRIES
          </p>
          {scene.shares.length === 0 ? (
            <div className="border border-rule bg-paper-deep px-5 py-6 font-serif italic text-base text-ink-fade">
              No one has been invited yet.
            </div>
          ) : (
            <ul className="border border-rule divide-y divide-rule bg-paper-deep">
              {scene.shares.map((s) => (
                <li
                  key={s.userId}
                  className="flex items-center gap-4 px-4 py-3 animate-smooth-fade-in opacity-0 [animation-fill-mode:forwards]"
                >
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center bg-paper border border-rule font-serif italic text-base text-plum"
                    aria-hidden="true"
                  >
                    {(s.name || s.email).charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-ink">
                      {s.name}
                    </div>
                    <div className="truncate font-mono text-[9px] uppercase tracking-[0.12em] text-ink-fade">
                      // {s.email}
                    </div>
                  </div>
                  <Select
                    value={s.role}
                    onChange={(e) =>
                      void changeRole(
                        s,
                        e.target.value as "viewer" | "editor",
                      )
                    }
                    className="w-[96px]"
                  >
                    <option value="viewer">viewer</option>
                    <option value="editor">editor</option>
                  </Select>
                  <IconButton
                    label="Remove access"
                    variant="destructive"
                    onClick={() => void remove(s)}
                  >
                    <Trash2 />
                  </IconButton>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="h-px w-full bg-rule" />

        <section>
          <p className="mb-3 font-mono uppercase tracking-[0.14em] text-[10px] text-ink-fade">
            // INVITE BY EMAIL
          </p>
          <form
            onSubmit={addOne}
            className="flex flex-wrap items-end gap-4"
          >
            <div className="relative flex-1 min-w-[220px]">
              <UserPicker
                value={email}
                onChange={setEmail}
                onPick={(u) => setEmail(u.email)}
                excludeIds={excludeIds}
                placeholder="teammate@example.com"
                autoFocus
              />
            </div>
            <Select
              value={role}
              onChange={(e) => setRole(e.target.value as "viewer" | "editor")}
              className="w-[110px]"
            >
              <option value="viewer">viewer</option>
              <option value="editor">editor</option>
            </Select>
            <Button type="submit" disabled={busy}>
              {busy ? (
                <>
                  <Spinner /> Sending
                </>
              ) : (
                <>Invite &rarr;</>
              )}
            </Button>
          </form>
          <p className="mt-3 font-serif italic text-sm text-ink-fade">
            Members must already have an account.
          </p>
        </section>

        <div className="h-px w-full bg-rule" />

        <section>
          <p className="mb-3 font-mono uppercase tracking-[0.14em] text-[10px] text-ink-fade">
            // TRANSFER OWNERSHIP
          </p>
          <p className="mb-4 font-serif italic text-base text-ink-soft">
            Hand this document over to another member.
          </p>
          <form
            onSubmit={doTransfer}
            className="flex flex-wrap items-end gap-4"
          >
            <div className="relative flex-1 min-w-[220px]">
              <UserPicker
                value={transferEmail}
                onChange={(v) => {
                  setTransferEmail(v);
                  setTransferName(null);
                }}
                onPick={(u) => {
                  setTransferEmail(u.email);
                  setTransferName(u.name);
                }}
                excludeIds={EMPTY_EXCLUDE}
                placeholder="new-owner@example.com"
              />
            </div>
            <Button
              type="submit"
              variant="destructive"
              disabled={transferBusy}
            >
              {transferBusy ? (
                <>
                  <Spinner /> Transferring
                </>
              ) : (
                <>Transfer &rarr;</>
              )}
            </Button>
          </form>
          {transferError && (
            <div className="mt-3">
              <Alert variant="destructive">{transferError}</Alert>
            </div>
          )}
        </section>

        {error && <Alert variant="destructive">{error}</Alert>}
      </div>
    </Modal>
  );
}

interface UserPickerProps {
  value: string;
  onChange: (value: string) => void;
  onPick: (user: UserSearchResult) => void;
  excludeIds: readonly string[];
  placeholder?: string;
  autoFocus?: boolean;
}

function UserPicker({
  value,
  onChange,
  onPick,
  excludeIds,
  placeholder,
  autoFocus,
}: UserPickerProps) {
  const { token, logout } = useAuth();
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!token) return;
    const q = value.trim();
    if (q.length < 1) {
      setResults([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const handle = window.setTimeout(async () => {
      try {
        const found = await searchUsers(q, excludeIds, token);
        if (cancelled) return;
        setResults(found);
        setHighlight(0);
      } catch (err: unknown) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          logout();
          return;
        }
        setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 150);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [value, token, excludeIds, logout]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function pick(user: UserSearchResult) {
    onPick(user);
    setResults([]);
    setOpen(false);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => (h + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => (h - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      const choice = results[highlight];
      if (choice) {
        e.preventDefault();
        pick(choice);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <input
        type="text"
        required
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        className="flex h-11 w-full rounded-none border-0 border-b border-rule bg-transparent px-0 text-base text-ink placeholder:italic placeholder:font-serif placeholder:text-ink-fade/60 focus:border-b-2 focus:border-ink focus:outline-none focus:ring-0"
      />
      {open && value.trim().length > 0 && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 border border-rule bg-paper shadow-[0_18px_40px_-22px_rgba(26,14,46,0.45)]">
          {searching && results.length === 0 ? (
            <div className="px-4 py-3 font-mono uppercase tracking-[0.14em] text-[10px] text-ink-fade">
              // SEARCHING…
            </div>
          ) : results.length === 0 ? (
            <div className="px-4 py-3 font-mono uppercase tracking-[0.14em] text-[10px] text-ink-fade">
              // NO MATCHES
            </div>
          ) : (
            <ul className="max-h-64 overflow-auto divide-y divide-rule">
              {results.map((u, i) => (
                <li key={u.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(u)}
                    onMouseEnter={() => setHighlight(i)}
                    className={cn(
                      "flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors",
                      i === highlight
                        ? "bg-plum-haze"
                        : "bg-paper hover:bg-plum-haze/60",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className="flex h-7 w-7 shrink-0 items-center justify-center bg-paper-deep border border-rule font-serif italic text-sm text-plum"
                    >
                      {(u.name || u.email).charAt(0).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-ink">
                        {u.name}
                      </span>
                      <span className="block truncate font-mono text-[9px] uppercase tracking-[0.12em] text-ink-fade">
                        // {u.email}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
