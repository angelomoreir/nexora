import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router";
import { ArrowLeft, ArrowRight, HelpCircle, UserPlus, KeyRound, Lock, MessageSquare, Pin, Shield, Sparkles, Tags, Trash2, Webhook } from "lucide-react";
import { Button } from "../components/ui/button";
import { Page } from "../components/ui/page";
import { getArticlesByCategory, HELP_CATEGORIES } from "../help/articles";

const ICONS: Record<string, typeof HelpCircle> = {
  Rocket: HelpCircle,
  FileText: HelpCircle,
  List: HelpCircle,
  FilePlus: HelpCircle,
  CheckSquare: HelpCircle,
  GitBranch: HelpCircle,
  CheckCheck: HelpCircle,
  Bell: HelpCircle,
  Search: HelpCircle,
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

export function HelpCategoryPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { categoryId } = useParams<{ categoryId: string }>();

  const category = useMemo(() => HELP_CATEGORIES.find((c) => c.id === categoryId), [categoryId]);
  const articles = useMemo(() => (categoryId ? getArticlesByCategory(categoryId) : []), [categoryId]);

  if (!category) {
    return (
      <Page>
        <div className="rounded-lg border border-border bg-surface p-12 text-center shadow-sm">
          <HelpCircle className="mx-auto size-10 text-muted-foreground" />
          <h1 className="nx-h2 mt-4">{t("help.categoryNotFound")}</h1>
          <Button className="mt-4" onClick={() => navigate("/help")}>
            <ArrowLeft className="size-4" />
            {t("help.backToHelp")}
          </Button>
        </div>
      </Page>
    );
  }

  const Icon = ICONS[category.icon] ?? HelpCircle;

  return (
    <Page>
      <nav className="flex items-center gap-2 text-xs text-muted-foreground">
        <button className="hover:text-foreground" onClick={() => navigate("/help")}>
          {t("help.title")}
        </button>
        <span>/</span>
        <span className="text-foreground">{t(category.titleKey)}</span>
      </nav>

      <header className="flex items-start gap-4 border-b border-border pb-6">
        <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-primary-subtle text-primary">
          <Icon className="size-6" />
        </span>
        <div className="min-w-0">
          <h1 className="nx-h1">{t(category.titleKey)}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-secondary-foreground">{t(category.descriptionKey)}</p>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        {articles.map((article) => {
          const ArticleIcon = ICONS[article.icon] ?? HelpCircle;
          return (
            <button
              key={article.slug}
              className="group flex items-center gap-3 rounded-lg border border-border bg-surface p-4 text-left shadow-sm transition-colors hover:border-border-strong"
              onClick={() => navigate(`/help/${article.slug}`)}
            >
              <ArticleIcon className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground group-hover:text-primary">{t(article.titleKey)}</p>
                <p className="truncate text-xs text-muted-foreground">{t(article.summaryKey)}</p>
              </div>
              <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </button>
          );
        })}
      </div>

      <div className="border-t border-border pt-4">
        <Button variant="ghost" onClick={() => navigate("/help")}>
          <ArrowLeft className="size-4" />
          {t("help.backToHelp")}
        </Button>
      </div>
    </Page>
  );
}
