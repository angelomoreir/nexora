import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

export function EmptyState({ icon: Icon, title, description, action, className }: { icon?: LucideIcon; title: string; description?: string; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-h-48 flex-col items-center justify-center px-6 py-10 text-center", className)}>
      {Icon ? <span className="mb-4 grid size-10 place-items-center rounded-md bg-surface-secondary text-muted-foreground"><Icon className="size-5" aria-hidden="true" /></span> : null}
      <h3 className="nx-h3 text-foreground">{title}</h3>
      {description ? <p className="mt-1 max-w-md text-sm leading-6 text-secondary-foreground">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
