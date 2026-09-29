import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { LoaderCircle } from "lucide-react";
import type * as React from "react";
import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "nx-focus-ring inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-transparent text-sm font-semibold transition-[color,background-color,border-color,box-shadow,transform] duration-[var(--nx-duration-fast)] ease-[var(--nx-ease-out)] active:translate-y-px disabled:pointer-events-none disabled:translate-y-0 disabled:opacity-[var(--nx-disabled-opacity)] [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-white hover:bg-primary-hover active:bg-primary-active",
        primary: "bg-primary text-white hover:bg-primary-hover active:bg-primary-active",
        secondary: "bg-surface-secondary text-foreground hover:bg-surface-hover active:bg-border",
        ghost: "text-secondary-foreground hover:bg-surface-hover hover:text-foreground active:bg-border",
        destructive: "bg-danger text-white hover:bg-danger-hover active:bg-danger-hover",
        outline: "border-border-strong bg-surface text-secondary-foreground hover:bg-surface-secondary hover:text-foreground active:bg-surface-hover"
      },
      size: {
        sm: "h-8 px-3 text-xs",
        default: "h-10 px-4",
        lg: "h-11 px-5",
        icon: "size-10 p-0",
        "icon-sm": "size-8 p-0"
      }
    },
    defaultVariants: { variant: "default", size: "default" }
  }
);

function Button({ className, variant, size, asChild = false, loading = false, disabled, children, ...props }: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean; loading?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp className={cn(buttonVariants({ variant, size, className }))} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {loading ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
      {children}
    </Comp>
  );
}

export { Button, buttonVariants };
