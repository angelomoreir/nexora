import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { HelpCircle } from "lucide-react";
import { getArticleForRoute } from "../../help/articles";

interface ContextualHelpButtonProps {
  route?: string;
  className?: string;
  showLabel?: boolean;
}

/**
 * Contextual help button that links to the most relevant help article
 * based on the current route. Renders a ? icon button.
 */
export function ContextualHelpButton({ route, className = "", showLabel = false }: ContextualHelpButtonProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // Use provided route or fall back to current location
  const currentRoute = route ?? window.location.pathname;
  const article = getArticleForRoute(currentRoute);

  if (!article) return null;

  return (
    <button
      className={`nx-focus-ring inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-2 text-sm font-medium text-secondary-foreground shadow-sm transition-colors hover:border-primary hover:text-primary ${className}`}
      onClick={() => navigate(`/help/${article.slug}`)}
      title={t(article.titleKey)}
      aria-label={t("help.contextualHelpAria", { title: t(article.titleKey) })}
    >
      <HelpCircle className="size-4" />
      {showLabel ? <span>{t("help.contextualHelp")}</span> : null}
    </button>
  );
}
