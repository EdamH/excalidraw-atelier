import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Ban,
  Check,
  ExternalLink,
  KeyRound,
  Pencil,
  PenLine,
  Trash2,
} from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import {
  ApiError,
  createAdminUser,
  createTemplate,
  deleteAdminUser,
  deleteScene,
  deleteTemplate,
  getAdminScenes,
  getAdminStats,
  getScene,
  listAdminUsers,
  listScenes,
  listTemplates,
  updateAdminUser,
  updateTemplate,
  updateUserQuota,
} from "../lib/api";
import type {
  AdminStats,
  AdminUser,
  SceneListItem,
  TemplateListItem,
} from "../lib/types";
import { QuotaBar } from "../components/QuotaBar";
import { formatBytes } from "../lib/formatBytes";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { CardCornerBrackets } from "../components/ui/Card";
import { IconButton } from "../components/ui/IconButton";
import { Modal } from "../components/ui/Modal";
import { ConfirmModal } from "../components/ui/ConfirmModal";
import { Input } from "../components/ui/Input";
import { Spinner } from "../components/ui/Spinner";
import { BrandMark } from "../components/BrandMark";
import { formatRelativeTime } from "../lib/relativeTime";
import { cn } from "../lib/cn";

type AdminTab = "users" | "templates" | "scenes" | "stats";

export function AdminPage() {
  const { token, user, logout } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<AdminTab>("users");

  if (!user) {
    return null;
  }

  if (!user.isAdmin) {
    return (
      <div className="min-h-screen bg-paper">
        <main className="mx-auto max-w-2xl px-5 sm:px-8 py-20">
          <Alert variant="destructive">
            <strong>// FORBIDDEN —</strong> you do not have access to the
            admin area.
          </Alert>
          <div className="mt-6">
            <Link
              to="/"
              className="font-serif italic text-plum hover:text-plum-deep underline-offset-4 hover:underline"
            >
              &larr; Back to home
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper">
      <header className="sticky top-0 z-40 bg-ink text-paper border-b border-gold/70">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
          <div className="flex items-center gap-4">
            <Link
              to="/"
              aria-label="Back to library"
              title="Back to library"
              className="inline-flex h-9 w-9 items-center justify-center rounded-none text-paper/75 transition-colors hover:bg-paper/10 hover:text-gold"
            >
              <ArrowLeft size={17} />
            </Link>
            <BrandMark size={24} withSubtitle tone="paper" />
          </div>
          <div className="flex items-center gap-5">
            <div className="hidden sm:flex items-center gap-3">
              <span className="font-mono uppercase tracking-[0.16em] text-[9px] text-paper/60">
                // ADMIN
              </span>
              <span className="font-serif italic text-base text-paper max-w-[160px] truncate">
                {user.name}
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                logout();
                navigate("/login");
              }}
              className="text-paper/80 hover:bg-paper/10 hover:text-gold"
            >
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 sm:px-8">
        <section className="pt-14 pb-10 opacity-0 animate-ink-bleed">
          <p className="mb-4 font-mono uppercase tracking-[0.22em] text-[10px] text-ink-fade">
            // CONTROL ROOM
          </p>
          <h1 className="font-serif italic text-5xl sm:text-6xl text-ink tracking-tight leading-[0.95]">
            Administration.
          </h1>
          <div className="mt-8 flex items-center gap-3">
            <span
              aria-hidden="true"
              className="inline-block h-1.5 w-1.5 bg-gold shrink-0"
            />
            <div className="h-px flex-1 bg-rule" />
          </div>
        </section>

        <div className="mb-8 flex items-center gap-6 border-b border-rule">
          <AdminTabButton
            label="// USERS"
            active={tab === "users"}
            onClick={() => setTab("users")}
          />
          <AdminTabButton
            label="// TEMPLATES"
            active={tab === "templates"}
            onClick={() => setTab("templates")}
          />
          <AdminTabButton
            label="// SCENES"
            active={tab === "scenes"}
            onClick={() => setTab("scenes")}
          />
          <AdminTabButton
            label="// STATS"
            active={tab === "stats"}
            onClick={() => setTab("stats")}
          />
        </div>

        {token && tab === "users" && (
          <UsersPanel token={token} currentUserId={user.id} logout={logout} />
        )}
        {token && tab === "templates" && (
          <TemplatesPanel token={token} logout={logout} />
        )}
        {token && tab === "scenes" && (
          <ScenesPanel token={token} logout={logout} />
        )}
        {token && tab === "stats" && (
          <StatsPanel token={token} logout={logout} />
        )}
      </main>
    </div>
  );
}

