import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Excalidraw } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types/types";
import { AlertCircle, ArrowLeft, Check } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { ApiError, getTemplate, updateTemplate } from "../lib/api";
import type { TemplateDetail } from "../lib/types";
import { sanitizeAppState } from "../lib/sanitizeAppState";
import { Button } from "../components/ui/Button";
import { Alert } from "../components/ui/Alert";
import { Spinner } from "../components/ui/Spinner";
import { BrandMark } from "../components/BrandMark";
import { cn } from "../lib/cn";

export function TemplateEditorPage() {
  const { templateId } = useParams<{ templateId: string }>();
  const { token, user, logout } = useAuth();
  const navigate = useNavigate();

  const [template, setTemplate] = useState<TemplateDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const initialLoadDone = useRef(false);
  const debounceRef = useRef<number | undefined>(undefined);
  const retryRef = useRef<number | undefined>(undefined);
  const latestRef = useRef<{
    elements: readonly unknown[];
    appState: Record<string, unknown>;
  } | null>(null);
  const sentRef = useRef<{
    elements: readonly unknown[];
    appState: Record<string, unknown>;
  } | null>(null);
  const inFlightRef = useRef(false);
  const aliveRef = useRef(true);

  // Permission gate — must be admin AND signed in.
  const allowed = !!user?.isAdmin;

  // Load template
  useEffect(() => {
    if (!token || !templateId || !allowed) return;
    let cancelled = false;
    setTemplate(null);
    setLoading(true);
    setError(null);
    initialLoadDone.current = false;
    getTemplate(templateId, token)
      .then((data) => {
        if (cancelled) return;
        setTemplate(data);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          logout();
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to load template");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, templateId, allowed, logout]);

  const setExcalidrawAPI = useCallback(
    (api: ExcalidrawImperativeAPI | null) => {
      apiRef.current = api;
      if (api) initialLoadDone.current = true;
    },
    [],
  );

  const doSave = useCallback(async () => {
    if (!token || !template) return;
    const payload = latestRef.current;
    if (!payload) return;
    if (inFlightRef.current) {
      retryRef.current = window.setTimeout(() => void doSave(), 300);
      return;
    }
    inFlightRef.current = true;
    sentRef.current = payload;
    setSaving(true);
    setSaved(false);
    try {
      await updateTemplate(
        template._id,
        {
          elements: payload.elements,
          appState: sanitizeAppState(payload.appState),
        },
        token,
      );
      if (!aliveRef.current) return;
      setSaving(false);
      setSaved(true);
      setError(null);
    } catch (err: unknown) {
      if (!aliveRef.current) return;
      setSaving(false);
      if (err instanceof ApiError && err.status === 401) {
        logout();
        return;
      }
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      inFlightRef.current = false;
    }
  }, [token, template, logout]);

  function onChange(
    elements: readonly unknown[],
    appState: Record<string, unknown>,
  ) {
    if (!initialLoadDone.current || !template) return;
    latestRef.current = { elements, appState };
    setSaved(false);
    if (debounceRef.current !== undefined) {
      window.clearTimeout(debounceRef.current);
    }
    debounceRef.current = window.setTimeout(() => void doSave(), 1000);
  }

  // Cleanup pending debounce on unmount; best-effort flush of final save.
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      if (debounceRef.current !== undefined) {
        window.clearTimeout(debounceRef.current);
      }
      if (retryRef.current !== undefined) {
        window.clearTimeout(retryRef.current);
      }
      const payload = latestRef.current;
      const tpl = template;
      if (payload && tpl && payload !== sentRef.current) {
        try {
          const authToken =
            token ?? window.localStorage.getItem("exc_token");
          if (authToken) {
            const base = import.meta.env.VITE_API_URL ?? "";
            fetch(
              `${base}/api/templates/${encodeURIComponent(tpl._id)}`,
              {
                method: "PATCH",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${authToken}`,
                },
                body: JSON.stringify({
                  elements: payload.elements,
                  appState: sanitizeAppState(payload.appState),
                }),
                keepalive: true,
              },
            ).catch(() => {
              // best-effort
            });
          }
        } catch {
          // best-effort
        }
      }
    };
  }, [template, token]);

  if (!allowed) {
    return (
      <div className="min-h-screen bg-paper p-10">
        <Alert variant="destructive">// FORBIDDEN — admins only</Alert>
        <Link to="/" className="mt-4 inline-block text-plum italic font-serif">
          ← Back to home
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-paper">
      <header className="shrink-0 bg-ink text-paper border-b border-gold/70">
        <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
          <Link
            to="/admin"
            aria-label="Back to admin"
            title="Back to admin"
            className="inline-flex h-9 w-9 items-center justify-center text-paper/75 transition-colors hover:bg-paper/10 hover:text-gold"
          >
            <ArrowLeft size={17} />
          </Link>
          <div className="hidden md:block">
            <BrandMark size={22} tone="paper" />
          </div>
          <div className="mx-2 hidden h-6 w-px bg-paper/20 md:block" />
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span className="font-mono uppercase tracking-[0.16em] text-[9px] text-paper/55">
              // EDITING TEMPLATE
            </span>
            <h1 className="truncate font-serif italic text-lg sm:text-xl text-paper">
              {template?.name ?? (loading ? "Loading…" : "—")}
            </h1>
            <SaveStamp
              loading={loading}
              saving={saving}
              saved={saved}
              error={error}
            />
          </div>
        </div>
      </header>

      <div className="relative min-h-0 flex-1 p-2">
        {error && !template ? (
          <div className="mx-auto max-w-lg p-6">
            <Alert variant="destructive" className="mb-5">
              {error}
            </Alert>
            <Button variant="outline" onClick={() => navigate("/admin")}>
              ← Back to admin
            </Button>
          </div>
        ) : !template ? (
          <div className="flex h-full items-center justify-center">
            <div className="inline-flex items-center gap-3 text-ink-fade">
              <Spinner size={18} />
              <span className="font-mono uppercase tracking-[0.18em] text-[10px]">
                // LOADING TEMPLATE
              </span>
            </div>
          </div>
        ) : (
          <div className="relative h-full w-full border border-rule bg-paper">
            <Excalidraw
              key={template._id}
              initialData={{
                elements: template.elements as never,
                appState: template.appState as never,
                scrollToContent: true,
              }}
              excalidrawAPI={(api) => setExcalidrawAPI(api)}
              onChange={(elements, appState) =>
                onChange(
                  elements as unknown as readonly unknown[],
                  appState as unknown as Record<string, unknown>,
                )
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}

interface SaveStampProps {
  loading: boolean;
  saving: boolean;
  saved: boolean;
  error: string | null;
}

function SaveStamp({ loading, saving, saved, error }: SaveStampProps) {
  let icon: ReactNode = null;
  let label = "";
  let tone = "bg-white/10 text-white/90 border-white/20";

  if (error) {
    icon = <AlertCircle size={12} />;
    label = "// SAVE ERROR";
    tone = "bg-destructive/20 text-white border-destructive/30";
  } else if (loading) {
    icon = <Spinner size={12} />;
    label = "// LOADING";
  } else if (saving) {
    icon = <Spinner size={12} />;
    label = "// SAVING…";
  } else if (saved) {
    icon = (
      <span aria-hidden className="inline-block h-1.5 w-1.5 bg-gold" />
    );
    label = "// SAVED";
  } else {
    label = "// READY";
  }

  return (
    <span
      className={cn(
        "hidden md:inline-flex shrink-0 items-center gap-1.5 border px-2 py-0.5 font-mono uppercase tracking-[0.14em] text-[9px]",
        tone,
      )}
    >
      {icon}
      <span>
        {label}
        {saved && <Check size={11} className="ml-1 inline" />}
      </span>
    </span>
  );
}
