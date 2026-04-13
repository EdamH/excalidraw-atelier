import { useState, type ReactNode } from "react";
import { Modal } from "./Modal";
import { Button } from "./Button";
import { Spinner } from "./Spinner";

interface ConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "destructive" | "default";
  children?: ReactNode;
}

/**
 * A small confirm-or-cancel modal built on top of the Editorial Atelier
 * `Modal` primitive. Replaces scattered `window.confirm(...)` calls with a
 * styled, state-driven dialog.
 *
 * The parent is responsible for controlling `open` and for clearing the
 * target state in its `onClose` / after `onConfirm` resolves.
 */
export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  variant = "destructive",
  children,
}: ConfirmModalProps) {
  const [busy, setBusy] = useState(false);

  async function handleConfirm() {
    if (busy) return;
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            variant={variant === "destructive" ? "destructive" : "default"}
            onClick={() => void handleConfirm()}
            disabled={busy}
          >
            {busy ? (
              <>
                <Spinner /> {confirmLabel}
              </>
            ) : (
              <>{confirmLabel}</>
            )}
          </Button>
        </>
      }
    >
      {description && (
        <p className="font-serif italic text-base leading-relaxed text-ink-soft">
          {description}
        </p>
      )}
      {children}
      {!description && !children && null}
    </Modal>
  );
}
