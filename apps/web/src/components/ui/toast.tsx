import { CheckCircle2, Info, TriangleAlert, X, XCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/utils";

export type ToastTone = "info" | "success" | "warning" | "danger";
interface ToastItem { id: string; title: string; description?: string; tone: ToastTone }
interface ToastContextValue { toast: (input: Omit<ToastItem, "id"> & { duration?: number }) => void }
const ToastContext = createContext<ToastContextValue | null>(null);
const icons = { info: Info, success: CheckCircle2, warning: TriangleAlert, danger: XCircle };
const tones = { info: "text-info", success: "text-success", warning: "text-warning", danger: "text-danger" };

export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [items, setItems] = useState<ToastItem[]>([]);
  const dismiss = useCallback((id: string) => setItems((current) => current.filter((item) => item.id !== id)), []);
  const toast = useCallback((input: Omit<ToastItem, "id"> & { duration?: number }) => { const id = crypto.randomUUID(); setItems((current) => [...current, { ...input, id }]); window.setTimeout(() => dismiss(id), input.duration ?? 4000); }, [dismiss]);
  const value = useMemo(() => ({ toast }), [toast]);
  return <ToastContext.Provider value={value}>{children}{createPortal(<div className="fixed bottom-4 right-4 z-[70] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">{items.map((item) => { const Icon = icons[item.tone]; return <div key={item.id} role={item.tone === "danger" ? "alert" : "status"} className="flex items-start gap-3 rounded-lg border border-border bg-surface p-4 text-foreground shadow-[var(--nx-shadow-overlay)]"><Icon className={cn("mt-0.5 size-4 shrink-0", tones[item.tone])} /><div className="min-w-0 flex-1"><div className="text-sm font-semibold">{item.title}</div>{item.description ? <p className="mt-0.5 text-sm text-secondary-foreground">{item.description}</p> : null}</div><button type="button" onClick={() => dismiss(item.id)} aria-label={t("common.close")} className="rounded-sm p-0.5 text-muted-foreground hover:bg-surface-secondary hover:text-foreground"><X className="size-4" /></button></div>; })}</div>, document.body)}</ToastContext.Provider>;
}

export function useToast() { const context = useContext(ToastContext); if (!context) throw new Error("Toast context is unavailable"); return context; }
