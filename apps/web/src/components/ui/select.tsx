import { ChevronDown } from "lucide-react";
import { forwardRef, type ComponentProps } from "react";
import { cn } from "../../lib/utils";

export const Select = forwardRef<HTMLSelectElement, ComponentProps<"select">>(({ className, children, ...props }, ref) => (
  <span className="relative block">
    <select ref={ref} className={cn("nx-focus-ring h-10 w-full appearance-none rounded-md border border-border-strong bg-surface px-3 pr-9 text-sm text-foreground shadow-sm transition disabled:cursor-not-allowed disabled:bg-surface-secondary disabled:opacity-[var(--nx-disabled-opacity)]", className)} {...props}>{children}</select>
    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
  </span>
));
Select.displayName = "Select";