interface AdminTabButtonProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

function AdminTabButton({ label, active, onClick }: AdminTabButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative -mb-px inline-flex h-10 items-center font-mono uppercase tracking-[0.18em] text-[10px] transition-colors",
        active ? "text-ink" : "text-ink-fade hover:text-ink-soft",
      )}
    >
      {label}
      {active && (
        <span
          aria-hidden="true"
          className="absolute left-0 right-0 -bottom-px h-[2px] bg-gold"
        />
      )}
    </button>
  );
}

// ─── USERS PANEL ─────────────────────────────────────────────────────────────

interface PanelProps {
  token: string;
  logout: () => void;
}

interface UsersPanelProps extends PanelProps {
  currentUserId: string;
}

function UsersPanel({ token, currentUserId, logout }: UsersPanelProps) {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(
    null,
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AdminUser | null>(null);
  const [resetTarget, setResetTarget] = useState<AdminUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await listAdminUsers(token);
      setUsers(list);
      setError(null);
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to load users");
    }
  }, [token, logout]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleDisabled(u: AdminUser) {
    setBusyId(u.id);
    setRowError(null);
    // Optimistic
    setUsers((prev) =>
      prev ? prev.map((x) => (x.id === u.id ? { ...x, disabled: !u.disabled } : x)) : prev,
    );
    try {
      await updateAdminUser(u.id, { disabled: !u.disabled }, token);
    } catch (err: unknown) {
      // Roll back
      setUsers((prev) =>
        prev ? prev.map((x) => (x.id === u.id ? { ...x, disabled: u.disabled } : x)) : prev,
      );
      if (err instanceof ApiError && err.status === 401) {
        logout();
        return;
      }
      setRowError({
        id: u.id,
        message: err instanceof Error ? err.message : "Update failed",
      });
    } finally {
      setBusyId(null);
    }
  }

  function handleDelete(u: AdminUser) {
    setDeleteTarget(u);
  }

  async function performDelete(u: AdminUser) {
    setBusyId(u.id);
    setRowError(null);
    try {
      await deleteAdminUser(u.id, token);
      await load();
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
        return;
      }
      setRowError({
        id: u.id,
        message: err instanceof Error ? err.message : "Delete failed",
      });
    } finally {
      setBusyId(null);
      setDeleteTarget(null);
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <p className="font-mono uppercase tracking-[0.14em] text-[10px] text-ink-fade">
          // {users ? String(users.length).padStart(2, "0") : "—"} MEMBERS
        </p>
        <Button onClick={() => setCreateOpen(true)}>+ Add user</Button>
      </div>

      {error && (
        <div className="mb-6">
          <Alert variant="destructive">{error}</Alert>
        </div>
      )}

      {users === null ? (
        <div className="flex items-center gap-3 text-ink-fade">
          <Spinner size={14} />
          <span className="font-mono uppercase tracking-[0.14em] text-[10px]">
            // LOADING USERS
          </span>
        </div>
      ) : users.length === 0 ? (
        <div className="border border-rule bg-paper px-8 py-16">
          <p className="font-serif italic text-2xl text-ink-fade">
            No users yet.
          </p>
        </div>
      ) : (
        <div className="border border-rule bg-paper">
          <ul className="divide-y divide-rule">
            {users.map((u) => {
              const isSelf = u.id === currentUserId;
              const busy = busyId === u.id;
              return (
                <li
                  key={u.id}
                  className="flex flex-wrap items-center gap-4 px-5 py-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3">
                      <span className="font-serif italic text-xl text-ink truncate">
                        {u.name}
                      </span>
                      {u.isAdmin && (
                        <span className="font-mono uppercase tracking-[0.14em] text-[9px] text-gold border border-gold/60 px-1.5 py-0.5">
                          admin
                        </span>
                      )}
                      {!u.isAdmin && (
                        <span className="font-mono uppercase tracking-[0.14em] text-[9px] text-ink-fade border border-rule px-1.5 py-0.5">
                          member
                        </span>
                      )}
                      {u.disabled && (
                        <span className="font-mono uppercase tracking-[0.14em] text-[9px] text-destructive border border-destructive/60 px-1.5 py-0.5">
                          disabled
                        </span>
                      )}
                    </div>
                    <div className="mt-1 font-mono uppercase tracking-[0.12em] text-[10px] text-ink-fade truncate">
                      // {u.email} • CREATED {formatRelativeTime(u.createdAt)}
                    </div>
                    {rowError && rowError.id === u.id && (
                      <div className="mt-2 font-mono uppercase tracking-[0.12em] text-[9px] text-destructive">
                        // {rowError.message}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <IconButton
                      label="Edit user"
                      onClick={() => setEditTarget(u)}
                      disabled={busy}
                    >
                      <Pencil />
                    </IconButton>
                    <IconButton
                      label="Reset password"
                      onClick={() => setResetTarget(u)}
                      disabled={busy}
                    >
                      <KeyRound />
                    </IconButton>
                    <IconButton
                      label={u.disabled ? "Enable user" : "Disable user"}
                      onClick={() => void toggleDisabled(u)}
                      disabled={busy || isSelf}
                    >
                      {u.disabled ? <Check /> : <Ban />}
                    </IconButton>
                    <IconButton
                      label="Delete user"
                      variant="destructive"
                      onClick={() => void handleDelete(u)}
                      disabled={busy || isSelf}
                    >
                      <Trash2 />
                    </IconButton>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {createOpen && (
        <CreateUserModal
          token={token}
          logout={logout}
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            void load();
          }}
        />
      )}
      {editTarget && (
        <EditUserModal
          token={token}
          logout={logout}
          user={editTarget}
          onClose={() => setEditTarget(null)}
          onUpdated={() => {
            setEditTarget(null);
            void load();
          }}
        />
      )}
      {resetTarget && (
        <ResetPasswordModal
          token={token}
          logout={logout}
          user={resetTarget}
          onClose={() => setResetTarget(null)}
          onUpdated={() => setResetTarget(null)}
        />
      )}

      <ConfirmModal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) return performDelete(deleteTarget);
        }}
        title="Delete member."
        description={
          deleteTarget
            ? `${deleteTarget.email} will be removed. This cannot be undone.`
            : undefined
        }
        confirmLabel="Delete member"
      />
    </div>
  );
}

interface CreateUserModalProps {
  token: string;
  logout: () => void;
  onClose: () => void;
  onCreated: () => void;
}

function CreateUserModal({ token, logout, onClose, onCreated }: CreateUserModalProps) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !name.trim() || !password) {
      setError("All fields are required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createAdminUser(
        { email: email.trim(), name: name.trim(), password },
        token,
      );
      onCreated();
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
        return;
      }
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="A new member."
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button form="create-user-form" type="submit" disabled={busy}>
            {busy ? (
              <>
                <Spinner /> Creating
              </>
            ) : (
              <>Create &rarr;</>
            )}
          </Button>
        </>
      }
    >
      <form id="create-user-form" onSubmit={submit} className="space-y-5">
        <FieldLabel label="// EMAIL">
          <Input
            variant="editorial"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
          />
        </FieldLabel>
        <FieldLabel label="// NAME">
          <Input
            variant="editorial"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </FieldLabel>
        <FieldLabel label="// PASSWORD">
          <Input
            variant="editorial"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </FieldLabel>
        {error && <Alert variant="destructive">{error}</Alert>}
      </form>
    </Modal>
  );
}

