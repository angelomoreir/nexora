import { AlertCircle, CheckCircle2, Info, TriangleAlert } from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/utils";

const styles = {
  info: { className: "border-info/25 bg-info-subtle text-info", icon: Info },
  success: { className: "border-success/25 bg-success-subtle text-success", icon: CheckCircle2 },
  warning: { className: "border-warning/25 bg-warning-subtle text-warning", icon: TriangleAlert },
  danger: { className: "border-danger/25 bg-danger-subtle text-danger", icon: AlertCircle }
};

export function Alert({ variant = "info", title, children, className, ...props }: HTMLAttributes<HTMLDivElement> & { variant?: keyof typeof styles; title?: string; children?: ReactNode }) {
  const style = styles[variant];
  const Icon = style.icon;
  return (
    <div role={variant === "danger" ? "alert" : "status"} className={cn("flex gap-3 rounded-md border p-3.5", style.className, className)} {...props}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 text-sm"><div className="font-semibold">{title}</div>{children ? <div className={cn("leading-5", title && "mt-1 opacity-90")}>{children}</div> : null}</div>
    </div>
  );
}
