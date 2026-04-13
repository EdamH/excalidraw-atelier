import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

interface AlertProps {
  variant?: "destructive" | "info";
  children: ReactNode;
  className?: string;
}

export function Alert({
  variant = "info",
  children,
  className,
}: AlertProps) {
  const isDestructive = variant === "destructive";
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-2.5 rounded-none border bg-paper px-4 py-3 text-sm leading-snug",
        isDestructive
          ? "border-destructive text-destructive"
          : "border-plum/30 text-plum-deep",
        className,
      )}
    >
      <span
        className={cn(
          "mt-0.5 shrink-0 font-mono uppercase tracking-[0.14em] text-[9px]",
          isDestructive ? "text-destructive" : "text-plum",
        )}
      >
        {isDestructive ? "// ERROR" : "// NOTE"}
      </span>
      <div className="min-w-0 flex-1 font-sans text-[13px]">{children}</div>
    </div>
  );
}