interface EditUserModalProps {
  token: string;
  logout: () => void;
  user: AdminUser;
  onClose: () => void;
  onUpdated: () => void;
}

function EditUserModal({ token, logout, user, onClose, onUpdated }: EditUserModalProps) {
  const [name, setName] = useState(user.name);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const patch: { name: string; password?: string } = { name: name.trim() };
      if (password) patch.password = password;
      await updateAdminUser(user.id, patch, token);
      onUpdated();
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
        return;
      }
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit member."
      description={user.email}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button form="edit-user-form" type="submit" disabled={busy}>
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
      <form id="edit-user-form" onSubmit={submit} className="space-y-5">
        <FieldLabel label="// NAME">
          <Input
            variant="editorial"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </FieldLabel>
        <FieldLabel label="// NEW PASSWORD (OPTIONAL)">
          <Input
            variant="editorial"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Leave blank to keep current"
          />
        </FieldLabel>
        {error && <Alert variant="destructive">{error}</Alert>}
      </form>
    </Modal>
  );
}

function ResetPasswordModal({
  token,
  logout,
  user,
  onClose,
  onUpdated,
}: EditUserModalProps) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!password) {
      setError("Password is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await updateAdminUser(user.id, { password }, token);
      onUpdated();
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
        return;
      }
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Reset password."
      description={user.email}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button form="reset-password-form" type="submit" disabled={busy}>
            {busy ? (
              <>
                <Spinner /> Saving
              </>
            ) : (
              <>Reset &rarr;</>
            )}
          </Button>
        </>
      }
    >
      <form id="reset-password-form" onSubmit={submit} className="space-y-5">
        <FieldLabel label="// NEW PASSWORD">
          <Input
            variant="editorial"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
        </FieldLabel>
        {error && <Alert variant="destructive">{error}</Alert>}
      </form>
    </Modal>
  );
}

