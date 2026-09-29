import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { ArrowRight, FileText, HelpCircle, KeyRound, Lock, MessageSquare, Pin, Search as SearchIcon, Shield, Sparkles, Tags, Trash2, Webhook } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Page } from "../components/ui/page";
import { HELP_ARTICLES, HELP_CATEGORIES } from "../help/articles";

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

export function HelpAdminPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const filteredArticles = useMemo(() => {
    let articles = HELP_ARTICLES;
    if (selectedCategory) {
      articles = articles.filter((a) => a.category === selectedCategory);
    }
    if (query.trim()) {
      const lower = query.toLowerCase();
      articles = articles.filter(
        (a) =>
          a.slug.toLowerCase().includes(lower) ||
          a.keywords.some((k) => k.toLowerCase().includes(lower)) ||
          a.category.toLowerCase().includes(lower)
      );
    }
    return articles;
  }, [query, selectedCategory]);

  const stats = useMemo(() => ({
    totalArticles: HELP_ARTICLES.length,
    totalCategories: HELP_CATEGORIES.length,
    articlesWithContextualRoute: HELP_ARTICLES.filter((a) => a.contextualRoute).length,
    articlesWithRelated: HELP_ARTICLES.filter((a) => a.relatedSlugs.length > 0).length
  }), []);

  return (
    <Page>
      <header className="border-b border-border pb-6">
        <div className="flex items-center gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-primary-subtle text-primary">
            <HelpCircle className="size-6" />
          </span>
          <div className="min-w-0">
            <h1 className="nx-h1">{t("help.adminTitle")}</h1>
            <p className="mt-2 text-sm text-secondary-foreground">{t("help.adminDesc")}</p>
          </div>
        </div>
      </header>

      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
          <p className="nx-label text-muted-foreground">{t("help.adminTotalArticles")}</p>
          <p className="nx-h2 mt-1">{stats.totalArticles}</p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
          <p className="nx-label text-muted-foreground">{t("help.adminTotalCategories")}</p>
          <p className="nx-h2 mt-1">{stats.totalCategories}</p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
          <p className="nx-label text-muted-foreground">{t("help.adminContextualArticles")}</p>
          <p className="nx-h2 mt-1">{stats.articlesWithContextualRoute}</p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
          <p className="nx-label text-muted-foreground">{t("help.adminRelatedArticles")}</p>
          <p className="nx-h2 mt-1">{stats.articlesWithRelated}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 shadow-sm sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder={t("help.adminSearchPlaceholder")} value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant={selectedCategory === null ? "secondary" : "outline"} onClick={() => setSelectedCategory(null)}>
            {t("help.adminAllCategories")}
          </Button>
          {HELP_CATEGORIES.map((cat) => (
            <Button
              key={cat.id}
              size="sm"
              variant={selectedCategory === cat.id ? "secondary" : "outline"}
              onClick={() => setSelectedCategory(cat.id)}
            >
              {t(cat.titleKey)}
            </Button>
          ))}
        </div>
      </div>

      {/* Articles table */}
      <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-sm">
        <table className="nx-table">
          <thead>
            <tr className="border-b border-border bg-surface-secondary/50">
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">{t("help.adminColArticle")}</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">{t("help.adminColCategory")}</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">{t("help.adminColContextual")}</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">{t("help.adminColRelated")}</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {filteredArticles.map((article) => {
              const Icon = ICONS[article.icon] ?? HelpCircle;
              const category = HELP_CATEGORIES.find((c) => c.id === article.category);
              return (
                <tr key={article.slug} className="border-b border-border/50 last:border-0 hover:bg-surface-secondary/30">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Icon className="size-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{t(article.titleKey)}</p>
                        <p className="truncate text-xs text-muted-foreground">{article.slug}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-secondary-foreground">{category ? t(category.titleKey) : article.category}</td>
                  <td className="px-4 py-3 text-sm text-secondary-foreground">
                    {article.contextualRoute ? <code className="rounded bg-surface-secondary px-1.5 py-0.5 text-xs">{article.contextualRoute}</code> : "—"}
                  </td>
                  <td className="px-4 py-3 text-sm text-secondary-foreground">{article.relatedSlugs.length}</td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" variant="ghost" onClick={() => navigate(`/help/${article.slug}`)}>
                      {t("common.view")}
                      <ArrowRight className="size-3" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {filteredArticles.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-12 text-center shadow-sm">
          <FileText className="mx-auto size-10 text-muted-foreground" />
          <p className="mt-4 text-sm text-muted-foreground">{t("help.adminNoArticles")}</p>
        </div>
      ) : null}

      {/* Info note */}
      <div className="rounded-lg border border-border bg-primary-subtle/30 p-4">
        <p className="text-sm text-secondary-foreground">{t("help.adminNote")}</p>
      </div>
    </Page>
  );
}
