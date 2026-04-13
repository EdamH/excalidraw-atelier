import type { HTMLAttributes } from "react";
import { cn } from "../../lib/cn";
import type { Role } from "../../lib/types";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: Role;
  /** Use 'paper' when rendering on a dark (bg-ink) surface. */
  tone?: "ink" | "paper";
}

const barColor: Record<Role, string> = {
  owner: "bg-gold",
  editor: "bg-plum",
  viewer: "bg-ink-fade",
};

const barColorPaper: Record<Role, string> = {
  owner: "bg-gold",
  editor: "bg-plum-haze",
  viewer: "bg-paper/40",
};

export function Badge({
  className,
  variant = "viewer",
  tone = "ink",
  children,
  ...props
}: BadgeProps) {
  const onDark = tone === "paper";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-mono uppercase tracking-[0.15em] text-[9px]",
        onDark ? "text-paper/80" : "text-ink",
        className,
      )}
      {...props}
    >
      <span
        className={cn(
          "h-2.5 w-[3px] shrink-0",
          onDark ? barColorPaper[variant] : barColor[variant],
        )}
      />
      {children}
    </span>
  );
}

export function RoleBadge({
  role,
  tone,
}: {
  role: Role;
  tone?: "ink" | "paper";
}) {
  return (
    <Badge variant={role} tone={tone}>
      {role}
    </Badge>
  );
}
