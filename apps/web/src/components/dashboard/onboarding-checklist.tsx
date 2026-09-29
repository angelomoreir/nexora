import type { RoleName } from "@nexora/contracts";
import { CalendarCheck2, CheckCheck, CheckCircle2, Circle, ClipboardList, FileText, FileUp, ListChecks, Newspaper, Rocket, Settings, UserPlus, UserRound, Users, Workflow, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Badge, Button } from "../ui";

interface OnboardingMetrics {
  documents: number;
  users: number;
  tasks: number;
  lists: number;
  forms: number;
  activeProcesses: number;
}

type OnboardingStepKey = "invite" | "document" | "workflow" | "settings" | "myDay" | "task" | "approvals" | "team" | "list" | "form" | "news" | "profile" | "documents";
type OnboardingProfile = "admin" | "manager" | "editor" | "member" | "viewer";

interface OnboardingStepConfig {
  to?: string;
  permission?: string;
  icon: typeof FileUp;
  metric?: (metrics: OnboardingMetrics) => boolean;
  markVisited: boolean;
  upload?: boolean;
}

const DISMISS_KEY_PREFIX = "nexora.onboarding.dismissed";

const ROLE_ORDER: RoleName[] = ["Super Admin", "Admin", "Manager", "Editor", "Member", "Viewer"];

const PROFILE_STEPS = {
  admin: ["invite", "document", "workflow", "settings", "myDay"],
  manager: ["task", "workflow", "approvals", "team", "myDay"],
  editor: ["document", "list", "form", "news", "myDay"],
  member: ["myDay", "task", "document", "approvals", "profile"],
  viewer: ["myDay", "documents", "news", "profile"]
} as const;

const STEP_CONFIG: Record<OnboardingStepKey, OnboardingStepConfig> = {
  invite: { to: "/admin/users", permission: "users.create", icon: UserPlus, metric: (metrics) => metrics.users > 1, markVisited: false },
  document: { permission: "documents.edit", icon: FileUp, metric: (metrics) => metrics.documents > 0, markVisited: false, upload: true },
  workflow: { to: "/workflows", permission: "workflows.manage", icon: Workflow, metric: (metrics) => metrics.activeProcesses > 0, markVisited: false },
  settings: { to: "/admin/settings", permission: "settings.manage", icon: Settings, markVisited: true },
  myDay: { to: "/my-day", icon: CalendarCheck2, markVisited: true },
  task: { to: "/tasks", permission: "tasks.manage", icon: CheckCircle2, metric: (metrics) => metrics.tasks > 0, markVisited: false },
  approvals: { to: "/approvals", permission: "approvals.view", icon: CheckCheck, markVisited: true },
  team: { to: "/admin/teams", permission: "users.create", icon: Users, markVisited: true },
  list: { to: "/lists", permission: "lists.manage", icon: ListChecks, metric: (metrics) => metrics.lists > 0, markVisited: false },
  form: { to: "/forms", permission: "forms.manage", icon: ClipboardList, metric: (metrics) => metrics.forms > 0, markVisited: false },
  news: { to: "/news", permission: "news.view", icon: Newspaper, markVisited: true },
  profile: { to: "/profile", icon: UserRound, markVisited: true },
  documents: { to: "/documents", permission: "documents.view", icon: FileText, markVisited: true }
};

function resolveProfile(roles: RoleName[]): { profile: OnboardingProfile; roleLabel: string } {
  const primary = ROLE_ORDER.find((role) => roles.includes(role)) ?? "Viewer";
  const profile: OnboardingProfile = primary === "Super Admin" || primary === "Admin" ? "admin" : primary === "Manager" ? "manager" : primary === "Editor" ? "editor" : primary === "Member" ? "member" : "viewer";
  return { profile, roleLabel: primary === "Super Admin" ? "Admin" : primary };
}

