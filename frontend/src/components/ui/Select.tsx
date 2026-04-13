import { forwardRef, type SelectHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

const chevron =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='8' height='6' viewBox='0 0 8 6'><path d='M0 0 L4 6 L8 0 Z' fill='%231A0E2E'/></svg>\")";

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, style, ...props }, ref) => {
    return (
      <select
        ref={ref}
        className={cn(
          "h-9 rounded-none border-0 border-b border-rule bg-transparent pl-0 pr-6 font-mono uppercase tracking-[0.12em] text-[10px] text-ink transition-colors focus:border-b-2 focus:border-ink focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-50 appearance-none",
          className,
        )}
        style={{
          backgroundImage: chevron,
          backgroundRepeat: "no-repeat",
          backgroundPosition: "right 2px center",
          backgroundSize: "7px 5px",
          ...style,
        }}
        {...props}
      >
        {children}
      </select>
    );
  },
);
Select.displayName = "Select";
