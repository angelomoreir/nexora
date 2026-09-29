import { useQuery } from "@tanstack/react-query";
import type { PlanDto } from "@nexora/contracts";
import { ArrowRight, Bot, Building2, Check, ChevronDown, HardDrive, Layers, Minus, Sparkles, Users } from "lucide-react";
import { Fragment, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { PublicSection, PublicSectionTitle } from "../../components/layout/public-layout";
import { Button, Skeleton } from "../../components/ui";
import { billingApi } from "../../lib/api";
import { useLocaleFormatter } from "../../lib/format";

type Cycle = "monthly" | "annual";
type CellValue = boolean | "basic" | "basicF" | "basicAudit" | "fullAudit" | "unlimited" | "limited" | "a5" | "a50" | "adv" | "custom";

const PLAN_ORDER = ["free", "basic", "professional", "business", "enterprise"] as const;

// Feature matrix: columns follow PLAN_ORDER (free, basic, professional, business, enterprise)
const MATRIX: { category: string; rows: { key: string; values: CellValue[] }[] }[] = [
  {
    category: "platform",
    rows: [
      { key: "documents", values: [true, true, true, true, true] },
      { key: "lists", values: [true, true, true, true, true] },
      { key: "forms", values: [true, true, true, true, true] },
      { key: "tasks", values: [true, true, true, true, true] },
      { key: "workflows", values: ["basic", true, true, true, true] },
      { key: "approvals", values: ["basicF", true, true, true, true] },
      { key: "notifications", values: [true, true, true, true, true] },
      { key: "search", values: [true, true, true, true, true] }
    ]
  },
  {
    category: "ai",
    rows: [
      { key: "aiAssistant", values: ["limited", true, true, true, "custom"] },
      { key: "aiAdvanced", values: [false, false, true, true, true] },
      { key: "automations", values: [false, "a5", "a50", "adv", "adv"] }
    ]
  },
  {
    category: "admin",
    rows: [
      { key: "customRoles", values: [false, false, true, true, true] },
      { key: "audit", values: [false, "basicAudit", "basicAudit", "fullAudit", "fullAudit"] },
      { key: "auditExport", values: [false, false, true, true, true] },
      { key: "sso", values: [false, false, false, true, true] },
      { key: "teamManagement", values: [false, true, true, true, true] }
    ]
  },
  {
    category: "integrations",
    rows: [
      { key: "api", values: [false, false, true, true, true] },
      { key: "webhooks", values: [false, false, true, true, true] },
      { key: "integrations", values: [false, false, false, true, true] },
      { key: "customIntegrations", values: [false, false, false, false, true] }
    ]
  },
  {
    category: "support",
    rows: [
      { key: "standardSupport", values: [true, true, true, true, true] },
      { key: "dedicatedSupport", values: [false, false, false, false, true] },
      { key: "sla", values: [false, false, false, false, true] }
    ]
  }
];

const PICKER = ["free", "basic", "professional", "business", "enterprise"] as const;
// AI operations per month shown as a chip on paid plans (null = custom)
const AI_OPS: Record<string, number | null> = { free: null, basic: 250, professional: 1000, business: 5000, enterprise: null };
const WHY_ICONS = [Building2, Layers, Sparkles] as const;

function Cell({ value }: { value: CellValue }) {
  const { t } = useTranslation();
  if (value === true) return <Check className="mx-auto size-4 text-success" aria-label={t("public.pricing.included")} />;
  if (value === false) return <Minus className="mx-auto size-4 text-nav-muted/50" aria-label={t("public.pricing.notIncluded")} />;
  return <span className="text-xs text-nav-foreground/80">{t(`public.pricing.compareValues.${value}`)}</span>;
}

export function PricingPage() {
  const { t } = useTranslation();
  const { formatNumber, formatBytes } = useLocaleFormatter();
  const [cycle, setCycle] = useState<Cycle>("monthly");
  const plansQuery = useQuery({ queryKey: ["public-plans"], queryFn: () => billingApi.listPlans() });
  const plans = PLAN_ORDER.map((code) => plansQuery.data?.find((p) => p.code === code)).filter((p): p is PlanDto => Boolean(p));

  const priceFor = (plan: PlanDto) => (cycle === "annual" ? plan.priceAnnual / 12 : plan.priceMonthly);
  const formatPrice = (plan: PlanDto) =>
    formatNumber(priceFor(plan) / 100, { style: "currency", currency: plan.currency, maximumFractionDigits: priceFor(plan) % 100 === 0 ? 0 : 2 });
  const ctaFor = (plan: PlanDto) => {
    if (plan.code === "enterprise") return { label: t("public.pricing.ctaContact"), to: "/contact?intent=demo" };
    if (plan.code === "free") return { label: t("public.pricing.ctaFree"), to: "/register" };
    return { label: t("public.pricing.ctaPlan", { plan: t(`plans.${plan.code}.name`, { defaultValue: plan.name }) }), to: "/register" };
  };
  const usersLabel = (plan: PlanDto) =>
    plan.code === "enterprise"
      ? t("public.pricing.usersPlus")
      : plan.limits.maxUsers === -1
        ? t("public.pricing.usersUnlimited")
        : t("public.pricing.usersUpTo", { count: plan.limits.maxUsers });
  const storageLabel = (plan: PlanDto) =>
    plan.code === "enterprise"
      ? t("public.pricing.storageCustom")
      : plan.limits.maxStorageBytes === -1
        ? t("public.pricing.storageUnlimited")
        : t("public.pricing.storageIncluded", { size: formatBytes(plan.limits.maxStorageBytes) });
  const includedRows = (planIndex: number) =>
    MATRIX.flatMap((cat) => cat.rows.filter((row) => row.values[planIndex] !== false));

  return (
    <div>
      {/* ============ HERO ============ */}
      <div className="relative overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-primary/15 blur-[120px]" aria-hidden="true" />
        <div className="relative mx-auto max-w-4xl px-4 pb-14 pt-20 text-center md:pt-28">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-primary">{t("public.nav.pricing")}</p>
          <h1 className="text-3xl font-bold leading-tight tracking-tight md:text-5xl">{t("public.pricing.heroTitle")}</h1>
          <p className="mx-auto mt-5 max-w-xl text-base text-nav-muted md:text-lg">{t("public.pricing.heroSub")}</p>

          <div className="mt-9 inline-flex items-center rounded-full border border-nav-border bg-surface p-1" role="group" aria-label={t("public.pricing.billingCycle")}>
            {(["monthly", "annual"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={cycle === value}
                onClick={() => setCycle(value)}
                className={`nx-focus-ring rounded-full px-5 py-2 text-sm font-medium transition-colors duration-150 ${cycle === value ? "bg-primary text-white" : "text-nav-muted hover:text-nav-foreground"}`}
              >
                {t(`public.pricing.${value}`)}
              </button>
            ))}
          </div>
          <div className="mt-3 h-5 text-xs font-medium text-success" aria-live="polite">
            {cycle === "annual" ? t("public.pricing.annualSave") : ""}
          </div>
          <p className="mt-4 text-xs text-nav-muted">{t("public.pricing.trustNote")}</p>
        </div>
      </div>

      {/* ============ PLAN CARDS ============ */}
      <section className="mx-auto max-w-7xl px-4 pb-4">
        {plansQuery.isPending ? (
          <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-96" />)}</div>
        ) : (
          <div className="grid items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {plans.map((plan) => {
              const highlighted = plan.code === "business";
              const isEnterprise = plan.code === "enterprise";
              const cta = ctaFor(plan);
              const features = t(`public.pricing.cardFeatures.${plan.code}`, { returnObjects: true }) as string[];
              const limits = t(`public.pricing.cardLimits.${plan.code}`, { returnObjects: true }) as string[];
              const aiOps = AI_OPS[plan.code];
              return (
                <div
                  key={plan.id}
                  id={`plan-${plan.code}`}
                  className={`relative flex scroll-mt-24 flex-col rounded-2xl border p-6 transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 ${
                    highlighted
                      ? "border-primary/60 bg-primary/[0.06] shadow-[0_8px_32px_-8px_rgb(79_139_216/0.35)]"
                      : "border-nav-border bg-surface hover:border-border-strong"
                  }`}
                >
                  {highlighted ? (
                    <span className="absolute -top-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-primary px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-white shadow-md">
                      <Sparkles className="size-3" />{t("public.pricing.mostPopular")}
                    </span>
                  ) : null}
                  <h3 className="text-base font-semibold">{t(`plans.${plan.code}.name`, { defaultValue: plan.name })}</h3>
                  <p className="mt-1 min-h-9 text-xs leading-relaxed text-nav-muted">{t(`plans.${plan.code}.tagline`, { defaultValue: plan.description ?? "" })}</p>

                  <div className="mt-4 flex items-end gap-1.5">
                    <span key={cycle} className="text-3xl font-bold tracking-tight transition-opacity duration-150">
                      {plan.priceMonthly === 0
                        ? t("public.pricing.free")
                        : isEnterprise
                          ? cycle === "annual"
                            ? t("public.pricing.customPrice")
                            : t("public.pricing.priceFrom", { price: formatNumber(plan.priceMonthly / 100, { style: "currency", currency: plan.currency, maximumFractionDigits: 0 }) })
                          : formatPrice(plan)}
                    </span>
                    {plan.priceMonthly > 0 && !(isEnterprise && cycle === "annual") ? <span className="pb-1 text-xs text-nav-muted">{t("public.pricing.perMonth")}</span> : null}
                  </div>
                  <p className="mt-1 h-4 text-[11px] text-nav-muted">
                    {plan.priceMonthly === 0
                      ? t("public.pricing.freeForever")
                      : isEnterprise
                        ? cycle === "annual" ? "" : t("public.pricing.perOrganization")
                        : cycle === "annual"
                          ? t("public.pricing.billedAnnually", { total: formatNumber(plan.priceAnnual / 100, { style: "currency", currency: plan.currency, maximumFractionDigits: 0 }) })
                          : t("public.pricing.perOrganization")}
                  </p>

                  <div className="mt-4 flex flex-col gap-1.5 rounded-lg border border-nav-border bg-surface-secondary px-3 py-2.5 text-xs text-nav-foreground/80">
                    <span className="flex items-center gap-2"><Users className="size-3.5 text-primary" />{usersLabel(plan)}</span>
                    <span className="flex items-center gap-2"><HardDrive className="size-3.5 text-primary" />{storageLabel(plan)}</span>
                  </div>

                  {plan.priceMonthly > 0 ? (
                    <div className="mt-3">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/[0.08] px-2.5 py-1 text-[11px] font-medium text-primary">
                        <Bot className="size-3.5" />
                        {aiOps == null ? t("public.pricing.aiCustom") : t("public.pricing.aiOps", { count: formatNumber(aiOps) })}
                      </span>
                      {!isEnterprise ? <p className="mt-1.5 text-[10px] leading-snug text-nav-muted/70">{t("public.pricing.aiAddons")}</p> : null}
                    </div>
                  ) : null}

                  <p className="mt-5 text-[11px] font-semibold uppercase tracking-wide text-nav-muted">{t("public.pricing.featuresTitle")}</p>
                  <ul className="mt-2 flex-1 space-y-2">
                    {(Array.isArray(features) ? features : plan.features.map((f) => t(`planFeatures.${f}`, { defaultValue: f }))).map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-[13px] leading-snug text-nav-foreground/80">
                        <Check className="mt-0.5 size-3.5 shrink-0 text-success" />{feature}
                      </li>
                    ))}
                  </ul>

                  {Array.isArray(limits) && limits.length > 0 ? (
                    <div className="mt-4 rounded-lg border border-nav-border/60 bg-surface-secondary/50 px-3 py-2.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-nav-muted">{t("public.pricing.limitsTitle")}</p>
                      <ul className="mt-1.5 space-y-1">
                        {limits.map((limit) => (
                          <li key={limit} className="flex items-start gap-1.5 text-[11px] leading-snug text-nav-muted">
                            <span aria-hidden="true">·</span>{limit}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <Link to={cta.to} className="mt-5">
                    <Button className="w-full" variant={highlighted ? "default" : "outline"} size="lg">{cta.label}</Button>
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ============ WHY NEXORA ============ */}
      <PublicSection className="!pb-8 !pt-14">
        <PublicSectionTitle title={t("public.pricing.whyTitle")} sub={t("public.pricing.whySub")} />
        <div className="grid gap-4 md:grid-cols-3">
          {WHY_ICONS.map((Icon, i) => {
            const items = t("public.pricing.why", { returnObjects: true }) as { title: string; desc: string }[];
            const item = Array.isArray(items) ? items[i] : undefined;
            if (!item) return null;
            return (
              <div key={item.title} className="rounded-2xl border border-nav-border bg-surface p-6">
                <span className="inline-flex size-10 items-center justify-center rounded-xl border border-primary/30 bg-primary/[0.08] text-primary">
                  <Icon className="size-5" />
                </span>
                <h3 className="mt-4 text-base font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-nav-muted">{item.desc}</p>
              </div>
            );
          })}
        </div>
      </PublicSection>

      {/* ============ COMPARISON ============ */}
      <PublicSection>
        <PublicSectionTitle title={t("public.pricing.compareTitle")} sub={t("public.pricing.compareSub")} />

        {/* Desktop table */}
        <div className="hidden overflow-hidden rounded-2xl border border-nav-border bg-surface md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-nav-border bg-surface-secondary">
                <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wide text-nav-muted">{t("public.pricing.compareFeature")}</th>
                {plans.map((plan) => (
                  <th key={plan.id} className={`px-3 py-4 text-center text-sm font-semibold ${plan.code === "business" ? "text-primary" : ""}`}>
                    {t(`plans.${plan.code}.name`, { defaultValue: plan.name })}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MATRIX.map((cat) => (
                <Fragment key={cat.category}>
                  <tr className="border-t border-nav-border bg-nav/40">
                    <td colSpan={plans.length + 1} className="px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
                      {t(`public.pricing.compareCategories.${cat.category}`)}
                    </td>
                  </tr>
                  {cat.rows.map((row) => (
                    <tr key={row.key} className="border-t border-nav-border/60 transition-colors hover:bg-surface-hover/40">
                      <td className="px-5 py-3 text-nav-foreground/80">{t(`public.pricing.compareRows.${row.key}`)}</td>
                      {row.values.map((value, i) => (
                        <td key={i} className={`px-3 py-3 text-center ${plans[i]?.code === "business" ? "bg-primary/[0.05]" : ""}`}>
                          <Cell value={value} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile: per-plan accordions */}
        <div className="space-y-3 md:hidden">
          {plans.map((plan, index) => (
            <details key={plan.id} className="group rounded-xl border border-nav-border bg-surface open:border-primary/40">
              <summary className="nx-focus-ring flex cursor-pointer list-none items-center justify-between px-4 py-3.5 [&::-webkit-details-marker]:hidden">
                <span className="flex items-center gap-2.5">
                  <span className="text-sm font-semibold">{t(`plans.${plan.code}.name`, { defaultValue: plan.name })}</span>
                  {plan.code === "business" ? <span className="rounded-full bg-primary px-2 py-0.5 text-[9px] font-semibold uppercase text-white">{t("public.pricing.mostPopular")}</span> : null}
                </span>
                <ChevronDown className="size-4 text-nav-muted transition-transform duration-200 group-open:rotate-180" />
              </summary>
              <ul className="space-y-2 border-t border-nav-border px-4 py-4">
                {includedRows(index).map((row) => (
                  <li key={row.key} className="flex items-center gap-2 text-[13px] text-nav-foreground/80">
                    <Check className="size-3.5 shrink-0 text-success" />
                    {t(`public.pricing.compareRows.${row.key}`)}
                    {typeof row.values[index] === "string" ? (
                      <span className="text-xs text-nav-muted">· {t(`public.pricing.compareValues.${row.values[index]}`)}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      </PublicSection>

      {/* ============ PLAN PICKER ============ */}
      <PublicSection className="!pt-0">
        <PublicSectionTitle title={t("public.pricing.pickerTitle")} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {PICKER.map((code) => (
            <div key={code} className="flex flex-col rounded-xl border border-nav-border bg-surface p-5 transition-colors hover:border-primary/40">
              <p className="flex-1 text-sm leading-relaxed text-nav-foreground/80">{t(`public.pricing.picker.${code}`)}</p>
              <p className="mt-3 text-sm font-semibold text-primary">{t(`plans.${code}.name`)}</p>
              <a href={`#plan-${code}`} className="nx-focus-ring mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-nav-muted transition-colors hover:text-primary">
                {t("public.pricing.viewPlan")}<ArrowRight className="size-3.5" />
              </a>
            </div>
          ))}
        </div>
      </PublicSection>

      {/* ============ EXTRA USERS ============ */}
      <PublicSection className="!pt-0">
        <div className="rounded-2xl border border-nav-border bg-surface p-6 md:p-8">
          <h3 className="text-lg font-semibold">{t("public.pricing.extraUsersTitle")}</h3>
          <p className="mt-2 max-w-2xl text-sm text-nav-muted">{t("public.pricing.extraUsersText")}</p>
          <Link to="/contact" className="nx-focus-ring mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary transition-colors hover:text-primary/80">
            {t("public.pricing.ctaContact")}<ArrowRight className="size-4" />
          </Link>
        </div>
      </PublicSection>

      {/* ============ FAQ ============ */}
      <PublicSection className="!pt-0">
        <PublicSectionTitle title={t("public.pricing.faqTitle")} />
        <div className="mx-auto max-w-3xl space-y-3">
          {(t("public.pricing.faq", { returnObjects: true }) as { q: string; a: string }[]).map((item) => (
            <details key={item.q} className="group rounded-xl border border-nav-border bg-surface">
              <summary className="nx-focus-ring flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-sm font-medium [&::-webkit-details-marker]:hidden">
                {item.q}
                <ChevronDown className="size-4 shrink-0 text-nav-muted transition-transform duration-200 group-open:rotate-180" />
              </summary>
              <p className="border-t border-nav-border px-5 py-4 text-sm leading-relaxed text-nav-muted">{item.a}</p>
            </details>
          ))}
        </div>
      </PublicSection>

      {/* ============ FINAL CTA ============ */}
      <PublicSection className="!pt-0">
        <div className="relative overflow-hidden rounded-3xl border border-primary/25 bg-gradient-to-br from-primary/10 to-surface px-8 py-14 text-center">
          <div className="absolute -right-24 -top-24 size-72 rounded-full bg-primary/15 blur-[90px]" aria-hidden="true" />
          <div className="relative">
            <h2 className="text-2xl font-bold tracking-tight md:text-3xl">{t("public.pricing.finalTitle")}</h2>
            <p className="mx-auto mt-3 max-w-xl text-nav-muted">{t("public.pricing.finalSub")}</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link to="/register"><Button size="lg">{t("public.pricing.ctaFree")}<ArrowRight className="size-4" /></Button></Link>
              <Link to="/contact?intent=demo"><Button size="lg" variant="outline" className="border-border-strong bg-transparent text-nav-foreground hover:bg-surface-hover">{t("public.pricing.ctaContact")}</Button></Link>
            </div>
          </div>
        </div>
      </PublicSection>
    </div>
  );
}
