import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

export function Tooltip({ content, children, side = "top", className }: { content: ReactNode; children: ReactNode; side?: "top" | "bottom"; className?: string }) {
  return <span className={cn("group/tooltip relative inline-flex", className)}>{children}<span role="tooltip" className={cn("pointer-events-none absolute left-1/2 z-50 w-max max-w-64 -translate-x-1/2 rounded-sm bg-inverse px-2 py-1 text-xs text-inverse-foreground opacity-0 shadow-md transition-opacity group-hover/tooltip:opacity-100 group-focus-within/tooltip:opacity-100", side === "top" ? "bottom-[calc(100%+0.5rem)]" : "top-[calc(100%+0.5rem)]")}>{content}</span></span>;
}
