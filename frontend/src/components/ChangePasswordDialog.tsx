import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthContext";
import { ApiError, changePassword } from "../lib/api";
import { Alert } from "./ui/Alert";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { Modal } from "./ui/Modal";
import { Spinner } from "./ui/Spinner";

interface ChangePasswordDialogProps {
  open: boolean;
  onClose: () => void;
}

type FieldError = {
  current?: string;
  next?: string;
  confirm?: string;
  general?: string;
};

export function ChangePasswordDialog({
  open,
  onClose,
}: ChangePasswordDialogProps) {
  const { token } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<FieldError>({});
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const successTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!open) {
      setCurrent("");
      setNext("");
      setConfirm("");
      setErrors({});
      setBusy(false);
      setSuccess(false);
      if (successTimerRef.current !== undefined) {
        window.clearTimeout(successTimerRef.current);
        successTimerRef.current = undefined;
      }
    }
  }, [open]);

  useEffect(() => {
    return () => {
      if (successTimerRef.current !== undefined) {
        window.clearTimeout(successTimerRef.current);
        successTimerRef.current = undefined;
      }
    };
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const fieldErrors: FieldError = {};
    if (!current) fieldErrors.current = "Current password is required";
    if (next.length < 6)
      fieldErrors.next = "New password must be at least 6 characters";
    if (next !== confirm)
      fieldErrors.confirm = "Passwords do not match";
    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors);
      return;
    }
    if (!token) return;
    setErrors({});
    setBusy(true);
    try {
      await changePassword(current, next, token);
      setSuccess(true);
      if (successTimerRef.current !== undefined) {
        window.clearTimeout(successTimerRef.current);
      }
      successTimerRef.current = window.setTimeout(() => {
        successTimerRef.current = undefined;
        onClose();
      }, 900);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          setErrors({ current: "Current password is incorrect" });
          setBusy(false);
          return;
        }
        if (err.status === 400) {
          setErrors({ next: "New password must be at least 6 characters" });
          setBusy(false);
          return;
        }
      }
      setErrors({
        general: err instanceof Error ? err.message : "Change failed",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Change password."
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button form="change-password-form" type="submit" disabled={busy || success}>
            {busy ? (
              <>
                <Spinner /> Saving
              </>
            ) : success ? (
              <>
                <span className="inline-block h-1.5 w-1.5 bg-gold" /> Saved
              </>
            ) : (
              <>Save &rarr;</>
            )}
          </Button>
        </>
      }
    >
      <form
        id="change-password-form"
        onSubmit={submit}
        className="space-y-5"
      >
        <Field
          label="// CURRENT PASSWORD"
          error={errors.current}
        >
          <Input
            variant="editorial"
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            autoFocus
          />
        </Field>
        <Field label="// NEW PASSWORD" error={errors.next}>
          <Input
            variant="editorial"
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
        </Field>
        <Field label="// CONFIRM NEW PASSWORD" error={errors.confirm}>
          <Input
            variant="editorial"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </Field>
        {errors.general && <Alert variant="destructive">{errors.general}</Alert>}
      </form>
    </Modal>
  );
}

interface FieldProps {
  label: string;
  error?: string;
  children: React.ReactNode;
}

function Field({ label, error, children }: FieldProps) {
  return (
    <label className="block">
      <span className="mb-1 block font-mono uppercase tracking-[0.16em] text-[10px] text-ink-fade">
        {label}
      </span>
      {children}
      {error && (
        <span className="mt-1.5 block font-mono uppercase tracking-[0.12em] text-[9px] text-red-700">
          // {error}
        </span>
      )}
    </label>
  );
}
