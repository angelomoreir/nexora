import { useTranslation } from "react-i18next";

const LOCALE_MAP: Record<string, string> = {
  "pt-PT": "pt-PT",
  en: "en-US",
  fr: "fr-FR",
  es: "es-ES",
  de: "de-DE"
};

export function useLocaleFormatter() {
  const { i18n } = useTranslation();
  const locale = LOCALE_MAP[i18n.language] ?? "pt-PT";

  function formatDate(value: string | Date, options: Intl.DateTimeFormatOptions = { dateStyle: "medium" }) {
    return new Intl.DateTimeFormat(locale, options).format(typeof value === "string" ? new Date(value) : value);
  }
  function formatDateTime(value: string | Date) {
    return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(typeof value === "string" ? new Date(value) : value);
  }
  function formatTime(value: string | Date) {
    return new Intl.DateTimeFormat(locale, { timeStyle: "short" }).format(typeof value === "string" ? new Date(value) : value);
  }
  function formatNumber(value: number, options: Intl.NumberFormatOptions = {}) {
    return new Intl.NumberFormat(locale, options).format(value);
  }
  function formatPercent(value: number) {
    return new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 }).format(value);
  }
  function formatBytes(bytes: number) {
    if (!bytes) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(bytes / 1024 ** index)} ${units[index]}`;
  }
  function formatRelative(value: string | Date) {
    const date = typeof value === "string" ? new Date(value) : value;
    const diff = date.getTime() - Date.now();
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
    const absDiff = Math.abs(diff);
    if (absDiff < 60_000) return rtf.format(Math.round(diff / 1000), "second");
    if (absDiff < 3_600_000) return rtf.format(Math.round(diff / 60_000), "minute");
    if (absDiff < 86_400_000) return rtf.format(Math.round(diff / 3_600_000), "hour");
    if (absDiff < 604_800_000) return rtf.format(Math.round(diff / 86_400_000), "day");
    if (absDiff < 2_592_000_000) return rtf.format(Math.round(diff / 604_800_000), "week");
    if (absDiff < 31_536_000_000) return rtf.format(Math.round(diff / 2_592_000_000), "month");
    return rtf.format(Math.round(diff / 31_536_000_000), "year");
  }

  return { locale, formatDate, formatDateTime, formatTime, formatNumber, formatPercent, formatBytes, formatRelative };
}
