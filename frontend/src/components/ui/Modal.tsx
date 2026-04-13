import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "../../lib/cn";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
  hideCloseButton?: boolean;
}

const sizeClasses: Record<NonNullable<ModalProps["size"]>, string> = {
  sm: "max-w-[420px]",
  md: "max-w-[480px]",
  lg: "max-w-[640px]",
  xl: "max-w-5xl",
};

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
  size = "md",
  hideCloseButton = false,
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-[2px] p-4 animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={cn(
          "relative w-full rounded-none border border-rule bg-paper text-ink-soft animate-modal-enter flex flex-col max-h-[92vh] shadow-[0_24px_60px_-20px_rgba(26,14,46,0.45)]",
          sizeClasses[size],
          className,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {(title || !hideCloseButton) && (
          <div className="flex items-start justify-between gap-3 border-b border-rule px-7 pt-7 pb-5">
            <div className="min-w-0 flex-1">
              {title && (
                <h2 className="flex items-center gap-2.5 font-serif italic text-2xl leading-tight text-ink">
                  <span
                    aria-hidden="true"
                    className="inline-block h-1.5 w-1.5 bg-gold shrink-0"
                  />
                  <span className="min-w-0 truncate">{title}</span>
                </h2>
              )}
              {description && (
                <p className="mt-2 font-mono uppercase tracking-[0.12em] text-[10px] text-ink-fade">
                  // {description}
                </p>
              )}
            </div>
            {!hideCloseButton && (
              <button
                type="button"
                aria-label="Close"
                onClick={onClose}
                className="-mt-1 -mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-none text-ink-fade transition-colors hover:bg-plum-haze hover:text-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ink"
              >
                <X size={15} />
              </button>
            )}
          </div>
        )}
        <div className="flex-1 overflow-auto px-7 py-6">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-3 border-t border-rule px-7 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
