import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Check, CreditCard, FileText, GitBranch, HardDrive, Sparkles, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import { useWorkspace } from "../components/layout/app-layout";
import { Alert, Badge, Button, Page, PageHeader, Skeleton, useConfirm } from "../components/ui";
import { ContextualHelpButton } from "../components/help/contextual-help-button";
import { billingApi } from "../lib/api";
import { useLocaleFormatter } from "../lib/format";

export function BillingPage() {
  const { t } = useTranslation();
  const { formatBytes, formatNumber } = useLocaleFormatter();
  const { organization } = useWorkspace();
  const queryClient = useQueryClient();
  const { confirm, confirmDialog } = useConfirm();

  const formatLimit = (n: number) => (n === -1 ? t("billing.unlimited") : formatNumber(n));
  const formatLimitBytes = (bytes: number) => (bytes === -1 ? t("billing.unlimited") : formatBytes(bytes));
  const formatPrice = (cents: number, currency: string) => formatNumber(cents / 100, { style: "currency", currency });

  const { data: plans, isLoading: plansLoading } = useQuery({
    queryKey: ["plans"],
    queryFn: () => billingApi.listPlans()
  });

  const { data: subscription } = useQuery({
    queryKey: ["subscription", organization.id],
    queryFn: () => billingApi.getSubscription(organization.id)
  });

  const { data: usage } = useQuery({
    queryKey: ["usage", organization.id],
    queryFn: () => billingApi.getUsage(organization.id),
    refetchInterval: 30000
  });

  const [searchParams, setSearchParams] = useSearchParams();
  const checkoutResult = searchParams.get("checkout");

  const changePlanMutation = useMutation({
    mutationFn: ({ planCode, billingCycle }: { planCode: string; billingCycle: "MONTHLY" | "ANNUAL" }) =>
      billingApi.changePlan(organization.id, planCode, billingCycle),
    onSuccess: (result) => {
      if ("checkoutUrl" in result) {
        window.location.href = result.checkoutUrl;
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["subscription"] });
      queryClient.invalidateQueries({ queryKey: ["usage"] });
    }
  });

  const portalMutation = useMutation({
    mutationFn: () => billingApi.createPortalSession(organization.id),
    onSuccess: (result) => {
      window.location.href = result.portalUrl;
    }
  });

  const cancelMutation = useMutation({
    mutationFn: () => billingApi.cancelSubscription(organization.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subscription"] });
      queryClient.invalidateQueries({ queryKey: ["usage"] });
    }
  });

  if (plansLoading) {
    return (
      <Page>
        <PageHeader eyebrow={organization.name} title={t("billing.title")} description={t("billing.description")} actions={<ContextualHelpButton route="/billing" showLabel />} />
        <div className="space-y-4">
          <Skeleton className="h-40 w-full" />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-80 w-full" />)}
          </div>
        </div>
      </Page>
    );
  }

  const currentPlanCode = subscription?.plan.code;

  return (
    <Page>
      <PageHeader eyebrow={organization.name} title={t("billing.title")} description={t("billing.description")} actions={<ContextualHelpButton route="/billing" showLabel />} />

      {checkoutResult === "success" ? (
        <Alert variant="success" title={t("billing.checkoutSuccess")} onAuxClick={() => setSearchParams({})} />
      ) : null}
      {checkoutResult === "cancelled" ? (
        <Alert variant="info" title={t("billing.checkoutCancelled")} />
      ) : null}
      {changePlanMutation.isError ? <Alert variant="danger">{t("billing.checkoutError")}</Alert> : null}

      {/* Usage stats */}
      {usage && (
        <section className="rounded-lg border border-border bg-surface p-5 shadow-sm">
          <h2 className="nx-h3 mb-4 text-foreground">{t("billing.currentUsage")}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <UsageCard icon={Users} label={t("billing.users")} current={usage.users} max={usage.limits.maxUsers} />
            <UsageCard icon={HardDrive} label={t("billing.storage")} current={usage.storageBytes} max={usage.limits.maxStorageBytes} format={formatLimitBytes} />
            <UsageCard icon={FileText} label={t("navigation.documents")} current={usage.documents} max={usage.limits.maxDocuments} />
            <UsageCard icon={GitBranch} label={t("billing.workflows")} current={usage.workflows} max={usage.limits.maxWorkflows} />
            <UsageCard icon={Bot} label={t("billing.aiMonth")} current={usage.aiRequestsThisMonth} max={usage.limits.aiRequestsPerMonth} />
          </div>
          {usage.exceeded.length > 0 ? (
            <Alert variant="warning" className="mt-4" title={t("billing.limitReached")}>
              {t("billing.limitExceeded", { items: usage.exceeded.join(", ") })}
            </Alert>
          ) : null}
        </section>
      )}

      {/* Current subscription */}
      {subscription && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary-subtle p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-secondary-foreground">{t("billing.currentPlan")}</span>
            <span className="font-semibold text-foreground">{t(`plans.${subscription.plan.code}.name`, { defaultValue: subscription.plan.name })}</span>
            <Badge variant="primary">{subscription.status}</Badge>
          </div>
          <div className="flex items-center gap-2">
            {subscription.billingManaged ? (
              <Button variant="outline" size="sm" onClick={() => portalMutation.mutate()} loading={portalMutation.isPending}>
                <CreditCard className="size-4" /> {t("billing.manageBilling")}
              </Button>
            ) : null}
            {subscription.plan.code !== "free" ? (
              <Button variant="ghost" size="sm" onClick={async () => { if (await confirm(t("billing.cancelSubscriptionConfirm"))) cancelMutation.mutate(); }} disabled={cancelMutation.isPending} className="text-danger hover:bg-danger-subtle hover:text-danger">{t("billing.cancelSubscription")}</Button>
            ) : null}
          </div>
        </div>
      )}

      {/* Plans grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {plans?.map((plan) => {
          const isCurrent = plan.code === currentPlanCode;
          return (
            <article
              key={plan.id}
              className={`relative flex flex-col rounded-lg border p-5 ${isCurrent ? "border-primary ring-1 ring-primary" : "border-border bg-surface"} ${plan.code === "enterprise" ? "bg-surface-secondary" : "bg-surface"}`}
            >
              {plan.code === "enterprise" ? (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-sm bg-primary px-3 py-0.5 text-xs font-medium text-primary-foreground">
                  {t("billing.premium")}
                </div>
              ) : null}
              <div className="mb-3">
                <h3 className="flex items-center gap-1.5 nx-h3 text-foreground">
                  {plan.code === "enterprise" ? <Sparkles className="size-4 text-primary" /> : null}
                  {t(`plans.${plan.code}.name`, { defaultValue: plan.name })}
                </h3>
                {plan.description ? <p className="text-sm text-secondary-foreground">{t(`plans.${plan.code}.description`, { defaultValue: plan.description })}</p> : null}
              </div>
              <div className="mb-4">
                <span className="text-3xl font-bold text-foreground">{formatPrice(plan.priceMonthly, plan.currency)}</span>
                <span className="text-sm text-secondary-foreground">{t("billing.perMonth")}</span>
                {plan.priceAnnual > 0 ? (
                  <div className="text-xs text-muted-foreground">{t("billing.annualPrice", { price: formatPrice(plan.priceAnnual, plan.currency) })}</div>
                ) : null}
              </div>
              <div className="mb-4 space-y-1.5 text-sm">
                <PlanLimit label={t("billing.users")} value={formatLimit(plan.limits.maxUsers)} />
                <PlanLimit label={t("billing.storage")} value={formatLimitBytes(plan.limits.maxStorageBytes)} />
                <PlanLimit label={t("navigation.documents")} value={formatLimit(plan.limits.maxDocuments)} />
                <PlanLimit label={t("billing.workflows")} value={formatLimit(plan.limits.maxWorkflows)} />
                <PlanLimit label={t("billing.aiPerMonth")} value={formatLimit(plan.limits.aiRequestsPerMonth)} />
              </div>
              <div className="mb-4 flex-1">
                <div className="mb-2 text-xs font-medium text-muted-foreground">{t("billing.features")}</div>
                <ul className="space-y-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-1.5 text-sm text-secondary-foreground">
                      <Check className="mt-0.5 size-3.5 shrink-0 text-success" />
                      <span>{t(`planFeatures.${f}`, { defaultValue: f })}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <Button
                onClick={() => changePlanMutation.mutate({ planCode: plan.code, billingCycle: "MONTHLY" })}
                disabled={isCurrent || changePlanMutation.isPending}
                variant={isCurrent ? "outline" : "default"}
                className="w-full"
              >
                {isCurrent ? t("billing.current") : plan.priceMonthly === 0 ? t("billing.startFree") : t("billing.select")}
              </Button>
            </article>
          );
        })}
      </div>

      <div className="rounded-lg border border-border bg-surface-secondary p-4 text-xs text-muted-foreground">
        <p className="mb-1 font-medium text-foreground">{t("billing.billingNotes")}</p>
        <p>• {t("billing.stripeNote")}</p>
        <p>• {t("billing.cancelNote")}</p>
        <p>• {t("billing.annualNote")}</p>
      </div>
      {confirmDialog}
    </Page>
  );
}

function UsageCard({ icon: Icon, label, current, max, format }: { icon: typeof Users; label: string; current: number; max: number; format?: (n: number) => string }) {
  const { t } = useTranslation();
  const { formatNumber } = useLocaleFormatter();
  const fmt = format ?? ((n: number) => (n === -1 ? t("billing.unlimited") : formatNumber(n)));
  const pct = max === -1 ? 0 : Math.min(100, (current / max) * 100);
  const isOver = max !== -1 && current >= max;
  return (
    <div className="rounded-md border border-border bg-surface p-3">
      <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="size-3.5" /> {label}
      </div>
      <div className="text-sm font-medium text-foreground">
        {fmt(current)} {max !== -1 ? <span className="text-muted-foreground">/ {fmt(max)}</span> : null}
      </div>
      {max !== -1 ? (
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-secondary">
          <div className={`h-full rounded-full ${isOver ? "bg-danger" : pct > 80 ? "bg-warning" : "bg-primary"}`} style={{ width: `${pct}%` }} />
        </div>
      ) : null}
    </div>
  );
}

function PlanLimit({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-secondary-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}
