import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "../../lib/cn";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  variant?: "default" | "destructive" | "onPrimary";
  children: ReactNode;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      label,
      variant = "default",
      className,
      children,
      type = "button",
      ...props
    },
    ref,
  ) => {
    const variantClasses =
      variant === "destructive"
        ? "text-ink-fade hover:bg-destructive/10 hover:text-destructive"
        : variant === "onPrimary"
          ? "text-paper/75 hover:bg-paper/10 hover:text-gold"
          : "text-ink-soft hover:bg-plum-haze hover:text-ink";

    return (
      <span className="tooltip-host inline-flex">
        <button
          ref={ref}
          type={type}
          aria-label={label}
          className={cn(
            "inline-flex h-9 w-9 items-center justify-center rounded-none transition-all duration-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-current disabled:opacity-50 disabled:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:translate-y-px",
            variantClasses,
            className,
          )}
          {...props}
        >
          {children}
        </button>
        <span className="tooltip-bubble">// {label}</span>
      </span>
    );
  },
);
IconButton.displayName = "IconButton";
