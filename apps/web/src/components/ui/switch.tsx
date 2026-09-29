import { cn } from "../../lib/utils";

export function Switch({ checked, onCheckedChange, disabled, className, label }: { checked: boolean; onCheckedChange: (checked: boolean) => void; disabled?: boolean; className?: string; label?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onCheckedChange(!checked)} className={cn("nx-focus-ring relative inline-flex h-5 w-9 shrink-0 rounded-full border border-transparent bg-border-strong transition-colors aria-checked:bg-primary disabled:cursor-not-allowed disabled:opacity-[var(--nx-disabled-opacity)]", className)}>
      <span className={cn("pointer-events-none block size-4 rounded-full bg-white shadow-sm transition-transform duration-[var(--nx-duration-fast)]", checked ? "translate-x-4" : "translate-x-0")} />
    </button>
  );
}