// ─── TEMPLATES PANEL ────────────────────────────────────────────────────────

function TemplatesPanel({ token, logout }: PanelProps) {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<TemplateListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<TemplateListItem | null>(null);
  const [deleteTarget, setDeleteTarget] =
    useState<TemplateListItem | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await listTemplates(token);
      setTemplates(list);
      setError(null);
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to load templates");
    }
  }, [token, logout]);

  useEffect(() => {
    void load();
  }, [load]);

  function handleDelete(t: TemplateListItem) {
    setDeleteTarget(t);
  }

  async function performDelete(t: TemplateListItem) {
    setBusyId(t._id);
    try {
      await deleteTemplate(t._id, token);
      await load();
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
        return;
      }
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusyId(null);
      setDeleteTarget(null);
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <p className="font-mono uppercase tracking-[0.14em] text-[10px] text-ink-fade">
          // {templates ? String(templates.length).padStart(2, "0") : "—"} TEMPLATES
        </p>
        <Button onClick={() => setCreateOpen(true)}>+ New template</Button>
      </div>

      {error && (
        <div className="mb-6">
          <Alert variant="destructive">{error}</Alert>
        </div>
      )}

      {templates === null ? (
        <div className="flex items-center gap-3 text-ink-fade">
          <Spinner size={14} />
          <span className="font-mono uppercase tracking-[0.14em] text-[10px]">
            // LOADING TEMPLATES
          </span>
        </div>
      ) : templates.length === 0 ? (
        <div className="border border-rule bg-paper px-8 py-16">
          <p className="font-serif italic text-2xl text-ink-fade">
            No templates yet.
          </p>
        </div>
      ) : (
        <div className="grid gap-px bg-rule border border-rule grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => {
            const busy = busyId === t._id;
            return (
              <article
                key={t._id}
                className="group/card relative bg-paper p-5 flex flex-col min-h-[200px]"
              >
                <CardCornerBrackets />
                <h3 className="font-serif italic text-2xl text-ink leading-tight">
                  {t.name}
                </h3>
                <p className="mt-3 text-[13px] text-ink-soft leading-relaxed line-clamp-3">
                  {t.description}
                </p>
                <p className="mt-4 font-mono uppercase tracking-[0.12em] text-[9px] text-ink-fade">
                  // {String(t.elementCount).padStart(2, "0")} ELEMENTS
                </p>
                <p className="mt-1 font-mono uppercase tracking-[0.12em] text-[9px] text-ink-fade">
                  // UPDATED {formatRelativeTime(t.updatedAt)}
                </p>
                <div className="mt-auto pt-5 flex items-center gap-1">
                  <IconButton
                    label="Edit canvas"
                    onClick={() =>
                      navigate(`/admin/templates/${encodeURIComponent(t._id)}/edit`)
                    }
                    disabled={busy}
                  >
                    <PenLine />
                  </IconButton>
                  <IconButton
                    label="Edit name & description"
                    onClick={() => setEditTarget(t)}
                    disabled={busy}
                  >
                    <Pencil />
                  </IconButton>
                  <IconButton
                    label="Delete template"
                    variant="destructive"
                    onClick={() => void handleDelete(t)}
                    disabled={busy}
                  >
                    <Trash2 />
                  </IconButton>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {createOpen && (
        <CreateTemplateModal
          token={token}
          logout={logout}
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            void load();
          }}
        />
      )}
      {editTarget && (
        <EditTemplateModal
          token={token}
          logout={logout}
          template={editTarget}
          onClose={() => setEditTarget(null)}
          onUpdated={() => {
            setEditTarget(null);
            void load();
          }}
        />
      )}

      <ConfirmModal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) return performDelete(deleteTarget);
        }}
        title="Delete template."
        description={
          deleteTarget
            ? `"${deleteTarget.name}" will be removed from the template library.`
            : undefined
        }
        confirmLabel="Delete template"
      />
    </div>
  );
}

