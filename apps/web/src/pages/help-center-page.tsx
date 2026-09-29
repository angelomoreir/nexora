import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { ArrowRight, HelpCircle, UserPlus, KeyRound, Lock, MessageSquare, Pin, Search as SearchIcon, Settings, Shield, Sparkles, Tags, Trash2, Webhook } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Page } from "../components/ui/page";
import { HELP_ARTICLES, HELP_CATEGORIES, searchArticles } from "../help/articles";

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

export function HelpCenterPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  const searchResults = useMemo(() => (query.trim() ? searchArticles(query).slice(0, 8) : []), [query]);

  const popularSlugs = ["getting-started", "upload-document", "create-task", "workflow-builder", "manage-users", "share-document"];
  const popularArticles = popularSlugs.map((slug) => HELP_ARTICLES.find((a) => a.slug === slug)).filter(Boolean);

  return (
    <Page>
      {/* Hero search */}
      <div className="rounded-xl border border-border bg-gradient-to-br from-primary-subtle/60 to-surface p-8 shadow-sm sm:p-12">
        <div className="mx-auto max-w-2xl text-center">
          <div className="mx-auto mb-4 grid size-14 place-items-center rounded-full bg-primary text-white shadow-sm">
            <HelpCircle className="size-7" />
          </div>
          <h1 className="nx-h1">{t("help.title")}</h1>
          <p className="mt-2 text-sm text-secondary-foreground">{t("help.subtitle")}</p>
          <div className="relative mt-6">
            <SearchIcon className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-12 pl-12 text-base"
              placeholder={t("help.searchPlaceholder")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
            {searchResults.length > 0 ? (
              <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-lg border border-border bg-surface shadow-[var(--nx-shadow-overlay)]">
                {searchResults.map(({ article }) => {
                  const Icon = ICONS[article.icon] ?? HelpCircle;
                  return (
                    <button
                      key={article.slug}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-secondary"
                      onClick={() => navigate(`/help/${article.slug}`)}
                    >
                      <Icon className="size-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{t(article.titleKey)}</p>
                        <p className="truncate text-xs text-muted-foreground">{t(article.summaryKey)}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* AI Assistant CTA */}
      <div className="flex flex-col items-start justify-between gap-4 rounded-lg border border-border bg-surface p-5 shadow-sm sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-md bg-primary-subtle text-primary">
            <Sparkles className="size-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">{t("help.assistantTitle")}</h2>
            <p className="text-xs text-muted-foreground">{t("help.assistantDesc")}</p>
          </div>
        </div>
        <Button onClick={() => navigate("/help/assistant")}>
          <Sparkles className="size-4" />
          {t("help.openAssistant")}
        </Button>
      </div>

      {/* Admin link */}
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={() => navigate("/help/admin")}>
          <Settings className="size-4" />
          {t("help.adminTitle")}
        </Button>
      </div>

      {/* Categories */}
      <div>
        <h2 className="nx-h3 mb-4">{t("help.categoriesTitle")}</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {HELP_CATEGORIES.map((cat) => {
            const Icon = ICONS[cat.icon] ?? HelpCircle;
            return (
              <button
                key={cat.id}
                className="group flex items-start gap-3 rounded-lg border border-border bg-surface p-5 text-left shadow-sm transition-colors hover:border-border-strong hover:bg-surface-secondary/40"
                onClick={() => navigate(`/help/category/${cat.id}`)}
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-md bg-primary-subtle text-primary">
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-foreground group-hover:text-primary">{t(cat.titleKey)}</h3>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{t(cat.descriptionKey)}</p>
                  <p className="mt-2 text-[11px] font-medium text-muted-foreground">
                    {cat.articleSlugs.length} {t("help.articlesCount")}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Popular articles */}
      <div>
        <h2 className="nx-h3 mb-4">{t("help.popularTitle")}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {popularArticles.map((article) => {
            if (!article) return null;
            const Icon = ICONS[article.icon] ?? HelpCircle;
            return (
              <button
                key={article.slug}
                className="group flex items-center gap-3 rounded-lg border border-border bg-surface p-4 text-left shadow-sm transition-colors hover:border-border-strong"
                onClick={() => navigate(`/help/${article.slug}`)}
              >
                <Icon className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground group-hover:text-primary">{t(article.titleKey)}</p>
                  <p className="truncate text-xs text-muted-foreground">{t(article.summaryKey)}</p>
                </div>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </button>
            );
          })}
        </div>
      </div>
    </Page>
  );
}
