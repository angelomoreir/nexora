import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

export interface TabItem { value: string; label: string; icon?: ReactNode; disabled?: boolean }

export function Tabs({ items, value, onValueChange, className }: { items: TabItem[]; value: string; onValueChange: (value: string) => void; className?: string }) {
  return (
    <div role="tablist" className={cn("flex gap-1 overflow-x-auto border-b border-border", className)}>
      {items.map((item) => <button key={item.value} type="button" role="tab" aria-selected={value === item.value} disabled={item.disabled} onClick={() => onValueChange(item.value)} className="nx-focus-ring -mb-px inline-flex min-h-10 items-center gap-2 border-b-2 border-transparent px-3 text-sm font-medium text-muted-foreground transition hover:text-foreground aria-selected:border-primary aria-selected:text-primary disabled:opacity-[var(--nx-disabled-opacity)]">{item.icon}{item.label}</button>)}
    </div>
  );
}

export function TabPanel({ active, children, className }: { active: boolean; children: ReactNode; className?: string }) {
  if (!active) return null;
  return <div role="tabpanel" className={className}>{children}</div>;
}
