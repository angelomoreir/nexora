import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useWorkspace } from "../components/layout/app-layout";
import { Alert, Button, Checkbox, Field, Input, Page, PageHeader, Select, Skeleton, useConfirm } from "../components/ui";
import { settingsApi, ssoApi } from "../lib/api";
import { apiErrorText } from "../lib/api-error";

export function AdminSettingsPage() {
  const { t } = useTranslation();
  const { organization } = useWorkspace();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    logoUrl: "",
    language: "pt-PT",
    timezone: "Europe/Lisbon",
    passwordMinLength: 8,
    passwordRequireUpper: true,
    passwordRequireLower: true,
    passwordRequireDigit: true,
    passwordRequireSymbol: false,
    storageQuotaBytes: 10737418240,
    notificationsEnabled: true,
    emailNotifications: false,
    trashRetentionDays: 30
  });

  const settingsQuery = useQuery({
    queryKey: ["admin-settings", organization.id],
    queryFn: () => settingsApi.get(organization.id)
  });

  useEffect(() => {
    if (settingsQuery.data) {
      const d = settingsQuery.data;
      setForm({
        logoUrl: d.logoUrl ?? "",
        language: d.language,
        timezone: d.timezone,
        passwordMinLength: d.passwordPolicy.minLength,
        passwordRequireUpper: d.passwordPolicy.requireUpper,
        passwordRequireLower: d.passwordPolicy.requireLower,
        passwordRequireDigit: d.passwordPolicy.requireDigit,
        passwordRequireSymbol: d.passwordPolicy.requireSymbol,
        storageQuotaBytes: d.storageQuotaBytes,
        notificationsEnabled: d.notificationsEnabled,
        emailNotifications: d.emailNotifications,
        trashRetentionDays: d.trashRetentionDays
      });
    }
  }, [settingsQuery.data]);

  const updateMutation = useMutation({
    mutationFn: () => settingsApi.update(organization.id, {
      logoUrl: form.logoUrl || null,
      language: form.language,
      timezone: form.timezone,
      passwordMinLength: form.passwordMinLength,
      passwordRequireUpper: form.passwordRequireUpper,
      passwordRequireLower: form.passwordRequireLower,
      passwordRequireDigit: form.passwordRequireDigit,
      passwordRequireSymbol: form.passwordRequireSymbol,
      storageQuotaBytes: form.storageQuotaBytes,
      notificationsEnabled: form.notificationsEnabled,
      emailNotifications: form.emailNotifications,
      trashRetentionDays: form.trashRetentionDays
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-settings", organization.id] })
  });

  function handleSubmit(e: FormEvent) { e.preventDefault(); updateMutation.mutate(); }

  if (settingsQuery.isPending) {
    return (
      <Page>
        <PageHeader eyebrow={t("navigation.admin")} title={t("settings.title")} description={t("admin.settingsDesc")} />
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40 w-full" />)}
        </div>
      </Page>
    );
  }

  if (settingsQuery.isError) {
    return (
      <Page>
        <PageHeader eyebrow={t("navigation.admin")} title={t("settings.title")} description={t("admin.settingsDesc")} />
        <Alert variant="danger" title={t("common.error")}>{apiErrorText(settingsQuery.error, t)}</Alert>
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader eyebrow={t("navigation.admin")} title={t("settings.title")} description={t("admin.settingsDesc")} />

      <form onSubmit={handleSubmit} className="space-y-6">
        <section className="space-y-4 rounded-lg border border-border bg-surface p-5 shadow-sm">
          <h2 className="nx-label uppercase text-muted-foreground">{t("admin.general")}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("admin.logoUrl")} htmlFor="settings-logo"><Input id="settings-logo" value={form.logoUrl} onChange={(e) => setForm({ ...form, logoUrl: e.target.value })} placeholder="https://..." /></Field>
            <Field label={t("admin.language")} htmlFor="settings-language">
              <Select id="settings-language" value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })}>
                <option value="pt-PT">{t("admin.portuguesePortugal")}</option>
                <option value="pt-BR">{t("admin.portugueseBrazil")}</option>
                <option value="en-US">English (US)</option>
                <option value="en-GB">English (UK)</option>
                <option value="es-ES">Español</option>
                <option value="fr-FR">{t("admin.french")}</option>
                <option value="de-DE">Deutsch</option>
              </Select>
            </Field>
            <Field label={t("admin.timezone")} htmlFor="settings-timezone">
              <Select id="settings-timezone" value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })}>
                <option value="Europe/Lisbon">Europe/Lisbon</option>
                <option value="Europe/London">Europe/London</option>
                <option value="Europe/Paris">Europe/Paris</option>
                <option value="Europe/Berlin">Europe/Berlin</option>
                <option value="America/New_York">America/New_York</option>
                <option value="America/Sao_Paulo">America/Sao_Paulo</option>
                <option value="UTC">UTC</option>
              </Select>
            </Field>
          </div>
        </section>

        <section className="space-y-4 rounded-lg border border-border bg-surface p-5 shadow-sm">
          <h2 className="nx-label uppercase text-muted-foreground">{t("admin.passwordPolicy")}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("admin.minLength")} htmlFor="settings-pwlen"><Input id="settings-pwlen" type="number" min={4} max={128} value={form.passwordMinLength} onChange={(e) => setForm({ ...form, passwordMinLength: Number(e.target.value) })} /></Field>
            <div className="flex flex-wrap items-end gap-4 pt-5">
              <label className="flex items-center gap-2 text-sm text-secondary-foreground"><Checkbox checked={form.passwordRequireUpper} onChange={(e) => setForm({ ...form, passwordRequireUpper: e.target.checked })} />{t("admin.requireUpper")}</label>
              <label className="flex items-center gap-2 text-sm text-secondary-foreground"><Checkbox checked={form.passwordRequireLower} onChange={(e) => setForm({ ...form, passwordRequireLower: e.target.checked })} />{t("admin.requireLower")}</label>
              <label className="flex items-center gap-2 text-sm text-secondary-foreground"><Checkbox checked={form.passwordRequireDigit} onChange={(e) => setForm({ ...form, passwordRequireDigit: e.target.checked })} />{t("admin.requireDigit")}</label>
              <label className="flex items-center gap-2 text-sm text-secondary-foreground"><Checkbox checked={form.passwordRequireSymbol} onChange={(e) => setForm({ ...form, passwordRequireSymbol: e.target.checked })} />{t("admin.checkboxSymbol")}</label>
            </div>
          </div>
        </section>

        <section className="space-y-4 rounded-lg border border-border bg-surface p-5 shadow-sm">
          <h2 className="nx-label uppercase text-muted-foreground">{t("admin.storage")}</h2>
          <Field label={t("admin.storageQuota")} htmlFor="settings-quota" helper={`${(form.storageQuotaBytes / 1073741824).toFixed(1)} GB`}>
            <Input id="settings-quota" type="number" min={0} value={form.storageQuotaBytes} onChange={(e) => setForm({ ...form, storageQuotaBytes: Number(e.target.value) })} />
          </Field>
          <Field label={t("admin.trashRetentionDays")} htmlFor="settings-trash-retention">
            <Input id="settings-trash-retention" type="number" min={1} max={3650} value={form.trashRetentionDays} onChange={(e) => setForm({ ...form, trashRetentionDays: Number(e.target.value) })} />
          </Field>
        </section>

        <section className="space-y-4 rounded-lg border border-border bg-surface p-5 shadow-sm">
          <h2 className="nx-label uppercase text-muted-foreground">{t("navigation.notifications")}</h2>
          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2 text-sm text-secondary-foreground"><Checkbox checked={form.notificationsEnabled} onChange={(e) => setForm({ ...form, notificationsEnabled: e.target.checked })} />{t("admin.checkboxNotifications")}</label>
            <label className="flex items-center gap-2 text-sm text-secondary-foreground"><Checkbox checked={form.emailNotifications} onChange={(e) => setForm({ ...form, emailNotifications: e.target.checked })} />{t("admin.checkboxEmail")}</label>
          </div>
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={updateMutation.isPending}>{t("common.save")}</Button>
          {updateMutation.isSuccess ? <Alert variant="success" className="py-1.5">{t("admin.settingsSaved")}</Alert> : null}
          {updateMutation.isError ? <Alert variant="danger" className="py-1.5">{t("common.errorSaving")}</Alert> : null}
        </div>
      </form>

      <SsoSection organizationId={organization.id} />
    </Page>
  );
}

