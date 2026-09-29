import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SiteRole } from "@nexora/contracts";
import { CheckSquare, ClipboardList, FileText, Globe, LayoutDashboard, List, Lock, Newspaper, Plus, Settings, Trash2, UserPlus, Users } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { useWorkspace } from "../components/layout/app-layout";
import { PageRenderer } from "../components/page-renderer";
import { Alert, Avatar, Badge, Breadcrumb, Button, Card, CardContent, Dialog, EmptyState, Field, Input, Page, PageHeader, Select, Skeleton, TabPanel, Tabs, useConfirm, useToast } from "../components/ui";
import { sitesApi, usersApi } from "../lib/api";
import { apiErrorText } from "../lib/api-error";

const ROLE_RANK: Record<SiteRole, number> = { VIEWER: 1, CONTRIBUTOR: 2, EDITOR: 3, MANAGER: 4, ADMIN: 5 };
const SITE_ROLES: SiteRole[] = ["ADMIN", "MANAGER", "EDITOR", "CONTRIBUTOR", "VIEWER"];

export function SiteDetailPage() {
  const { siteId = "" } = useParams();
  const { t } = useTranslation();
  const { organization, session } = useWorkspace();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { confirm, confirmDialog } = useConfirm();
  const [tab, setTab] = useState("home");
  const [memberOpen, setMemberOpen] = useState(false);
  const [memberForm, setMemberForm] = useState<{ membershipId: string; role: SiteRole }>({ membershipId: "", role: "VIEWER" });
  const [pageOpen, setPageOpen] = useState(false);
  const [pageTitle, setPageTitle] = useState("");

  const detail = useQuery({ queryKey: ["site", organization.id, siteId], queryFn: () => sitesApi.get(organization.id, siteId), enabled: Boolean(siteId) });
  const orgUsers = useQuery({ queryKey: ["org-users", organization.id], queryFn: () => usersApi.list(organization.id) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["site", organization.id, siteId] });

  const addMember = useMutation({
    mutationFn: () => sitesApi.addMember(organization.id, siteId, memberForm.membershipId, memberForm.role),
    onSuccess: async () => { setMemberOpen(false); setMemberForm({ membershipId: "", role: "VIEWER" }); await refresh(); toast({ tone: "success", title: t("sites.memberAdded") }); },
    onError: (error: Error) => toast({ tone: "danger", title: t("common.error"), description: apiErrorText(error, t) })
  });
  const changeRole = useMutation({
    mutationFn: ({ membershipId, role }: { membershipId: string; role: SiteRole }) => sitesApi.updateMember(organization.id, siteId, membershipId, role),
    onSuccess: refresh,
    onError: (error: Error) => toast({ tone: "danger", title: t("common.error"), description: apiErrorText(error, t) })
  });
  const removeMember = useMutation({
    mutationFn: (membershipId: string) => sitesApi.removeMember(organization.id, siteId, membershipId),
    onSuccess: async () => { await refresh(); toast({ tone: "success", title: t("sites.memberRemoved") }); },
    onError: (error: Error) => toast({ tone: "danger", title: t("common.error"), description: apiErrorText(error, t) })
  });
  const deleteSite = useMutation({
    mutationFn: () => sitesApi.remove(organization.id, siteId),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["sites", organization.id] }); navigate("/sites"); },
    onError: (error: Error) => toast({ tone: "danger", title: t("common.error"), description: apiErrorText(error, t) })
  });
  const createPage = useMutation({
    mutationFn: () => sitesApi.createPage(organization.id, siteId, { title: pageTitle.trim(), status: "DRAFT", widgets: [{ id: "w1", type: "hero", props: { title: pageTitle.trim() } }] }),
    onSuccess: async ({ page }) => { setPageOpen(false); setPageTitle(""); await refresh(); navigate(`/pages/${page.id}`); },
    onError: (error: Error) => toast({ tone: "danger", title: t("common.error"), description: apiErrorText(error, t) })
  });

  if (detail.isPending) return <Page><Skeleton className="h-40" /></Page>;
  if (detail.isError || !detail.data) return <Page><Alert variant="danger" title={t("sites.loadingError")}><Button className="mt-3" size="sm" onClick={() => void detail.refetch()}>{t("common.retry")}</Button></Alert></Page>;

  const { site, members, pages, homePage, content, stats, children } = detail.data;
  const myRank = site.myRole ? ROLE_RANK[site.myRole] : 0;
  const canManage = myRank >= ROLE_RANK.MANAGER;
  const canEdit = myRank >= ROLE_RANK.EDITOR;
  const memberIds = new Set(members.map((m) => m.membershipId));
  const addableUsers = (orgUsers.data ?? []).filter((user) => !memberIds.has(user.memberId));

  function submitMember(event: FormEvent) {
    event.preventDefault();
    if (memberForm.membershipId) addMember.mutate();
  }
  function submitPage(event: FormEvent) {
    event.preventDefault();
    if (pageTitle.trim()) createPage.mutate();
  }

  return (
    <Page>
      <Breadcrumb className="mb-3" items={[{ label: t("sites.title"), href: "/sites" }, { label: site.name }]} />
      <PageHeader
        title={site.name}
        description={site.description ?? undefined}
        actions={canManage ? <Button variant="secondary" onClick={() => setMemberOpen(true)}><UserPlus />{t("sites.addMember")}</Button> : undefined}
      />
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <span className="grid size-8 place-items-center rounded-md" style={{ background: `${site.color}1a`, color: site.color }}><Globe className="size-4" /></span>
        <Badge variant="outline">{t(`sites.type.${site.type}`)}</Badge>
        <Badge variant={site.visibility === "PRIVATE" ? "warning" : "success"}>{site.visibility === "PRIVATE" ? <><Lock className="size-3" />{t("sites.visibilityPrivate")}</> : t("sites.visibilityOrg")}</Badge>
        {site.myRole ? <Badge variant="primary">{t("sites.myRole", { role: t(`sites.role.${site.myRole}`) })}</Badge> : null}
        <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1 text-xs text-muted-foreground"><FileText className="size-3" />{stats.documents} {t("navigation.documents").toLowerCase()}</span>
        <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1 text-xs text-muted-foreground"><Users className="size-3" />{stats.members} {t("sites.members").toLowerCase()}</span>
        <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1 text-xs text-muted-foreground"><CheckSquare className="size-3" />{stats.tasks} {t("navigation.tasks").toLowerCase()}</span>
        <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1 text-xs text-muted-foreground"><Newspaper className="size-3" />{stats.news} {t("navigation.news").toLowerCase()}</span>
      </div>

      <Tabs
        value={tab}
        onValueChange={setTab}
        items={[
          { value: "home", label: t("sites.tabHome"), icon: <LayoutDashboard className="size-3.5" /> },
          { value: "content", label: t("sites.tabContent"), icon: <ClipboardList className="size-3.5" /> },
          { value: "members", label: `${t("sites.members")} (${members.length})`, icon: <Users className="size-3.5" /> },
          ...(canManage ? [{ value: "settings", label: t("navigation.settings"), icon: <Settings className="size-3.5" /> }] : [])
        ]}
      />

      <TabPanel active={tab === "home"} className="pt-5">
        {homePage ? <PageRenderer widgets={homePage.widgets} siteId={site.id} /> : <EmptyState icon={LayoutDashboard} title={t("sites.noHome")} description={t("sites.noHomeDesc")} />}
        {children.length > 0 ? (
          <div className="mt-6">
            <h3 className="mb-3 text-sm font-semibold text-secondary-foreground">{t("sites.subSitesTitle")}</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {children.map((child) => (
                <Link key={child.id} to={`/sites/${child.id}`} className="nx-focus-ring rounded-lg border border-border bg-surface p-4 transition-colors hover:border-border-strong">
                  <span className="inline-block rounded-md p-2" style={{ background: `${child.color}1a`, color: child.color }}><Globe className="size-4" /></span>
                  <p className="mt-2 text-sm font-medium text-foreground">{child.name}</p>
                </Link>
              ))}
            </div>
          </div>
        ) : null}
      </TabPanel>

      <TabPanel active={tab === "content"} className="pt-5">
        <div className="mb-4 flex justify-end">
          {canEdit ? <Button size="sm" onClick={() => setPageOpen(true)}><Plus />{t("pages.create")}</Button> : null}
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          <Card>
            <CardContent className="p-0">
              <p className="flex items-center gap-2 border-b border-border px-5 py-3 text-sm font-semibold text-foreground"><LayoutDashboard className="size-4 text-primary" />{t("sites.pagesSection")}</p>
              {pages.filter((page) => !page.isHome).length === 0 ? <p className="px-5 py-6 text-center text-sm text-muted-foreground">—</p> : null}
              {pages.filter((page) => !page.isHome).map((page) => (
                <Link key={page.id} to={`/pages/${page.id}`} className="flex items-center justify-between border-b border-border px-5 py-3 last:border-0 hover:bg-surface-secondary">
                  <span className="text-sm font-medium text-secondary-foreground">{page.title}</span>
                  <Badge variant={page.status === "PUBLISHED" ? "success" : "warning"}>{t(`pages.status.${page.status}`)}</Badge>
                </Link>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-0">
              <p className="flex items-center gap-2 border-b border-border px-5 py-3 text-sm font-semibold text-foreground"><List className="size-4 text-primary" />{t("sites.contentSection")}</p>
              {content.length === 0 ? <p className="px-5 py-6 text-center text-sm text-muted-foreground">—</p> : null}
              {content.map((item) => (
                <Link key={item.id} to={item.href} className="flex items-center justify-between border-b border-border px-5 py-3 last:border-0 hover:bg-surface-secondary">
                  <span className="text-sm font-medium text-secondary-foreground">{item.name}</span>
                  <Badge variant="outline">{item.kind}</Badge>
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>
      </TabPanel>

      <TabPanel active={tab === "members"} className="pt-5">
        <Card>
          <CardContent className="divide-y divide-border p-0">
            {members.map((member) => (
              <div key={member.membershipId} className="flex items-center gap-3 px-5 py-3.5">
                <Avatar name={member.user.name} src={member.user.avatar} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{member.user.name}{member.user.id === session.user.id ? <span className="text-muted-foreground"> ({t("common.you")})</span> : null}</p>
                  <p className="truncate text-xs text-muted-foreground">{member.user.email}</p>
                </div>
                {canManage && member.user.id !== session.user.id ? (
                  <div className="flex items-center gap-2">
                    <Select className="h-8 w-36 text-xs" value={member.role} onChange={(e) => changeRole.mutate({ membershipId: member.membershipId, role: e.target.value as SiteRole })} aria-label={t("sites.roleLabel")}>
                      {SITE_ROLES.map((role) => <option key={role} value={role}>{t(`sites.role.${role}`)}</option>)}
                    </Select>
                    <Button variant="ghost" size="icon-sm" onClick={() => removeMember.mutate(member.membershipId)} aria-label={t("common.delete")}><Trash2 className="size-3.5 text-danger" /></Button>
                  </div>
                ) : <Badge variant="primary">{t(`sites.role.${member.role}`)}</Badge>}
              </div>
            ))}
          </CardContent>
        </Card>
      </TabPanel>

      {canManage ? (
        <TabPanel active={tab === "settings"} className="pt-5">
          <Card className="max-w-lg">
            <CardContent className="p-5">
              <h3 className="text-sm font-semibold text-danger">{t("sites.dangerZone")}</h3>
              <p className="mb-4 mt-2 text-sm text-muted-foreground">{t("sites.deleteDesc")}</p>
              <Button variant="destructive" loading={deleteSite.isPending} onClick={async () => { if (await confirm(t("sites.deleteConfirm"))) deleteSite.mutate(); }}>
                <Trash2 />{t("sites.deleteSite")}
              </Button>
            </CardContent>
          </Card>
        </TabPanel>
      ) : null}

      <Dialog open={memberOpen} onOpenChange={setMemberOpen} title={t("sites.addMemberTo", { name: site.name })}
        footer={<><Button variant="ghost" onClick={() => setMemberOpen(false)}>{t("common.cancel")}</Button><Button type="submit" form="add-member-form" loading={addMember.isPending} disabled={!memberForm.membershipId}>{t("common.add")}</Button></>}>
        <form id="add-member-form" className="space-y-4" onSubmit={submitMember}>
          <Field label={t("common.user")} required error={addMember.error ? apiErrorText(addMember.error, t) : undefined}>
            <Select value={memberForm.membershipId} onChange={(e) => setMemberForm({ ...memberForm, membershipId: e.target.value })}>
              <option value="">{t("common.select")}</option>
              {addableUsers.map((user) => <option key={user.memberId} value={user.memberId}>{user.name} — {user.email}</option>)}
            </Select>
          </Field>
          <Field label={t("sites.roleLabel")}>
            <Select value={memberForm.role} onChange={(e) => setMemberForm({ ...memberForm, role: e.target.value as SiteRole })}>
              {SITE_ROLES.map((role) => <option key={role} value={role}>{t(`sites.role.${role}`)}</option>)}
            </Select>
          </Field>
        </form>
      </Dialog>

      <Dialog open={pageOpen} onOpenChange={setPageOpen} title={t("pages.newPage")}
        footer={<><Button variant="ghost" onClick={() => setPageOpen(false)}>{t("common.cancel")}</Button><Button type="submit" form="create-page-form" loading={createPage.isPending} disabled={!pageTitle.trim()}>{t("common.create")}</Button></>}>
        <form id="create-page-form" className="space-y-4" onSubmit={submitPage}>
          <Field label={t("common.title")} required error={createPage.error ? apiErrorText(createPage.error, t) : undefined}>
            <Input autoFocus maxLength={200} value={pageTitle} onChange={(e) => setPageTitle(e.target.value)} />
          </Field>
        </form>
      </Dialog>
      {confirmDialog}
    </Page>
  );
}
