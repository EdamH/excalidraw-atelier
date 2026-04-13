import { forwardRef, type LabelHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export const Label = forwardRef<
  HTMLLabelElement,
  LabelHTMLAttributes<HTMLLabelElement>
>(({ className, ...props }, ref) => (
  <label
    ref={ref}
    className={cn(
      "font-mono uppercase tracking-[0.15em] text-[10px] text-ink-fade",
      className,
    )}
    {...props}
  />
));
Label.displayName = "Label";
