import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { ArrowLeft, ArrowRight, HelpCircle, UserPlus, KeyRound, Lock, MessageSquare, Pin, Search as SearchIcon, Shield, Sparkles, Tags, Trash2, Webhook } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Page } from "../components/ui/page";
import { HELP_CATEGORIES, searchArticles } from "../help/articles";

const ICONS: Record<string, typeof HelpCircle> = {
  Rocket: HelpCircle,
  FileText: HelpCircle,
  List: HelpCircle,
  FilePlus: HelpCircle,
  CheckSquare: HelpCircle,
  GitBranch: HelpCircle,
  CheckCheck: HelpCircle,
  Bell: HelpCircle,
  Search: SearchIcon,
  Sparkles: Sparkles,
  Shield: Shield,
  CreditCard: HelpCircle,
  UserRound: HelpCircle,
  UserPlus: UserPlus,
  HelpCircle: HelpCircle,
  Wrench: HelpCircle,
  Trash2: Trash2,
  MessageSquare: MessageSquare,
  Lock: Lock,
  Tags: Tags,
  KeyRound: KeyRound,
  Pin: Pin,
  Webhook: Webhook
};

export function HelpSearchPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  const results = useMemo(() => (query.trim() ? searchArticles(query) : []), [query]);

  return (
    <Page>
      <nav className="flex items-center gap-2 text-xs text-muted-foreground">
        <button className="hover:text-foreground" onClick={() => navigate("/help")}>
          {t("help.title")}
        </button>
        <span>/</span>
        <span className="text-foreground">{t("help.searchTitle")}</span>
      </nav>

      <header className="border-b border-border pb-6">
        <h1 className="nx-h1">{t("help.searchTitle")}</h1>
        <p className="mt-2 text-sm text-secondary-foreground">{t("help.searchDesc")}</p>
        <div className="relative mt-4 max-w-xl">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-11 pl-10" placeholder={t("help.searchPlaceholder")} value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
        </div>
      </header>

      {query.trim() === "" ? (
        <div className="rounded-lg border border-border bg-surface p-12 text-center shadow-sm">
          <HelpCircle className="mx-auto size-10 text-muted-foreground" />
          <p className="mt-4 text-sm text-muted-foreground">{t("help.searchStartTyping")}</p>
        </div>
      ) : results.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-12 text-center shadow-sm">
          <HelpCircle className="mx-auto size-10 text-muted-foreground" />
          <p className="mt-4 text-sm text-muted-foreground">{t("help.searchNoResults", { query })}</p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{t("help.searchResultsCount", { count: results.length })}</p>
          {results.map(({ article }) => {
            const Icon = ICONS[article.icon] ?? HelpCircle;
            const category = HELP_CATEGORIES.find((c) => c.id === article.category);
            return (
              <button
                key={article.slug}
                className="group flex w-full items-center gap-3 rounded-lg border border-border bg-surface p-4 text-left shadow-sm transition-colors hover:border-border-strong"
                onClick={() => navigate(`/help/${article.slug}`)}
              >
                <Icon className="size-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-foreground group-hover:text-primary">{t(article.titleKey)}</p>
                    {category ? <span className="shrink-0 rounded-full bg-surface-secondary px-2 py-0.5 text-[10px] text-muted-foreground">{t(category.titleKey)}</span> : null}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{t(article.summaryKey)}</p>
                </div>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </button>
            );
          })}
        </div>
      )}

      <div className="border-t border-border pt-4">
        <Button variant="ghost" onClick={() => navigate("/help")}>
          <ArrowLeft className="size-4" />
          {t("help.backToHelp")}
        </Button>
      </div>
    </Page>
  );
}
