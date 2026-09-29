import { Check, Globe } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Dropdown, DropdownItem } from "./dropdown";
import { SUPPORTED_LANGUAGES } from "../../i18n";
import { cn } from "../../lib/utils";

export function LanguageSelector({ compact = false }: { compact?: boolean }) {
  const { i18n, t } = useTranslation();
  const current = SUPPORTED_LANGUAGES.find((l) => l.code === i18n.language) ?? SUPPORTED_LANGUAGES[0];

  return (
    <Dropdown
      trigger={
        <button
          type="button"
          aria-label={t("languageSelector.ariaLabel")}
          className="nx-focus-ring flex items-center gap-2 rounded-md p-2 text-sm text-secondary-foreground transition-colors hover:bg-surface-secondary hover:text-foreground"
        >
          <Globe className="size-4" />
          {!compact ? <span className="hidden sm:inline">{current.flag} {current.label}</span> : null}
          <span className="sm:hidden">{current.flag}</span>
        </button>
      }
    >
      {SUPPORTED_LANGUAGES.map((lang) => (
        <DropdownItem
          key={lang.code}
          onClick={() => i18n.changeLanguage(lang.code)}
          className={cn(i18n.language === lang.code && "bg-surface-secondary text-foreground")}
        >
          <span className="flex-1">{lang.flag} {lang.label}</span>
          {i18n.language === lang.code ? <Check className="size-4 text-primary" /> : null}
        </DropdownItem>
      ))}
    </Dropdown>
  );
}
