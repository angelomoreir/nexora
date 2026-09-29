import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router";
import { ArrowLeft, ArrowRight, HelpCircle, UserPlus, KeyRound, Lock, MessageSquare, Pin, Shield, Sparkles, Tags, Trash2, Webhook } from "lucide-react";
import { Button } from "../components/ui/button";
import { Page } from "../components/ui/page";
import { getArticleBySlug, HELP_CATEGORIES } from "../help/articles";

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

export function HelpArticlePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { slug } = useParams<{ slug: string }>();

  const article = useMemo(() => (slug ? getArticleBySlug(slug) : undefined), [slug]);
  const category = useMemo(() => (article ? HELP_CATEGORIES.find((c) => c.id === article.category) : undefined), [article]);
  const related = useMemo(() => (article ? article.relatedSlugs.map((s) => getArticleBySlug(s)).filter(Boolean) : []), [article]);

  if (!article) {
    return (
      <Page>
        <div className="rounded-lg border border-border bg-surface p-12 text-center shadow-sm">
          <HelpCircle className="mx-auto size-10 text-muted-foreground" />
          <h1 className="nx-h2 mt-4">{t("help.articleNotFound")}</h1>
          <Button className="mt-4" onClick={() => navigate("/help")}>
            <ArrowLeft className="size-4" />
            {t("help.backToHelp")}
          </Button>
        </div>
      </Page>
    );
  }

  const Icon = ICONS[article.icon] ?? HelpCircle;

  return (
    <Page>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-xs text-muted-foreground">
        <button className="hover:text-foreground" onClick={() => navigate("/help")}>
          {t("help.title")}
        </button>
        <span>/</span>
        {category ? (
          <button className="hover:text-foreground" onClick={() => navigate(`/help/category/${category.id}`)}>
            {t(category.titleKey)}
          </button>
        ) : null}
        <span>/</span>
        <span className="text-foreground">{t(article.titleKey)}</span>
      </nav>

      {/* Article header */}
      <header className="border-b border-border pb-6">
        <div className="flex items-start gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-primary-subtle text-primary">
            <Icon className="size-6" />
          </span>
          <div className="min-w-0">
            <h1 className="nx-h1">{t(article.titleKey)}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-secondary-foreground">{t(article.summaryKey)}</p>
          </div>
        </div>
      </header>

      {/* Article sections */}
      <div className="space-y-6">
        {article.sections.map((section, index) => (
          <section key={index} className="rounded-lg border border-border bg-surface p-6 shadow-sm">
            <h2 className="nx-h3 mb-3">{t(section.heading)}</h2>
            <p className="text-sm leading-7 text-secondary-foreground whitespace-pre-line">{t(section.body)}</p>
          </section>
        ))}
      </div>

      {/* Related articles */}
      {related.length > 0 ? (
        <div>
          <h2 className="nx-h3 mb-4">{t("help.relatedArticles")}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {related.map((rel) => {
              if (!rel) return null;
              const RelIcon = ICONS[rel.icon] ?? HelpCircle;
              return (
                <button
                  key={rel.slug}
                  className="group flex items-center gap-3 rounded-lg border border-border bg-surface p-4 text-left shadow-sm transition-colors hover:border-border-strong"
                  onClick={() => navigate(`/help/${rel.slug}`)}
                >
                  <RelIcon className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground group-hover:text-primary">{t(rel.titleKey)}</p>
                    <p className="truncate text-xs text-muted-foreground">{t(rel.summaryKey)}</p>
                  </div>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Back link */}
      <div className="border-t border-border pt-4">
        <Button variant="ghost" onClick={() => navigate("/help")}>
          <ArrowLeft className="size-4" />
          {t("help.backToHelp")}
        </Button>
      </div>
    </Page>
  );
}
