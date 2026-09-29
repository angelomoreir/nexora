import { forwardRef, type ComponentProps } from "react";
import { cn } from "../../lib/utils";

export interface InputProps extends ComponentProps<"input"> {
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(({ className, invalid, ...props }, ref) => (
  <input
    ref={ref}
    aria-invalid={invalid || undefined}
    className={cn("nx-focus-ring h-10 w-full rounded-md border border-border-strong bg-surface px-3 text-sm text-foreground shadow-sm transition placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:bg-surface-secondary disabled:opacity-[var(--nx-disabled-opacity)] aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger/15", className)}
    {...props}
  />
));
Input.displayName = "Input";

export function Field({ label, htmlFor, required, error, helper, children, className }: { label: string; htmlFor?: string; required?: boolean; error?: string; helper?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="nx-label block">{label}{required ? <span className="ml-1 text-danger" aria-hidden="true">*</span> : null}</label>
      {children}
      {error ? <p className="text-xs text-danger" role="alert">{error}</p> : helper ? <p className="nx-caption">{helper}</p> : null}
    </div>
  );
}