interface CreateTemplateModalProps {
  token: string;
  logout: () => void;
  onClose: () => void;
  onCreated: () => void;
}

function CreateTemplateModal({
  token,
  logout,
  onClose,
  onCreated,
}: CreateTemplateModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [scenes, setScenes] = useState<SceneListItem[] | null>(null);
  const [sceneId, setSceneId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await listScenes(token);
        if (cancelled) return;
        setScenes(list);
      } catch (err: unknown) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          logout();
          return;
        }
        setError(
          err instanceof Error ? err.message : "Failed to load scenes",
        );
        setScenes([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, logout]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !description.trim() || !sceneId) {
      setError("Name, description, and source scene are required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const full = await getScene(sceneId, token);
      await createTemplate(
        {
          name: name.trim(),
          description: description.trim(),
          elements: full.elements,
          appState: full.appState,
        },
        token,
      );
      onCreated();
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
        return;
      }
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="A new template."
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button form="create-template-form" type="submit" disabled={busy}>
            {busy ? (
              <>
                <Spinner /> Creating
              </>
            ) : (
              <>Create &rarr;</>
            )}
          </Button>
        </>
      }
    >
      <form id="create-template-form" onSubmit={submit} className="space-y-5">
        <FieldLabel label="// NAME">
          <Input
            variant="editorial"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </FieldLabel>
        <FieldLabel label="// DESCRIPTION">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="flex w-full rounded-none border-0 border-b border-rule bg-transparent px-0 py-2 text-base text-ink placeholder:italic placeholder:font-serif placeholder:text-ink-fade/60 focus:border-b-2 focus:border-ink focus:outline-none focus:ring-0 resize-none"
          />
        </FieldLabel>
        <FieldLabel label="// IMPORT FROM A SCENE">
          {scenes === null ? (
            <div className="font-mono uppercase tracking-[0.14em] text-[10px] text-ink-fade py-2">
              // LOADING SCENES
            </div>
          ) : scenes.length === 0 ? (
            <div className="font-mono uppercase tracking-[0.14em] text-[10px] text-ink-fade py-2">
              // NO SCENES AVAILABLE
            </div>
          ) : (
            <select
              value={sceneId}
              onChange={(e) => setSceneId(e.target.value)}
              className="h-11 w-full rounded-none border-0 border-b border-rule bg-transparent px-0 text-base text-ink focus:border-b-2 focus:border-ink focus:outline-none focus:ring-0 appearance-none"
            >
              <option value="">— pick a scene —</option>
              {scenes.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.title}
                </option>
              ))}
            </select>
          )}
        </FieldLabel>
        {error && <Alert variant="destructive">{error}</Alert>}
      </form>
    </Modal>
  );
}

interface EditTemplateModalProps {
  token: string;
  logout: () => void;
  template: TemplateListItem;
  onClose: () => void;
  onUpdated: () => void;
}

function EditTemplateModal({
  token,
  logout,
  template,
  onClose,
  onUpdated,
}: EditTemplateModalProps) {
  const [name, setName] = useState(template.name);
  const [description, setDescription] = useState(template.description);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !description.trim()) {
      setError("Name and description are required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await updateTemplate(
        template._id,
        { name: name.trim(), description: description.trim() },
        token,
      );
      onUpdated();
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
        return;
      }
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit template."
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button form="edit-template-form" type="submit" disabled={busy}>
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
      <form id="edit-template-form" onSubmit={submit} className="space-y-5">
        <FieldLabel label="// NAME">
          <Input
            variant="editorial"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </FieldLabel>
        <FieldLabel label="// DESCRIPTION">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="flex w-full rounded-none border-0 border-b border-rule bg-transparent px-0 py-2 text-base text-ink placeholder:italic placeholder:font-serif placeholder:text-ink-fade/60 focus:border-b-2 focus:border-ink focus:outline-none focus:ring-0 resize-none"
          />
        </FieldLabel>
        {error && <Alert variant="destructive">{error}</Alert>}
      </form>
    </Modal>
  );
}

// ─── SCENES PANEL ────────────────────────────────────────────────────────────

