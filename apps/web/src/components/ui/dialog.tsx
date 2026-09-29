import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/utils";
import { Button } from "./button";

export function Dialog({ open, onOpenChange, title, description, children, footer, size = "md", className }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; description?: string; children?: ReactNode; footer?: ReactNode; size?: "sm" | "md" | "lg" | "xl"; className?: string }) {
  const { t } = useTranslation();
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => event.key === "Escape" && onOpenChange(false);
    document.addEventListener("keydown", close);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", close); document.body.style.overflow = overflow; };
  }, [onOpenChange, open]);

  if (!open) return null;
  const widths = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" };
  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-overlay p-4" onMouseDown={(event) => event.target === event.currentTarget && onOpenChange(false)}>
      <section role="dialog" aria-modal="true" aria-labelledby="dialog-title" aria-describedby={description ? "dialog-description" : undefined} className={cn("w-full rounded-lg border border-border bg-surface text-foreground shadow-[var(--nx-shadow-overlay)]", widths[size], className)}>
        <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4"><div><h2 id="dialog-title" className="nx-h2">{title}</h2>{description ? <p id="dialog-description" className="mt-1 text-sm text-secondary-foreground">{description}</p> : null}</div><Button variant="ghost" size="icon-sm" aria-label={t("common.close")} onClick={() => onOpenChange(false)}><X /></Button></header>
        {children ? <div className="max-h-[70vh] overflow-y-auto p-5">{children}</div> : null}
        {footer ? <footer className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-4">{footer}</footer> : null}
      </section>
    </div>, document.body
  );
}
