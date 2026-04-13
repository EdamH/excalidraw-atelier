import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export type InputVariant = "default" | "editorial";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  variant?: InputVariant;
}

const DEFAULT_CX =
  "flex h-11 w-full rounded-none border-0 border-b border-rule bg-transparent px-0 py-2 text-base text-ink transition-colors placeholder:italic placeholder:font-serif placeholder:text-ink-fade/60 focus:border-b-2 focus:border-ink focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-50";

// The "editorial" variant mirrors the inline borderless-underline class
// string that pages have been duplicating. Kept in sync with the
// Editorial Atelier aesthetic rules from CLAUDE.md.
const EDITORIAL_CX =
  "flex h-11 w-full rounded-none border-0 border-b border-rule bg-transparent px-0 text-base text-ink placeholder:italic placeholder:font-serif placeholder:text-ink-fade/60 focus:border-b-2 focus:border-ink focus:outline-none focus:ring-0";

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = "text", variant = "default", ...props }, ref) => {
    const base = variant === "editorial" ? EDITORIAL_CX : DEFAULT_CX;
    return (
      <input
        ref={ref}
        type={type}
        className={cn(base, className)}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";
