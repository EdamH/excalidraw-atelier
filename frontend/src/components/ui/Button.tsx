import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/cn";

const buttonVariants = cva(
  "group/btn relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-none font-sans font-medium uppercase tracking-[0.18em] transition-all duration-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-paper disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-3.5 [&_svg]:shrink-0 overflow-hidden",
  {
    variants: {
      variant: {
        default:
          "bg-ink text-paper border-t border-t-gold/70 hover:text-gold",
        secondary:
          "bg-paper-deep text-ink border border-rule hover:bg-paper hover:border-ink/40",
        outline:
          "bg-transparent text-ink border border-ink/60 hover:bg-ink hover:text-paper",
        ghost:
          "bg-transparent text-ink-soft hover:text-ink hover:bg-plum-haze",
        destructive:
          "bg-transparent text-destructive border border-destructive hover:bg-destructive hover:text-paper",
        link: "italic font-serif normal-case tracking-normal text-plum underline-offset-4 hover:text-plum-deep hover:underline",
      },
      size: {
        sm: "h-8 px-3 text-[10px]",
        md: "h-10 px-5 text-[11px]",
        lg: "h-12 px-7 text-xs",
        icon: "h-9 w-9 p-0 tracking-normal",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = "button", children, ...props }, ref) => {
    const showUnderline = variant === "default" || variant === undefined;
    return (
      <button
        ref={ref}
        type={type}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      >
        <span className="relative z-10 inline-flex items-center gap-2">
          {children}
        </span>
        {showUnderline && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute bottom-0 left-0 h-px w-0 bg-gold transition-[width] duration-500 ease-out group-hover/btn:w-full"
          />
        )}
      </button>
    );
  },
);
Button.displayName = "Button";

export { buttonVariants };
