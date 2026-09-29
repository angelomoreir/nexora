import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLocaleFormatter } from "../../lib/format";
import { Button } from "./button";

export function Pagination({ page, totalPages, onPageChange, total, className }: { page: number; totalPages: number; onPageChange: (page: number) => void; total?: number; className?: string }) {
  const { t } = useTranslation();
  const { formatNumber } = useLocaleFormatter();
  return (
    <nav aria-label={t("common.pagination")} className={`flex flex-wrap items-center justify-between gap-3 ${className ?? ""}`}>
      <span className="text-sm text-muted-foreground">{total === undefined ? t("common.pageOf", { page, total: Math.max(totalPages, 1) }) : t("common.resultsCount", { count: total, formatted: formatNumber(total) })}</span>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon-sm" aria-label={t("common.previousPage")} disabled={page <= 1} onClick={() => onPageChange(page - 1)}><ChevronLeft /></Button>
        <span className="min-w-20 text-center text-sm font-medium text-secondary-foreground">{page} / {Math.max(totalPages, 1)}</span>
        <Button variant="ghost" size="icon-sm" aria-label={t("common.nextPage")} disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}><ChevronRight /></Button>
      </div>
    </nav>
  );
}
