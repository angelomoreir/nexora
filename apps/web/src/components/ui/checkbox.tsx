import { forwardRef, type ComponentProps } from "react";
import { cn } from "../../lib/utils";

export const Checkbox = forwardRef<HTMLInputElement, ComponentProps<"input">>(({ className, ...props }, ref) => (
  <input ref={ref} type="checkbox" className={cn("size-4 shrink-0 cursor-pointer rounded-sm border-border-strong accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nx-focus)] disabled:cursor-not-allowed disabled:opacity-[var(--nx-disabled-opacity)]", className)} {...props} />
));
Checkbox.displayName = "Checkbox";