function SsoSection({ organizationId }: { organizationId: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { confirm, confirmDialog } = useConfirm();
  const [form, setForm] = useState({
    issuerUrl: "",
    clientId: "",
    clientSecret: "",
    scopes: "openid profile email",
    emailDomains: "",
    isEnabled: false
  });

  const ssoQuery = useQuery({
    queryKey: ["sso-config", organizationId],
    queryFn: () => ssoApi.get(organizationId)
  });

  useEffect(() => {
    const config = ssoQuery.data;
    if (config) {
      setForm({
        issuerUrl: config.issuerUrl,
        clientId: config.clientId,
        clientSecret: "",
        scopes: config.scopes,
        emailDomains: config.emailDomains.join(", "),
        isEnabled: config.isEnabled
      });
    }
  }, [ssoQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      ssoApi.update(organizationId, {
        issuerUrl: form.issuerUrl,
        clientId: form.clientId,
        ...(form.clientSecret ? { clientSecret: form.clientSecret } : {}),
        scopes: form.scopes,
        emailDomains: form.emailDomains.split(",").map((d) => d.trim()).filter(Boolean),
        isEnabled: form.isEnabled
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sso-config", organizationId] })
  });

  const deleteMutation = useMutation({
    mutationFn: () => ssoApi.remove(organizationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sso-config", organizationId] });
      setForm({ issuerUrl: "", clientId: "", clientSecret: "", scopes: "openid profile email", emailDomains: "", isEnabled: false });
    }
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    saveMutation.mutate();
  }

  const configured = Boolean(ssoQuery.data);

  return (
    <section className="space-y-4 rounded-lg border border-border bg-surface p-5 shadow-sm">
      <div>
        <h2 className="nx-label uppercase text-muted-foreground">{t("sso.title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("sso.description")}</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("sso.issuerUrl")} htmlFor="sso-issuer" helper={t("sso.issuerHint")}>
            <Input id="sso-issuer" type="url" required value={form.issuerUrl} onChange={(e) => setForm({ ...form, issuerUrl: e.target.value })} placeholder="https://login.microsoftonline.com/{tenant}/v2.0" />
          </Field>
          <Field label={t("sso.clientId")} htmlFor="sso-client-id">
            <Input id="sso-client-id" required value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })} />
          </Field>
          <Field label={t("sso.clientSecret")} htmlFor="sso-secret" helper={ssoQuery.data?.clientSecretSet ? t("sso.secretSet") : undefined}>
            <Input id="sso-secret" type="password" autoComplete="off" value={form.clientSecret} onChange={(e) => setForm({ ...form, clientSecret: e.target.value })} placeholder={ssoQuery.data?.clientSecretSet ? "••••••••" : ""} />
          </Field>
          <Field label={t("sso.emailDomains")} htmlFor="sso-domains" helper={t("sso.domainsHint")}>
            <Input id="sso-domains" value={form.emailDomains} onChange={(e) => setForm({ ...form, emailDomains: e.target.value })} placeholder="empresa.com, subsidiaria.com" />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-secondary-foreground">
          <Checkbox checked={form.isEnabled} onChange={(e) => setForm({ ...form, isEnabled: e.target.checked })} />
          {t("sso.enabled")}
        </label>
        {saveMutation.isError ? <Alert variant="danger">{t("common.errorSaving")}</Alert> : null}
        {saveMutation.isSuccess ? <Alert variant="success">{t("admin.settingsSaved")}</Alert> : null}
        <div className="flex items-center gap-2">
          <Button type="submit" loading={saveMutation.isPending}>{t("common.save")}</Button>
          {configured ? (
            <Button
              type="button"
              variant="ghost"
              className="text-danger hover:bg-danger-subtle hover:text-danger"
              onClick={async () => { if (await confirm(t("sso.confirmDelete"))) deleteMutation.mutate(); }}
            >
              {t("sso.remove")}
            </Button>
          ) : null}
        </div>
      </form>
      {confirmDialog}
    </section>
  );
}
