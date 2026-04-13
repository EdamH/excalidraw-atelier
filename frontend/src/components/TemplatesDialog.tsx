import { useEffect, useState } from "react";
import {
  ApiError,
  getTemplate,
  importScene,
  listTemplates,
  trackTemplateUsage,
} from "../lib/api";
import { useAuth } from "../auth/AuthContext";
import type { TemplateListItem } from "../lib/types";
import { Modal } from "./ui/Modal";
import { Button } from "./ui/Button";
import { Alert } from "./ui/Alert";
import { Spinner } from "./ui/Spinner";
import { CardCornerBrackets } from "./ui/Card";

interface Props {
  onClose: () => void;
  onCreated: (id: string) => void;
}

export function TemplatesDialog({ onClose, onCreated }: Props) {
  const { token, logout } = useAuth();
  const [templates, setTemplates] = useState<TemplateListItem[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await listTemplates(token);
        if (cancelled) return;
        setTemplates(list);
      } catch (err: unknown) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          logout();
          return;
        }
        setError(
          err instanceof Error ? err.message : "Failed to load templates",
        );
        setTemplates([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, logout]);

  async function choose(template: TemplateListItem) {
    if (!token) return;
    setBusyId(template._id);
    setError(null);
    try {
      const full = await getTemplate(template._id, token);
      const created = await importScene(
        {
          title: full.name,
          elements: full.elements,
          appState: full.appState,
        },
        token,
      );
      // Fire-and-forget usage tracking
      trackTemplateUsage(template._id, token).catch(() => {});
      onCreated(created._id);
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
        return;
      }
      setError(err instanceof Error ? err.message : "Template import failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="From a template."
      description="PRE-MADE STARTER SCENES"
      size="lg"
      footer={
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="space-y-6">
        {templates === null ? (
          <div className="flex items-center gap-3 text-ink-fade">
            <Spinner size={14} />
            <span className="font-mono uppercase tracking-[0.14em] text-[10px]">
              // LOADING TEMPLATES
            </span>
          </div>
        ) : (
          <>
            <p className="font-mono uppercase tracking-[0.14em] text-[10px] text-ink-fade">
              // {String(templates.length).padStart(2, "0")} TEMPLATE
              {templates.length === 1 ? "" : "S"}
            </p>

            {templates.length === 0 ? (
              <div className="border border-rule bg-paper-deep px-5 py-10 font-serif italic text-base text-ink-fade text-center">
                No templates yet — an admin can save scenes as templates.
              </div>
            ) : (
              <div className="grid gap-px bg-rule border border-rule grid-cols-1 sm:grid-cols-2">
                {templates.map((template) => {
                  const busy = busyId === template._id;
                  return (
                    <article
                      key={template._id}
                      className="relative bg-paper p-5 flex flex-col min-h-[220px] group/card"
                    >
                      <CardCornerBrackets />
                      <h3 className="font-serif italic text-2xl text-ink leading-tight">
                        {template.name}
                      </h3>
                      <p className="mt-3 text-[13px] text-ink-soft leading-relaxed">
                        {template.description}
                      </p>
                      <p className="mt-4 font-mono uppercase tracking-[0.14em] text-[9px] text-ink-fade">
                        // {String(template.elementCount).padStart(2, "0")}{" "}
                        ELEMENT{template.elementCount === 1 ? "" : "S"}
                        {(template.usageCount ?? 0) > 0 && (
                          <span className="ml-2 text-gold-deep">
                            · {template.usageCount} USE{template.usageCount === 1 ? "" : "S"}
                          </span>
                        )}
                      </p>
                      <div className="mt-auto pt-5">
                        <Button
                          onClick={() => void choose(template)}
                          disabled={busy || busyId !== null}
                        >
                          {busy ? (
                            <>
                              <Spinner /> Importing
                            </>
                          ) : (
                            <>Use this &rarr;</>
                          )}
                        </Button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </>
        )}

        {error && <Alert variant="destructive">{error}</Alert>}
      </div>
    </Modal>
  );
}
