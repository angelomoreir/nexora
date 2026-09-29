import { ArrowRight, Compass, Layers, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { PublicSection, PublicSectionTitle } from "../../components/layout/public-layout";
import { Button } from "../../components/ui";

export function AboutPage() {
  const { t } = useTranslation();
  const values = t("public.about.values", { returnObjects: true }) as { title: string; desc: string }[];
  const icons = [Compass, Layers, ShieldCheck];

  return (
    <PublicSection>
      <PublicSectionTitle eyebrow={t("public.nav.about")} title={t("public.about.title")} sub={t("public.about.sub")} />
      <div className="mx-auto max-w-3xl space-y-6 text-center">
        <p className="text-lg leading-relaxed text-nav-muted">{t("public.about.p1")}</p>
        <p className="leading-relaxed text-nav-muted">{t("public.about.p2")}</p>
      </div>
      <div className="mx-auto mt-14 grid max-w-4xl gap-5 md:grid-cols-3">
        {values.map((value, index) => {
          const Icon = icons[index % icons.length]!;
          return (
            <div key={value.title} className="rounded-xl border border-border bg-surface p-6 text-center">
              <div className="mx-auto mb-3 inline-flex rounded-lg bg-primary/15 p-2.5 text-primary"><Icon className="size-5" /></div>
              <h3 className="font-semibold">{value.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-nav-muted">{value.desc}</p>
            </div>
          );
        })}
      </div>
      <div className="mt-12 text-center">
        <Link to="/register"><Button size="lg">{t("public.about.cta")}<ArrowRight className="size-4" /></Button></Link>
      </div>
    </PublicSection>
  );
}
