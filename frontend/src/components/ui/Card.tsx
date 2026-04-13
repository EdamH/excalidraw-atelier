import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "relative rounded-none border border-rule bg-paper text-ink-soft",
        className,
      )}
      {...props}
    />
  ),
);
Card.displayName = "Card";

export const CardHeader = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-6", className)}
    {...props}
  />
));
CardHeader.displayName = "CardHeader";

export const CardTitle = forwardRef<
  HTMLHeadingElement,
  HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      "font-serif italic text-2xl leading-tight tracking-tight text-ink",
      className,
    )}
    {...props}
  />
));
CardTitle.displayName = "CardTitle";

export const CardContent = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
));
CardContent.displayName = "CardContent";

export const CardFooter = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-6 pt-0", className)}
    {...props}
  />
));
CardFooter.displayName = "CardFooter";

interface CardCornerBracketsProps {
  className?: string;
  size?: number;
}

/**
 * Decorative L-shaped print marks at the four corners of a card.
 * Adds editorial "crop mark" flavor. Purely cosmetic.
 */
export function CardCornerBrackets({
  className,
  size = 12,
}: CardCornerBracketsProps) {
  const common =
    "pointer-events-none absolute transition-opacity duration-300 opacity-30 group-hover/card:opacity-70";
  const style = { width: size, height: size };
  return (
    <>
      <span
        aria-hidden="true"
        className={cn(common, "left-0 top-0 border-l border-t border-ink", className)}
        style={style}
      />
      <span
        aria-hidden="true"
        className={cn(common, "right-0 top-0 border-r border-t border-ink", className)}
        style={style}
      />
      <span
        aria-hidden="true"
        className={cn(common, "left-0 bottom-0 border-l border-b border-ink", className)}
        style={style}
      />
      <span
        aria-hidden="true"
        className={cn(common, "right-0 bottom-0 border-r border-b border-ink", className)}
        style={style}
      />
    </>
  );
}
