import { cn } from "../lib/cn";
import { formatBytes } from "../lib/formatBytes";
import type { QuotaUsage } from "../lib/types";
import { Alert } from "./ui/Alert";

interface QuotaBarProps {
  usage: QuotaUsage;
  variant?: "full" | "compact";
  onClick?: () => void;
}

function ramp(percent: number, over: boolean): string {
  if (over || percent > 100) return "bg-red-700";
  if (percent >= 80) return "bg-gold";
  return "bg-plum";
}

export function QuotaBar({
  usage,
  variant = "full",
  onClick,
}: QuotaBarProps) {
  const limit = Math.max(usage.limit, 0);
  const used = Math.max(usage.used, 0);
  const rawPercent = limit > 0 ? (used / limit) * 100 : 0;
  const displayPercent = Math.min(rawPercent, 100);
  const fillCx = ramp(rawPercent, usage.over);
  const isCompact = variant === "compact";

  const label = `// ${formatBytes(used)} / ${formatBytes(limit)}`;

  const BarInner = (
    <div
      className={cn(
        "relative h-full w-full",
        "bg-paper-deep border border-rule overflow-hidden",
      )}
    >
      <div
        className={cn("absolute inset-y-0 left-0 transition-[width]", fillCx)}
        style={{ width: `${displayPercent}%` }}
        aria-hidden="true"
      />
    </div>
  );

  if (isCompact) {
    const barEl = onClick ? (
      <button
        type="button"
        onClick={onClick}
        aria-label={`Storage ${label}`}
        className="block h-2 w-full cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ink"
      >
        {BarInner}
      </button>
    ) : (
      <div className="h-2 w-full">{BarInner}</div>
    );
    return (
      <div className="flex w-full min-w-[120px] flex-col gap-1">
        {barEl}
        <span
          className={cn(
            "font-mono uppercase tracking-[0.12em] text-[9px]",
            usage.over ? "text-red-700" : "text-ink-fade",
          )}
        >
          {label}
        </span>
      </div>
    );
  }

  const barEl = onClick ? (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Storage ${label}`}
      className="block h-3 w-full cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ink"
    >
      {BarInner}
    </button>
  ) : (
    <div className="h-3 w-full">{BarInner}</div>
  );

  return (
    <div className="flex w-full flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span
          className={cn(
            "font-mono uppercase tracking-[0.14em] text-[10px]",
            usage.over ? "text-red-700" : "text-ink-fade",
          )}
        >
          // STORAGE
        </span>
        <span
          className={cn(
            "font-mono uppercase tracking-[0.14em] text-[10px]",
            usage.over ? "text-red-700" : "text-ink-soft",
          )}
        >
          {label}
        </span>
      </div>
      {barEl}
      {usage.over && (
        <div className="mt-1">
          <Alert variant="destructive">
            You&rsquo;re over your storage quota. New scenes are blocked until
            you delete some.
          </Alert>
        </div>
      )}
    </div>
  );
}
