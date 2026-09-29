import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/utils";

export function Page({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mx-auto max-w-[90rem] space-y-6", className)} {...props} />;
}

export function PageHeader({ eyebrow, title, description, actions, className }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode; className?: string }) {
  return <header className={cn("flex flex-col justify-between gap-4 border-b border-border pb-6 sm:flex-row sm:items-end", className)}><div className="min-w-0">{eyebrow ? <p className="nx-label mb-2 text-primary">{eyebrow}</p> : null}<h1 className="nx-h1">{title}</h1>{description ? <p className="mt-2 max-w-2xl text-sm leading-6 text-secondary-foreground">{description}</p> : null}</div>{actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}</header>;
}

export function PageSection({ title, description, actions, children, className, contentClassName }: { title?: string; description?: string; actions?: ReactNode; children: ReactNode; className?: string; contentClassName?: string }) {
  return <section className={cn("rounded-lg border border-border bg-surface shadow-sm", className)}>{title || description || actions ? <header className="flex flex-col justify-between gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-center"><div>{title ? <h2 className="nx-h3">{title}</h2> : null}{description ? <p className="mt-0.5 text-sm text-muted-foreground">{description}</p> : null}</div>{actions}</header> : null}<div className={cn("p-5", contentClassName)}>{children}</div></section>;
}

export function Toolbar({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-3 rounded-lg border border-border bg-surface p-3 shadow-sm lg:flex-row lg:items-center", className)} {...props} />;
}
