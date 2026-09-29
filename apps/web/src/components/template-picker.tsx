import { Check, LayoutTemplate } from "lucide-react";
import { cn } from "../lib/utils";

export interface TemplatePickerOption {
  id: string;
  name: string;
  description: string;
}

export function TemplatePicker({
  options,
  value,
  onChange,
  blankLabel,
  blankDescription
}: {
  options: TemplatePickerOption[];
  value: string | null;
  onChange: (id: string | null) => void;
  blankLabel: string;
  blankDescription: string;
}) {
  const renderCard = (id: string | null, name: string, description: string) => {
    const selected = value === id;
    return (
      <button
        key={id ?? "blank"}
        type="button"
        onClick={() => onChange(id)}
        className={cn(
          "nx-focus-ring relative rounded-md border p-3 text-left transition-colors",
          selected ? "border-primary bg-primary-subtle" : "border-border bg-surface hover:border-border-strong hover:bg-surface-secondary/40"
        )}
      >
        {selected ? <Check className="absolute right-2.5 top-2.5 size-4 text-primary" /> : null}
        <span className="flex items-center gap-2 text-sm font-medium text-foreground">
          <LayoutTemplate className={cn("size-4 shrink-0", selected ? "text-primary" : "text-muted-foreground")} />
          {name}
        </span>
        <span className="mt-1 line-clamp-2 block text-xs leading-5 text-muted-foreground">{description}</span>
      </button>
    );
  };

  return (
    <div className="grid gap-2 sm:grid-cols-2" role="listbox" aria-label={blankLabel}>
      {renderCard(null, blankLabel, blankDescription)}
      {options.map((option) => renderCard(option.id, option.name, option.description))}
    </div>
  );
}