function readProgress(key: string): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function OnboardingChecklist({ organizationId, userId, roles, permissions, metrics, onUploadDocument }: {
  organizationId: string;
  userId: string;
  roles: RoleName[];
  permissions: string[];
  metrics: OnboardingMetrics;
  onUploadDocument: () => void;
}) {
  const { t } = useTranslation();
  const dismissKey = `${DISMISS_KEY_PREFIX}:${organizationId}:${userId}`;
  const progressKey = `${DISMISS_KEY_PREFIX}.progress:${organizationId}:${userId}`;
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(dismissKey) === "1");
  const [visited, setVisited] = useState<string[]>(() => readProgress(progressKey));

  if (dismissed) return null;

  const { profile, roleLabel } = resolveProfile(roles);
  const steps = (PROFILE_STEPS[profile] as readonly OnboardingStepKey[])
    .filter((key) => !STEP_CONFIG[key].permission || permissions.includes(STEP_CONFIG[key].permission!))
    .map((key) => {
      const config = STEP_CONFIG[key];
      return { key, config, done: config.metric ? config.metric(metrics) : visited.includes(key) };
    });
  if (steps.length === 0) return null;
  const doneCount = steps.filter((step) => step.done).length;
  const allDone = doneCount === steps.length;

  function dismiss() {
    localStorage.setItem(dismissKey, "1");
    setDismissed(true);
  }

  function markVisited(key: OnboardingStepKey) {
    setVisited((previous) => {
      if (previous.includes(key)) return previous;
      const next = [...previous, key];
      localStorage.setItem(progressKey, JSON.stringify(next));
      return next;
    });
  }

  return (
    <section aria-labelledby="onboarding-title" className="rounded-lg border border-primary/25 bg-primary-subtle/40 p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="nx-label flex items-center gap-2 text-primary"><Rocket className="size-3.5" />{t("dashboard.onboarding.eyebrow")}<Badge variant="neutral">{roleLabel}</Badge></p>
          <h2 id="onboarding-title" className="nx-h3 mt-1">{allDone ? t("dashboard.onboarding.doneTitle") : t(`dashboard.onboarding.profiles.${profile}.title`)}</h2>
          <p className="mt-1 text-sm text-secondary-foreground">{allDone ? t("dashboard.onboarding.doneDesc") : t(`dashboard.onboarding.profiles.${profile}.description`)}</p>
        </div>
        <Button variant="ghost" size="icon-sm" aria-label={t("dashboard.onboarding.dismiss")} title={t("dashboard.onboarding.dismiss")} onClick={dismiss}><X /></Button>
      </div>
      <div className="mb-4 flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-secondary">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
        </div>
        <span className="text-xs font-medium text-muted-foreground">{doneCount}/{steps.length}</span>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {steps.map((step) => {
          const Icon = step.config.icon;
          const content = (
            <>
              {step.done ? <CheckCircle2 className="size-4 shrink-0 text-success" /> : <Circle className="size-4 shrink-0 text-muted-foreground" />}
              <Icon className="size-4 shrink-0 text-primary" />
              <span className={`min-w-0 text-sm font-medium ${step.done ? "text-muted-foreground line-through" : "text-foreground"}`}>
                {t(`dashboard.onboarding.steps.${step.key}`)}
              </span>
            </>
          );
          return (
            <li key={step.key}>
              {step.config.upload && !step.done ? (
                <button type="button" onClick={onUploadDocument} className="nx-focus-ring flex w-full items-center gap-2 rounded-md border border-border bg-surface px-3 py-2.5 text-left transition-colors hover:border-primary">
                  {content}
                </button>
              ) : (
                <Link to={step.config.to ?? "/dashboard"} onClick={step.config.markVisited ? () => markVisited(step.key) : undefined} className="nx-focus-ring flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2.5 transition-colors hover:border-primary">
                  {content}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
      {allDone ? <Button className="mt-4" size="sm" variant="secondary" onClick={dismiss}><Users className="size-4" />{t("dashboard.onboarding.dismiss")}</Button> : null}
    </section>
  );
}
