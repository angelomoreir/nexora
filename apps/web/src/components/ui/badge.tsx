import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "../../lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-xs font-semibold", {
  variants: {
    variant: {
      neutral: "bg-surface-secondary text-secondary-foreground",
      primary: "bg-primary-subtle text-primary-subtle-foreground",
      success: "bg-success-subtle text-success",
      warning: "bg-warning-subtle text-warning",
      danger: "bg-danger-subtle text-danger",
      info: "bg-info-subtle text-info",
      outline: "border border-border-strong bg-transparent text-secondary-foreground"
    }
  },
  defaultVariants: { variant: "neutral" }
});

export function Badge({ className, variant, ...props }: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { badgeVariants };
