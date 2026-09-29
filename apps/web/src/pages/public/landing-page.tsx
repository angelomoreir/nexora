import { ArrowRight, BarChart3, CheckCheck, ClipboardList, Database, FileInput, FileText, Globe, Languages, ListTodo, Lock, Newspaper, Search, ShieldCheck, Sparkles, Workflow, Zap } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { PublicSection, PublicSectionTitle } from "../../components/layout/public-layout";
import { Button } from "../../components/ui";

const FEATURE_ICONS = [FileText, ClipboardList, Workflow, CheckCheck, Globe, ListTodo, Newspaper, FileInput, Sparkles, Search, ShieldCheck, BarChart3];
const FEATURE_COLORS = ["#6366f1", "#f59e0b", "#10b981", "#22d3ee", "#8b5cf6", "#ec4899", "#0ea5e9", "#14b8a6", "#a855f7", "#f97316", "#ef4444", "#84cc16"];

export function LandingPage() {
  const { t } = useTranslation();
  const features = t("public.landing.features", { returnObjects: true }) as { title: string; desc: string }[];
  const mockNav = [t("navigation.dashboard"), t("navigation.sites"), t("navigation.documents"), t("navigation.lists"), t("navigation.tasks"), t("navigation.workflows"), "NEXORA AI"];

  return (
    <div>
      <div className="relative overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-primary/20 blur-[120px]" />
        <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-24 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-secondary px-4 py-1.5 text-xs text-nav-muted">
            <Sparkles className="size-3.5 text-primary" />
            {t("public.landing.badge")}
          </div>
          <h1 className="mt-6 text-4xl font-extrabold leading-[1.05] tracking-tight md:text-6xl">
            {t("public.landing.heroTitleA")}
            <br />
            <span className="text-primary">{t("public.landing.heroTitleB")}</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-nav-muted">{t("public.landing.heroSub")}</p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link to="/register"><Button size="lg">{t("public.landing.ctaStart")}<ArrowRight className="size-4" /></Button></Link>
            <Link to="/contact?intent=demo"><Button size="lg" variant="outline" className="border-border-strong bg-transparent text-nav-foreground hover:bg-surface-hover">{t("public.landing.ctaDemo")}</Button></Link>
          </div>
          <p className="mt-4 text-xs text-nav-muted">{t("public.landing.ctaNote")}</p>

          <div className="relative mx-auto mt-16 max-w-4xl">
            <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl">
              <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
                <div className="flex gap-1.5">
                  <span className="size-2.5 rounded-full bg-danger/70" />
                  <span className="size-2.5 rounded-full bg-warning/70" />
                  <span className="size-2.5 rounded-full bg-success/70" />
                </div>
                <div className="mx-auto flex h-6 w-64 items-center justify-center rounded-md bg-surface-secondary text-[10px] text-nav-muted">nexora.app/dashboard</div>
              </div>
              <div className="flex">
                <div className="hidden w-44 space-y-1.5 border-r border-border p-3 text-left sm:block">
                  {mockNav.map((item, index) => (
                    <div key={item} className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[11px] ${index === 0 ? "bg-primary/25 text-white" : "text-nav-muted"}`}>
                      <span className="size-1.5 rounded-full bg-current opacity-60" />{item}
                    </div>
                  ))}
                </div>
                <div className="flex-1 p-4 text-left">
                  <div className="mb-3 text-xs font-semibold text-nav-foreground">Dashboard — NEXORA</div>
                  <div className="mb-3 grid grid-cols-3 gap-2">
                    {[[t("navigation.documents"), "12"], [t("public.landing.mockTasks"), "9"], [t("navigation.approvals"), "2"]].map(([label, value]) => (
                      <div key={label} className="rounded-lg border border-border bg-surface-secondary p-2.5">
                        <div className="text-lg font-bold">{value}</div>
                        <div className="text-[9px] text-nav-muted">{label}</div>
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5 rounded-lg border border-border bg-surface-secondary p-2.5">
                      <div className="text-[10px] font-medium text-nav-muted">{t("public.landing.mockProcesses")}</div>
                      {[t("public.landing.mockProcess1"), t("public.landing.mockProcess2")].map((process) => (
                        <div key={process} className="flex items-center gap-2 text-[10px] text-nav-muted">
                          <span className="size-1.5 rounded-full bg-info" />{process}
                        </div>
                      ))}
                    </div>
                    <div className="space-y-1.5 rounded-lg border border-border bg-surface-secondary p-2.5">
                      <div className="text-[10px] font-medium text-nav-muted">{t("public.landing.mockDocs")}</div>
                      {[t("public.landing.mockDoc1"), t("public.landing.mockDoc2")].map((doc) => (
                        <div key={doc} className="flex items-center gap-2 text-[10px] text-nav-muted">
                          <FileText className="size-3 text-primary" />{doc}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="border-y border-border bg-surface-secondary">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-10 gap-y-4 px-4 py-6 text-xs text-nav-muted">
          <span className="flex items-center gap-2"><Lock className="size-4 text-primary" />{t("public.landing.trust1")}</span>
          <span className="flex items-center gap-2"><ShieldCheck className="size-4 text-primary" />{t("public.landing.trust2")}</span>
          <span className="flex items-center gap-2"><Languages className="size-4 text-primary" />{t("public.landing.trust3")}</span>
          <span className="flex items-center gap-2"><Database className="size-4 text-primary" />{t("public.landing.trust4")}</span>
          <span className="flex items-center gap-2"><Zap className="size-4 text-primary" />{t("public.landing.trust5")}</span>
        </div>
      </div>

      <PublicSection>
        <PublicSectionTitle eyebrow={t("public.landing.featuresEyebrow")} title={t("public.landing.featuresTitle")} sub={t("public.landing.featuresSub")} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, index) => {
            const Icon = FEATURE_ICONS[index % FEATURE_ICONS.length]!;
            const color = FEATURE_COLORS[index % FEATURE_COLORS.length]!;
            return (
              <div key={feature.title} className="group rounded-xl border border-border bg-surface p-5 transition-all hover:border-primary/40 hover:bg-surface-hover">
                <div className="mb-3 inline-flex rounded-lg p-2.5" style={{ background: `${color}1a`, color }}><Icon className="size-5" /></div>
                <h3 className="font-semibold">{feature.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-nav-muted">{feature.desc}</p>
              </div>
            );
          })}
        </div>
      </PublicSection>

      <PublicSection className="!pt-0">
        <div className="relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 to-surface p-8 md:p-12">
          <div className="absolute -right-20 -top-20 size-64 rounded-full bg-primary/20 blur-[80px]" />
          <div className="relative grid items-center gap-10 md:grid-cols-2">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-primary/15 px-3 py-1 text-xs font-medium text-primary">
                <Sparkles className="size-3.5" />NEXORA AI No-Code
              </div>
              <h3 className="text-2xl font-bold md:text-3xl">{t("public.landing.aiTitle")}</h3>
              <p className="mt-4 leading-relaxed text-nav-muted">{t("public.landing.aiDesc")}</p>
              <Link to="/register" className="mt-6 inline-block"><Button>{t("public.landing.aiCta")}<ArrowRight className="size-4" /></Button></Link>
            </div>
            <div className="rounded-xl border border-border bg-nav p-4 font-mono text-xs">
              <div className="text-nav-muted">// {t("public.landing.aiPromptLabel")}</div>
              <div className="mt-1 text-nav-foreground">{t("public.landing.aiPrompt")}</div>
              <div className="mt-4 space-y-2">
                {(t("public.landing.aiOutput", { returnObjects: true }) as string[]).map((line) => (
                  <div key={line} className="flex items-center gap-2 text-success"><CheckCheck className="size-3.5" />{line}</div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </PublicSection>

      <PublicSection className="!pt-0">
        <div className="rounded-3xl border border-border bg-surface px-8 py-14 text-center">
          <img src="/logo.png" alt="NEXORA" className="mx-auto mb-5 size-11 rounded-md object-cover" />
          <h2 className="text-3xl font-bold">{t("public.landing.ctaTitle")}</h2>
          <p className="mx-auto mt-3 max-w-xl text-nav-muted">{t("public.landing.ctaSub")}</p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link to="/register"><Button size="lg">{t("public.landing.ctaStart")}</Button></Link>
            <Link to="/pricing"><Button size="lg" variant="outline" className="border-border-strong bg-transparent text-nav-foreground hover:bg-surface-hover">{t("public.landing.ctaPricing")}</Button></Link>
          </div>
        </div>
      </PublicSection>
    </div>
  );
}
