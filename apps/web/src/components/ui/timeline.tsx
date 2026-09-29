import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

export interface TimelineItem { id: string; title: string; description?: string; time?: string; icon?: ReactNode; tone?: "neutral" | "primary" | "success" | "warning" | "danger" }
const tones = { neutral: "bg-border-strong", primary: "bg-primary", success: "bg-success", warning: "bg-warning", danger: "bg-danger" };

export function Timeline({ items, className }: { items: TimelineItem[]; className?: string }) {
  return <ol className={cn("space-y-0", className)}>{items.map((item, index) => <li key={item.id} className="relative grid grid-cols-[1.25rem_1fr] gap-3 pb-5 last:pb-0">
    {index < items.length - 1 ? <span className="absolute left-[0.59375rem] top-5 h-[calc(100%-0.5rem)] w-px bg-border" aria-hidden="true" /> : null}
    <span className={cn("relative z-10 mt-1 grid size-5 place-items-center rounded-full border-4 border-surface", tones[item.tone ?? "neutral"])}>{item.icon}</span>
    <div className="min-w-0"><div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="text-sm font-semibold text-foreground">{item.title}</h3>{item.time ? <time className="text-xs text-muted-foreground">{item.time}</time> : null}</div>{item.description ? <p className="mt-1 text-sm leading-5 text-secondary-foreground">{item.description}</p> : null}</div>
  </li>)}</ol>;
}
