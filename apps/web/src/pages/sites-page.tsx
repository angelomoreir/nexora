import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SiteDto, SiteType, SiteVisibility } from "@nexora/contracts";
import { Briefcase, FolderTree, Globe, Layers, Lock, Plus, Users } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { useWorkspace } from "../components/layout/app-layout";
import { Alert, Badge, Button, Dialog, EmptyState, Field, Input, Page, PageHeader, Select, Skeleton, Textarea, useToast } from "../components/ui";
import { ContextualHelpButton } from "../components/help/contextual-help-button";
import { sitesApi } from "../lib/api";
import { apiErrorText } from "../lib/api-error";

const SITE_COLORS = ["#6366f1", "#8b5cf6", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#14b8a6"];

const TYPE_ICONS: Record<SiteType, typeof Globe> = {
  DEPARTMENT: Briefcase,
  PROJECT: FolderTree,
  TEAM: Users,
  HUB: Layers
};

export function SitesPage() {
  const { t } = useTranslation();
  const { organization } = useWorkspace();
  const canManage = organization.permissions.includes("sites.manage");
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<{ name: string; description: string; type: SiteType; visibility: SiteVisibility; color: string; parentId: string }>({
    name: "", description: "", type: "TEAM", visibility: "ORG", color: SITE_COLORS[0]!, parentId: ""
  });

  const listing = useQuery({ queryKey: ["sites", organization.id], queryFn: () => sitesApi.list(organization.id) });
  const create = useMutation({
    mutationFn: () => sitesApi.create(organization.id, {
      name: form.name.trim(),
      description: form.description.trim() || null,
      type: form.type,
      visibility: form.visibility,
      color: form.color,
      parentId: form.parentId || null
    }),
    onSuccess: async (site) => {
      setCreateOpen(false);
      setForm({ name: "", description: "", type: "TEAM", visibility: "ORG", color: SITE_COLORS[0]!, parentId: "" });
      await queryClient.invalidateQueries({ queryKey: ["sites", organization.id] });
      toast({ tone: "success", title: t("sites.created") });
      navigate(`/sites/${site.id}`);
    },
    onError: (error: Error) => toast({ tone: "danger", title: t("common.error"), description: apiErrorText(error, t) })
  });

  const sites = listing.data?.sites ?? [];
  const roots = sites.filter((site) => !site.parentId);
  const childrenOf = (id: string) => sites.filter((site) => site.parentId === id);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (form.name.trim().length >= 2) create.mutate();
  }

  function SiteCard({ site, child }: { site: SiteDto; child?: boolean }) {
    const Icon = TYPE_ICONS[site.type] ?? Users;
    return (
      <button
        onClick={() => navigate(`/sites/${site.id}`)}
        className={`nx-focus-ring group relative rounded-lg border border-border bg-surface p-5 text-left shadow-sm transition-colors hover:border-border-strong hover:bg-surface-secondary/40 ${child ? "ml-6 border-l-4" : ""}`}
        style={child ? { borderLeftColor: site.color } : undefined}
      >
        <div className="flex items-start justify-between">
          <span className="grid size-9 place-items-center rounded-md" style={{ background: `${site.color}1a`, color: site.color }}><Icon className="size-4" /></span>
          <div className="flex items-center gap-1.5">
            {site.visibility === "PRIVATE" ? <Lock className="size-3.5 text-muted-foreground" /> : null}
            <Badge variant="outline">{t(`sites.type.${site.type}`)}</Badge>
          </div>
        </div>
        <h2 className="mt-3 truncate text-sm font-semibold text-foreground group-hover:text-primary">{site.name}</h2>
        <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{site.description ?? "—"}</p>
        <div className="mt-4 flex items-center gap-2 text-[11px] text-muted-foreground">
          {site.myRole ? <Badge variant="outline">{t(`sites.role.${site.myRole}`)}</Badge> : null}
          <span className="inline-flex items-center gap-1"><Users className="size-3" />{site.memberCount}</span>
          {site.childrenCount > 0 ? <span>{t("sites.subSites", { count: site.childrenCount })}</span> : null}
        </div>
      </button>
    );
  }

  return (
    <Page>
      <PageHeader
        eyebrow={organization.name}
        title={t("sites.title")}
        description={t("sites.description")}
        actions={<><ContextualHelpButton route="/sites" showLabel /><Button onClick={() => setCreateOpen(true)} disabled={!canManage} title={!canManage ? t("errors.FORBIDDEN") : undefined}><Plus />{t("sites.create")}</Button></>}
      />
      {!canManage ? <Alert variant="info">{t("sites.readOnlyNotice")}</Alert> : null}
      {listing.isPending ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <Skeleton className="h-40" key={i} />)}</div>
      ) : listing.isError ? (
        <Alert variant="danger" title={t("sites.loadingError")}><Button className="mt-3" size="sm" onClick={() => void listing.refetch()}>{t("common.retry")}</Button></Alert>
      ) : sites.length === 0 ? (
        <EmptyState icon={Globe} title={t("sites.empty")} description={canManage ? t("sites.emptyDesc") : t("sites.readOnlyNotice")} action={canManage ? <Button onClick={() => setCreateOpen(true)}><Plus />{t("sites.create")}</Button> : undefined} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {roots.map((site) => (
            <div key={site.id} className="contents">
              <SiteCard site={site} />
              {childrenOf(site.id).map((child) => <SiteCard key={child.id} site={child} child />)}
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title={t("sites.newSite")}
        description={t("sites.createDesc")}
        footer={<><Button variant="ghost" onClick={() => setCreateOpen(false)}>{t("common.cancel")}</Button><Button type="submit" form="create-site-form" loading={create.isPending} disabled={form.name.trim().length < 2}>{t("common.create")}</Button></>}
      >
        <form id="create-site-form" className="space-y-4" onSubmit={submit}>
          <Field label={t("common.name")} required error={create.error ? apiErrorText(create.error, t) : undefined}>
            <Input autoFocus maxLength={120} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label={t("common.description")}>
            <Textarea rows={3} maxLength={480} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label={t("sites.fieldType")}>
              <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as SiteType })}>
                {(["DEPARTMENT", "PROJECT", "TEAM", "HUB"] as SiteType[]).map((type) => <option key={type} value={type}>{t(`sites.type.${type}`)}</option>)}
              </Select>
            </Field>
            <Field label={t("sites.parent")}>
              <Select value={form.parentId || "_root"} onChange={(e) => setForm({ ...form, parentId: e.target.value === "_root" ? "" : e.target.value })}>
                <option value="_root">{t("sites.noParent")}</option>
                {roots.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label={t("sites.visibility")}>
              <Select value={form.visibility} onChange={(e) => setForm({ ...form, visibility: e.target.value as SiteVisibility })}>
                <option value="ORG">{t("sites.visibilityOrg")}</option>
                <option value="PRIVATE">{t("sites.visibilityPrivate")}</option>
              </Select>
            </Field>
            <Field label={t("sites.color")}>
              <div className="flex gap-2 pt-1.5">
                {SITE_COLORS.map((color) => (
                  <button key={color} type="button" onClick={() => setForm({ ...form, color })}
                    className={`nx-focus-ring size-6 rounded-full transition-transform ${form.color === color ? "scale-110 ring-2 ring-border-strong ring-offset-2 ring-offset-surface" : ""}`}
                    style={{ background: color }} aria-label={color} />
                ))}
              </div>
            </Field>
          </div>
        </form>
      </Dialog>
    </Page>
  );
}
