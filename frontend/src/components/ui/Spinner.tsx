import { cn } from "../../lib/cn";

interface SpinnerProps {
  className?: string;
  size?: number;
}

/**
 * Editorial loader — an italic serif ellipsis whose dots fade
 * in a slow loop. Replaces the generic ring spinner.
 */
export function Spinner({ className, size = 16 }: SpinnerProps) {
  const fontSize = Math.max(14, Math.round(size * 1.25));
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex items-end font-serif italic leading-none text-current",
        className,
      )}
      style={{ fontSize, height: size, lineHeight: `${size}px` }}
    >
      <span className="animate-dot-loop" style={{ animationDelay: "0ms" }}>
        .
      </span>
      <span className="animate-dot-loop" style={{ animationDelay: "180ms" }}>
        .
      </span>
      <span className="animate-dot-loop" style={{ animationDelay: "360ms" }}>
        .
      </span>
    </span>
  );
}