function ScenesPanel({ token, logout }: PanelProps) {
  const navigate = useNavigate();
  const [scenes, setScenes] = useState<SceneListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SceneListItem | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await getAdminScenes(token);
      setScenes(list);
      setError(null);
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to load scenes");
    }
  }, [token, logout]);

  useEffect(() => {
    void load();
  }, [load]);

  const q = query.trim().toLowerCase();
  const filtered = scenes
    ? q
      ? scenes.filter(
          (s) =>
            s.title.toLowerCase().includes(q) ||
            s.ownerName.toLowerCase().includes(q),
        )
      : scenes
    : null;

  async function performDelete(s: SceneListItem) {
    setBusyId(s._id);
    try {
      await deleteScene(s._id, token);
      await load();
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
        return;
      }
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusyId(null);
      setDeleteTarget(null);
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <p className="font-mono uppercase tracking-[0.14em] text-[10px] text-ink-fade">
          //{" "}
          {filtered
            ? String(filtered.length).padStart(2, "0")
            : "—"}{" "}
          SCENES
        </p>
        <div className="w-full max-w-xs">
          <label
            htmlFor="admin-scene-search"
            className="mb-1 block font-mono uppercase tracking-[0.16em] text-[10px] text-ink-fade"
          >
            // SEARCH
          </label>
          <Input
            id="admin-scene-search"
            variant="editorial"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="By title or owner…"
          />
        </div>
      </div>

      {error && (
        <div className="mb-6">
          <Alert variant="destructive">{error}</Alert>
        </div>
      )}

      {scenes === null ? (
        <div className="flex items-center gap-3 text-ink-fade">
          <Spinner size={14} />
          <span className="font-mono uppercase tracking-[0.14em] text-[10px]">
            // LOADING SCENES
          </span>
        </div>
      ) : filtered && filtered.length === 0 ? (
        <div className="border border-rule bg-paper px-8 py-16">
          <p className="font-serif italic text-2xl text-ink-fade">
            {q ? "No scenes match that search." : "No scenes yet."}
          </p>
        </div>
      ) : (
        <div className="border border-rule bg-paper overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-rule">
                <Th>// TITLE</Th>
                <Th>// OWNER</Th>
                <Th>// TAGS</Th>
                <Th>// LAST EDITED</Th>
                <Th className="text-right">// ACTIONS</Th>
              </tr>
            </thead>
            <tbody>
              {(filtered ?? []).map((s) => {
                const busy = busyId === s._id;
                const lastEdit =
                  s.lastEditedAt ?? s.updatedAt;
                return (
                  <tr
                    key={s._id}
                    className="border-b border-rule last:border-b-0"
                  >
                    <td className="px-5 py-3 font-serif italic text-lg text-ink truncate max-w-[260px]">
                      {s.title}
                    </td>
                    <td className="px-5 py-3 text-sm text-ink-soft truncate max-w-[180px]">
                      {s.ownerName}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap gap-1">
                        {s.tags.length === 0 ? (
                          <span className="font-mono uppercase tracking-[0.12em] text-[9px] text-ink-fade">
                            //
                          </span>
                        ) : (
                          s.tags.map((t) => (
                            <span
                              key={t}
                              className="font-mono uppercase tracking-[0.12em] text-[9px] text-ink-soft border border-rule px-1.5 py-0.5"
                            >
                              {t}
                            </span>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3 font-mono uppercase tracking-[0.12em] text-[10px] text-ink-fade">
                      {formatRelativeTime(lastEdit)}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <IconButton
                          label="Open scene"
                          onClick={() =>
                            navigate(`/d/${encodeURIComponent(s._id)}`)
                          }
                          disabled={busy}
                        >
                          <ExternalLink />
                        </IconButton>
                        <IconButton
                          label="Delete scene"
                          variant="destructive"
                          onClick={() => setDeleteTarget(s)}
                          disabled={busy}
                        >
                          <Trash2 />
                        </IconButton>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmModal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) return performDelete(deleteTarget);
        }}
        title="Move to trash."
        description={
          deleteTarget
            ? `"${deleteTarget.title}" will go to the trash. The owner can restore it.`
            : undefined
        }
        confirmLabel="Move to trash"
      />
    </div>
  );
}

interface ThProps {
  children: ReactNode;
  className?: string;
}

function Th({ children, className }: ThProps) {
  return (
    <th
      className={cn(
        "px-5 py-3 font-mono uppercase tracking-[0.14em] text-[10px] text-ink-fade font-normal",
        className,
      )}
    >
      {children}
    </th>
  );
}

// ─── STATS PANEL ────────────────────────────────────────────────────────────

function StatsPanel({ token, logout }: PanelProps) {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<
    AdminStats["perUser"][number] | null
  >(null);

  const load = useCallback(async () => {
    try {
      const res = await getAdminStats(token);
      setStats(res);
      setError(null);
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to load stats");
    }
  }, [token, logout]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <div className="mb-6">
        <Alert variant="destructive">{error}</Alert>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex items-center gap-3 text-ink-fade">
        <Spinner size={14} />
        <span className="font-mono uppercase tracking-[0.14em] text-[10px]">
          // LOADING STATS
        </span>
      </div>
    );
  }

  const sortedUsers = [...stats.perUser].sort(
    (a, b) => b.percentUsed - a.percentUsed,
  );

  return (
    <div className="space-y-8">
      {/* Top stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-rule border border-rule">
        <StatBigCard
          label="// SCENES"
          value={String(stats.sceneCount)}
          numeral={String(stats.sceneCount % 100).padStart(2, "0")}
          footer={`${stats.trashedSceneCount} in trash`}
        />
        <StatBigCard
          label="// USERS"
          value={String(stats.userCount)}
          numeral={String(stats.userCount % 100).padStart(2, "0")}
        />
        <StatBigCard
          label="// TOTAL STORAGE"
          value={formatBytes(stats.totalBytes)}
          footer={`${formatBytes(stats.sceneBytes)} scenes · ${formatBytes(stats.versionBytes)} versions`}
        />
      </div>

      {/* Storage health */}
      <StorageHealth health={stats.storageHealth} />

      {/* Largest scene */}
      {stats.largestScene && (
        <div className="border border-rule bg-paper p-5">
          <p className="font-mono uppercase tracking-[0.14em] text-[10px] text-ink-fade">
            // LARGEST SCENE
          </p>
          <p className="mt-2 font-serif italic text-2xl text-ink truncate">
            {stats.largestScene.title}
          </p>
          <p className="mt-1 font-mono uppercase tracking-[0.12em] text-[10px] text-ink-fade">
            // {stats.largestScene.ownerName} ·{" "}
            {formatBytes(stats.largestScene.size)}
          </p>
        </div>
      )}

      {/* Per-user table */}
      <div>
        <p className="mb-4 font-mono uppercase tracking-[0.14em] text-[10px] text-ink-fade">
          // PER-USER STORAGE
        </p>
        {sortedUsers.length === 0 ? (
          <div className="border border-rule bg-paper px-8 py-10">
            <p className="font-serif italic text-xl text-ink-fade">
              No users.
            </p>
          </div>
        ) : (
          <div className="border border-rule bg-paper overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-rule">
                  <Th>// NAME</Th>
                  <Th>// EMAIL</Th>
                  <Th>// SCENES</Th>
                  <Th>// STORAGE</Th>
                  <Th>// USED</Th>
                  <Th className="text-right">// QUOTA</Th>
                </tr>
              </thead>
              <tbody>
                {sortedUsers.map((u) => (
                  <tr
                    key={u.userId}
                    className="border-b border-rule last:border-b-0 align-top"
                  >
                    <td className="px-5 py-4 font-serif italic text-lg text-ink truncate max-w-[160px]">
                      {u.name}
                    </td>
                    <td className="px-5 py-4 font-mono uppercase tracking-[0.12em] text-[10px] text-ink-fade truncate max-w-[200px]">
                      {u.email}
                    </td>
                    <td className="px-5 py-4 font-serif italic text-base text-ink-soft">
                      {u.sceneCount}
                    </td>
                    <td className="px-5 py-4 min-w-[180px]">
                      <QuotaBar
                        variant="compact"
                        usage={{
                          used: u.totalBytes,
                          limit: u.quotaLimit,
                          over: u.percentUsed > 100,
                        }}
                      />
                    </td>
                    <td
                      className={cn(
                        "px-5 py-4 font-mono uppercase tracking-[0.14em] text-[10px]",
                        u.percentUsed > 100
                          ? "text-red-700"
                          : u.percentUsed >= 80
                            ? "text-gold"
                            : "text-ink-soft",
                      )}
                    >
                      {u.percentUsed.toFixed(0)}%
                    </td>
                    <td className="px-5 py-4 text-right">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setEditTarget(u)}
                      >
                        Edit
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editTarget && (
        <EditQuotaModal
          token={token}
          logout={logout}
          user={editTarget}
          onClose={() => setEditTarget(null)}
          onUpdated={() => {
            setEditTarget(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

interface StatBigCardProps {
  label: string;
  value: string;
  numeral?: string;
  footer?: string;
}

function StatBigCard({ label, value, numeral, footer }: StatBigCardProps) {
  return (
    <div className="group/card relative bg-paper px-6 py-7 min-h-[150px] overflow-hidden">
      <CardCornerBrackets />
      {numeral && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-4 top-2 font-serif italic text-7xl text-ink-fade/20 leading-none select-none"
        >
          {numeral}
        </span>
      )}
      <p className="relative font-mono uppercase tracking-[0.14em] text-[10px] text-ink-fade">
        {label}
      </p>
      <p className="relative mt-3 font-serif italic text-4xl text-ink leading-tight">
        {value}
      </p>
      {footer && (
        <p className="relative mt-2 font-mono uppercase tracking-[0.12em] text-[9px] text-ink-fade truncate">
          // {footer}
        </p>
      )}
    </div>
  );
}

function StorageHealth({
  health,
}: {
  health: AdminStats["storageHealth"];
}) {
  if (health === "critical") {
    return (
      <div className="flex items-center gap-3 border border-destructive bg-paper px-5 py-4">
        <span
          aria-hidden="true"
          className="inline-block h-2 w-2 bg-red-700 shrink-0"
        />
        <span className="font-mono uppercase tracking-[0.18em] text-[10px] text-red-700">
          // STORAGE CRITICAL — ACTION NEEDED
        </span>
      </div>
    );
  }
  if (health === "warning") {
    return (
      <div className="flex items-center gap-3 border border-rule bg-paper px-5 py-4">
        <span
          aria-hidden="true"
          className="inline-block h-2 w-2 bg-gold shrink-0"
        />
        <span className="font-mono uppercase tracking-[0.18em] text-[10px] text-ink-soft">
          // STORAGE WARNING — MONITOR
        </span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 border border-rule bg-paper px-5 py-4">
      <span
        aria-hidden="true"
        className="inline-block h-2 w-2 bg-plum shrink-0"
      />
      <span className="font-mono uppercase tracking-[0.14em] text-[10px] text-ink-soft">
        // STORAGE HEALTHY
      </span>
    </div>
  );
}

interface EditQuotaModalProps {
  token: string;
  logout: () => void;
  user: AdminStats["perUser"][number];
  onClose: () => void;
  onUpdated: () => void;
}

function EditQuotaModal({
  token,
  logout,
  user,
  onClose,
  onUpdated,
}: EditQuotaModalProps) {
  const initialMb = Math.round(user.quotaLimit / (1024 * 1024));
  const [mb, setMb] = useState<string>(String(initialMb));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const n = Number(mb);
    if (!Number.isInteger(n) || n < 0) {
      setError("Quota must be a whole number of MB, 0 or more.");
      return;
    }
    if (n > 10240) {
      setError("Quota may not exceed 10240 MB (10 GB).");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await updateUserQuota(user.userId, n * 1024 * 1024, token);
      onUpdated();
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
        return;
      }
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit storage quota."
      description={user.email}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button form="edit-quota-form" type="submit" disabled={busy}>
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
      <form id="edit-quota-form" onSubmit={submit} className="space-y-5">
        <FieldLabel label="// QUOTA (MB)">
          <Input
            variant="editorial"
            type="number"
            min={0}
            max={10240}
            step={1}
            value={mb}
            onChange={(e) => setMb(e.target.value)}
            autoFocus
          />
        </FieldLabel>
        <p className="font-mono uppercase tracking-[0.12em] text-[9px] text-ink-fade">
          // CURRENTLY USING {formatBytes(user.totalBytes)} OF{" "}
          {formatBytes(user.quotaLimit)}
        </p>
        {error && <Alert variant="destructive">{error}</Alert>}
      </form>
    </Modal>
  );
}

// ─── shared form helpers ────────────────────────────────────────────────────

interface FieldLabelProps {
  label: string;
  children: ReactNode;
}

function FieldLabel({ label, children }: FieldLabelProps) {
  return (
    <label className="block">
      <span className="mb-1 block font-mono uppercase tracking-[0.16em] text-[10px] text-ink-fade">
        {label}
      </span>
      {children}
    </label>
  );
}
