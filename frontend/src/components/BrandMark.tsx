import logo from "../assets/converty-minimized.svg";
import { cn } from "../lib/cn";

interface BrandMarkProps {
  className?: string;
  showWordmark?: boolean;
  wordmarkClassName?: string;
  subtitleClassName?: string;
  size?: number;
  withSubtitle?: boolean;
  tone?: "ink" | "paper";
}

export function BrandMark({
  className,
  showWordmark = true,
  wordmarkClassName,
  subtitleClassName,
  size = 24,
  withSubtitle = false,
  tone = "ink",
}: BrandMarkProps) {
  const wordmarkColor = tone === "paper" ? "text-paper" : "text-ink";
  const subtitleColor =
    tone === "paper" ? "text-paper/60" : "text-ink-fade";

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <img
        src={logo}
        alt="Excalidraw Atelier"
        width={size}
        height={size}
        className="shrink-0"
      />
      {showWordmark && (
        <div className="flex flex-col leading-none">
          <span
            className={cn(
              "font-serif italic tracking-tight text-xl",
              wordmarkColor,
              wordmarkClassName,
            )}
          >
            Excalidraw
          </span>
          {withSubtitle && (
            <span
              className={cn(
                "mt-1 font-mono uppercase tracking-[0.18em] text-[9px]",
                subtitleColor,
                subtitleClassName,
              )}
            >
              // Excalidraw Atelier
            </span>
          )}
        </div>
      )}
    </div>
  );
}
