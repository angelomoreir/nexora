import { Building2, ChevronRight, Inbox, Lock, Megaphone, ScrollText, Settings, Shield, ShieldCheck, TrendingUp, Users, UsersRound, Webhook, Zap } from "lucide-react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { Page, PageHeader } from "../components/ui";
import { ContextualHelpButton } from "../components/help/contextual-help-button";
import { useWorkspace } from "../components/layout/app-layout";

export function AdminPage() {
  const { t } = useTranslation();
  const { session, organization } = useWorkspace();
  const can = (perm: string) => session.user.isSuperAdmin || organization.permissions.includes(perm);
  const SECTIONS = [
  { to: "/admin/users", icon: Users, perm: "users.update", title: t("admin.usersTitle"), description: t("admin.usersDesc") },
  { to: "/admin/teams", icon: UsersRound, perm: "roles.manage", title: t("admin.teamsTitle"), description: t("admin.teamsDesc") },
  { to: "/admin/roles", icon: Shield, perm: "roles.manage", title: t("admin.rolesTitle"), description: t("admin.rolesDesc") },
  { to: "/admin/audit", icon: ScrollText, perm: "audit.view", title: t("admin.auditTitle"), description: t("admin.auditDesc") },
  { to: "/admin/security", icon: Lock, perm: "audit.view", title: t("admin.securityTitle"), description: t("admin.securityDesc") },
  { to: "/admin/webhooks", icon: Webhook, perm: "webhooks.manage", title: t("admin.webhooksTitle"), description: t("admin.webhooksDesc") },
  { to: "/admin/automation", icon: Zap, perm: "workflows.manage", title: t("admin.automationTitle"), description: t("admin.automationDesc") },
  { to: "/admin/announcements", icon: Megaphone, perm: "settings.manage", title: t("admin.announcementsTitle"), description: t("admin.announcementsDesc") },
  ...(session.user.isSuperAdmin ? [
    { to: "/admin/platform-metrics", icon: TrendingUp, perm: null, title: t("admin.platformMetricsTitle"), description: t("admin.platformMetricsDesc") },
    { to: "/admin/organizations", icon: Building2, perm: null, title: t("admin.organizationsTitle"), description: t("admin.organizationsDesc") },
    { to: "/admin/contact-requests", icon: Inbox, perm: null, title: t("admin.contactRequestsTitle"), description: t("admin.contactRequestsDesc") }
  ] : []),
  { to: "/admin/governance", icon: ShieldCheck, perm: "audit.view", title: t("admin.governanceTitle"), description: t("admin.governanceDesc") },
  { to: "/admin/settings", icon: Settings, perm: "settings.manage", title: t("admin.settingsTitle"), description: t("admin.settingsDesc") }
].filter((s) => s.perm === null || can(s.perm));
  return (
    <Page>
      <PageHeader eyebrow={t("navigation.admin")} title={t("admin.title")} description={t("admin.description")} actions={<ContextualHelpButton route="/admin" showLabel />} />
      <div className="grid gap-3 sm:grid-cols-2">
        {SECTIONS.map((s) => (
          <Link key={s.to} to={s.to} className="group flex items-center gap-4 rounded-lg border border-border bg-surface p-4 transition-colors hover:border-border-strong nx-focus-ring">
            <span className="grid size-11 shrink-0 place-items-center rounded-md bg-surface-secondary text-secondary-foreground transition-colors group-hover:bg-primary-subtle group-hover:text-primary">
              <s.icon className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-foreground">{s.title}</p>
              <p className="text-sm text-secondary-foreground">{s.description}</p>
            </div>
            <ChevronRight className="size-5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
          </Link>
        ))}
      </div>
    </Page>
  );
}
