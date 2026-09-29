import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Monitor, Smartphone } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { Avatar, useWorkspace } from "../components/layout/app-layout";
import { Alert, Badge, Button, Field, Input, Page, PageHeader, Skeleton, useConfirm, useToast } from "../components/ui";
import { ContextualHelpButton } from "../components/help/contextual-help-button";
import { authApi } from "../lib/api";
import { apiErrorText } from "../lib/api-error";
import { useLocaleFormatter } from "../lib/format";

function deviceLabel(userAgent: string | null, fallback: string) {
  if (!userAgent) return fallback;
  const browser = userAgent.includes("Edg") ? "Edge"
    : userAgent.includes("Firefox") ? "Firefox"
    : userAgent.includes("Chrome") ? "Chrome"
    : userAgent.includes("Safari") ? "Safari"
    : null;
  return browser ?? (userAgent.length > 60 ? `${userAgent.slice(0, 60)}…` : userAgent);
}

export function ProfilePage() {
  const { t } = useTranslation();
  const { session } = useWorkspace();
  const { formatDateTime } = useLocaleFormatter();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { confirm, confirmDialog } = useConfirm();
  const [profile, setProfile] = useState({ name: session.user.name, avatar: session.user.avatar ?? "", jobTitle: session.user.jobTitle ?? "" });
  const [passwords, setPasswords] = useState({ currentPassword: "", newPassword: "" });
  const update = useMutation({
    mutationFn: () => authApi.updateProfile({ name: profile.name, avatar: profile.avatar || null, jobTitle: profile.jobTitle || null }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["session"] })
  });
  const changePassword = useMutation({
    mutationFn: () => authApi.changePassword(passwords.currentPassword, passwords.newPassword),
    onSuccess: async () => {
      queryClient.clear();
      await navigate("/login", { replace: true });
    }
  });
  const sessionsQuery = useQuery({ queryKey: ["auth-sessions"], queryFn: authApi.sessions });
  const revokeSession = useMutation({
    mutationFn: (sessionId: string) => authApi.revokeSession(sessionId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["auth-sessions"] });
      toast({ title: t("profile.sessionRevoked"), tone: "success" });
    },
    onError: (error) => toast({ title: t("profile.sessionRevokeError"), description: apiErrorText(error, t), tone: "danger" })
  });

  function saveProfile(event: FormEvent) { event.preventDefault(); update.mutate(); }
  function savePassword(event: FormEvent) { event.preventDefault(); changePassword.mutate(); }
  async function revoke(sessionId: string) {
    if (await confirm({ title: t("profile.sessionRevokeConfirm"), confirmLabel: t("profile.sessionRevoke") })) {
      revokeSession.mutate(sessionId);
    }
  }

  const sessions = sessionsQuery.data?.sessions ?? [];

  return (
    <Page>
      <PageHeader eyebrow={t("profile.eyebrow")} title={t("profile.title")} description={t("profile.description")} actions={<ContextualHelpButton route="/profile" showLabel />} />

      <div className="grid gap-6 lg:grid-cols-2">
        <form className="rounded-lg border border-border bg-surface p-6 shadow-sm" onSubmit={saveProfile}>
          <div className="mb-6 flex items-center gap-4">
            <Avatar name={session.user.name} avatar={session.user.avatar} />
            <div>
              <h2 className="nx-h3 text-foreground">{t("profile.personalInfo")}</h2>
              <p className="text-xs text-muted-foreground">{t("profile.personalInfoDesc")}</p>
            </div>
          </div>
          <div className="space-y-4">
            <Field label={t("common.name")} htmlFor="profile-name"><Input id="profile-name" value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} /></Field>
            <Field label={t("profile.jobTitle")} htmlFor="profile-title"><Input id="profile-title" value={profile.jobTitle} onChange={(event) => setProfile({ ...profile, jobTitle: event.target.value })} /></Field>
            <Field label={t("profile.avatarUrl")} htmlFor="profile-avatar"><Input id="profile-avatar" type="url" value={profile.avatar} onChange={(event) => setProfile({ ...profile, avatar: event.target.value })} /></Field>
            {update.error ? <Alert variant="danger">{apiErrorText(update.error, t)}</Alert> : null}
            {update.isSuccess ? <Alert variant="success">{t("profile.profileUpdated")}</Alert> : null}
            <Button disabled={update.isPending} type="submit">{t("profile.saveProfile")}</Button>
          </div>
        </form>

        <form className="rounded-lg border border-border bg-surface p-6 shadow-sm" onSubmit={savePassword}>
          <h2 className="nx-h3 text-foreground">{t("profile.changePassword")}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t("profile.allSessionsWillBeTerminated")}</p>
          <div className="mt-6 space-y-4">
            <Field label={t("profile.currentPassword")} htmlFor="current-password"><Input id="current-password" type="password" required value={passwords.currentPassword} onChange={(event) => setPasswords({ ...passwords, currentPassword: event.target.value })} /></Field>
            <Field label={t("profile.newPassword")} htmlFor="new-password"><Input id="new-password" type="password" minLength={12} required value={passwords.newPassword} onChange={(event) => setPasswords({ ...passwords, newPassword: event.target.value })} /></Field>
            {changePassword.error ? <Alert variant="danger">{apiErrorText(changePassword.error, t)}</Alert> : null}
            <Button disabled={changePassword.isPending} type="submit">{t("profile.changePassword")}</Button>
          </div>
        </form>

        <section className="rounded-lg border border-border bg-surface p-6 shadow-sm lg:col-span-2">
          <h2 className="nx-h3 text-foreground">{t("profile.sessionsTitle")}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t("profile.sessionsDesc")}</p>
          {sessionsQuery.isPending ? (
            <div className="mt-6 space-y-3">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : sessions.length === 0 ? (
            <p className="mt-6 text-sm text-secondary-foreground">{t("profile.sessionsEmpty")}</p>
          ) : (
            <ul className="mt-6 divide-y divide-border">
              {sessions.map((item) => {
                const mobile = item.userAgent?.includes("Mobile") ?? false;
                const Icon = mobile ? Smartphone : Monitor;
                return (
                  <li key={item.id} className="flex flex-wrap items-center gap-3 py-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-md bg-surface-secondary text-secondary-foreground"><Icon className="size-4" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
                        {deviceLabel(item.userAgent, t("profile.sessionUnknownDevice"))}
                        {item.current ? <Badge variant="primary">{t("profile.sessionCurrent")}</Badge> : null}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {item.ipAddress ?? "—"} · {t("profile.sessionLastUsed", { date: formatDateTime(item.lastUsedAt ?? item.createdAt) })}
                      </p>
                    </div>
                    <Button variant="outline" size="sm" disabled={item.current || revokeSession.isPending} title={item.current ? t("profile.sessionCurrent") : undefined} onClick={() => void revoke(item.id)}>
                      {t("profile.sessionRevoke")}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
      {confirmDialog}
    </Page>
  );
}
