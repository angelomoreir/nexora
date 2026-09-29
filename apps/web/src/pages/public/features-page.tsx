import { ArrowRight, BarChart3, CheckCheck, ClipboardList, FileInput, FileText, Globe, ListTodo, Lock, Newspaper, Search, ShieldCheck, Sparkles, Users, Workflow } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { PublicSection, PublicSectionTitle } from "../../components/layout/public-layout";
import { Button } from "../../components/ui";

const SECTION_ICONS = [Globe, FileText, ClipboardList, ListTodo, Workflow, CheckCheck, FileInput, Newspaper, Users, Search, Sparkles, ShieldCheck, BarChart3, Lock];

export function FeaturesPage() {
  const { t } = useTranslation();
  const sections = t("public.features.sections", { returnObjects: true }) as { title: string; desc: string; points: string[] }[];

  return (
    <div>
      <PublicSection>
        <PublicSectionTitle eyebrow={t("public.nav.features")} title={t("public.features.title")} sub={t("public.features.sub")} />
        <div className="grid gap-5 md:grid-cols-2">
          {sections.map((section, index) => {
            const Icon = SECTION_ICONS[index % SECTION_ICONS.length]!;
            return (
              <div key={section.title} className="rounded-xl border border-border bg-surface p-6">
                <div className="mb-3 inline-flex rounded-lg bg-primary/15 p-2.5 text-primary"><Icon className="size-5" /></div>
                <h3 className="text-lg font-semibold">{section.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-nav-muted">{section.desc}</p>
                <ul className="mt-4 space-y-1.5">
                  {section.points.map((point) => (
                    <li key={point} className="flex items-start gap-2 text-sm text-nav-muted">
                      <CheckCheck className="mt-0.5 size-3.5 shrink-0 text-success" />{point}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
        <div className="mt-12 text-center">
          <Link to="/register"><Button size="lg">{t("public.features.cta")}<ArrowRight className="size-4" /></Button></Link>
        </div>
      </PublicSection>
    </div>
  );
}
