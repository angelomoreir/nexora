import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { cn } from "../../lib/utils";

export interface BreadcrumbItem { label: string; href?: string; icon?: ReactNode }

export function Breadcrumb({ items, className }: { items: BreadcrumbItem[]; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={cn("flex items-center gap-1 overflow-hidden text-sm text-muted-foreground", className)}>
      {items.map((item, index) => <span key={`${item.label}-${index}`} className="flex min-w-0 items-center gap-1">
        {index > 0 ? <ChevronRight className="size-3.5 shrink-0" aria-hidden="true" /> : null}
        {item.href && index < items.length - 1 ? <Link to={item.href} className="flex min-w-0 items-center gap-1 truncate hover:text-foreground">{item.icon}{item.label}</Link> : <span aria-current={index === items.length - 1 ? "page" : undefined} className={cn("flex min-w-0 items-center gap-1 truncate", index === items.length - 1 && "font-medium text-secondary-foreground")}>{item.icon}{item.label}</span>}
      </span>)}
    </nav>
  );
}
