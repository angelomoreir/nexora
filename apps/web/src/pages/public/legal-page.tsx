import { useTranslation } from "react-i18next";
import { PublicSection } from "../../components/layout/public-layout";

interface LegalSection {
  heading: string;
  body: string;
}

function LegalPage({ kind }: { kind: "terms" | "privacy" | "security" }) {
  const { t } = useTranslation();
  const sections = t(`legal.${kind}.sections`, { returnObjects: true }) as LegalSection[];

  return (
    <PublicSection className="max-w-3xl">
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-primary">NEXORA</p>
      <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{t(`legal.${kind}.title`)}</h1>
      <p className="mt-3 text-sm text-nav-muted">{t(`legal.${kind}.updated`)}</p>
      <p className="mt-8 leading-relaxed text-nav-muted">{t(`legal.${kind}.intro`)}</p>
      <div className="mt-10 space-y-8">
        {sections.map((section) => (
          <section key={section.heading}>
            <h2 className="text-lg font-semibold">{section.heading}</h2>
            <p className="mt-2 text-sm leading-relaxed text-nav-muted">{section.body}</p>
          </section>
        ))}
      </div>
    </PublicSection>
  );
}

export function TermsPage() {
  return <LegalPage kind="terms" />;
}

export function PrivacyPage() {
  return <LegalPage kind="privacy" />;
}

export function SecurityPage() {
  return <LegalPage kind="security" />;
}
