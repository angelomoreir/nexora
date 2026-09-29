import type { LucideIcon } from "lucide-react";
import { cn } from "../../lib/utils";

export function Stat({ label, value, detail, icon: Icon, trend, className }: { label: string; value: string | number; detail?: string; icon?: LucideIcon; trend?: { value: string; positive?: boolean }; className?: string }) {
  return (
    <div className={cn("min-w-0 border-l-2 border-border px-4 py-1", className)}>
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{Icon ? <Icon className="size-3.5" aria-hidden="true" /> : null}{label}</div>
      <div className="mt-1 flex items-baseline gap-2"><strong className="text-2xl font-semibold tracking-tight text-foreground">{value}</strong>{trend ? <span className={cn("text-xs font-medium", trend.positive === false ? "text-danger" : "text-success")}>{trend.value}</span> : null}</div>
      {detail ? <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p> : null}
    </div>
  );
}
