import { forwardRef, type ComponentProps } from "react";
import { cn } from "../../lib/utils";

export interface TextareaProps extends ComponentProps<"textarea"> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, invalid, ...props }, ref) => (
  <textarea ref={ref} aria-invalid={invalid || undefined} className={cn("nx-focus-ring min-h-24 w-full resize-y rounded-md border border-border-strong bg-surface px-3 py-2 text-sm leading-6 text-foreground shadow-sm transition placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:bg-surface-secondary disabled:opacity-[var(--nx-disabled-opacity)] aria-[invalid=true]:border-danger", className)} {...props} />
));
Textarea.displayName = "Textarea";
