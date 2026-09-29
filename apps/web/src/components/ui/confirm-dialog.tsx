import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "./button";
import { Dialog } from "./dialog";

interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  destructive?: boolean;
}

export function ConfirmDialog({ open, title, description, confirmLabel, destructive = true, onConfirm, onCancel }: ConfirmOptions & { open: boolean; onConfirm: () => void; onCancel: () => void }) {
  const { t } = useTranslation();
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => { if (!next) onCancel(); }}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onCancel}>{t("common.cancel")}</Button>
          <Button variant={destructive ? "destructive" : "primary"} onClick={onConfirm}>{confirmLabel ?? t("common.confirm")}</Button>
        </>
      }
    />
  );
}

// Promise-based confirmation dialog — drop-in replacement for window.confirm.
// Usage: const { confirm, confirmDialog } = useConfirm();
//        if (await confirm(t("..."))) mutate();   ...render {confirmDialog}
export function useConfirm() {
  const [request, setRequest] = useState<(ConfirmOptions & { resolve: (value: boolean) => void }) | null>(null);

  const confirm = useCallback((options: ConfirmOptions | string) => {
    const parsed = typeof options === "string" ? { title: options } : options;
    return new Promise<boolean>((resolve) => setRequest({ ...parsed, resolve }));
  }, []);

  const settle = useCallback((value: boolean) => {
    setRequest((current) => {
      current?.resolve(value);
      return null;
    });
  }, []);

  const confirmDialog = (
    <ConfirmDialog
      open={request !== null}
      title={request?.title ?? ""}
      description={request?.description}
      confirmLabel={request?.confirmLabel}
      destructive={request?.destructive ?? true}
      onConfirm={() => settle(true)}
      onCancel={() => settle(false)}
    />
  );

  return { confirm, confirmDialog };
}
