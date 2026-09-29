import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AuthSession, OrganizationSummary, SearchEntityType } from "@nexora/contracts";
import { BarChart3, Bell, Building2, CalendarCheck2, Check, ChevronDown, FileText, FilePlus, Folder, GitBranch, Globe, LayoutDashboard, List, LogOut, Menu, Newspaper, Search, Settings, UserRound, CheckSquare, CheckCheck, Shield, Sparkles, CreditCard, HelpCircle, X } from "lucide-react";
import { Suspense, createContext, useContext, useDeferredValue, useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { NavLink, Navigate, Outlet, useNavigate } from "react-router";
import { authApi, notificationsApi, searchApi } from "../../lib/api";
import { useRealtimeChannel } from "../collaboration/use-realtime-channel";
import { cn } from "../../lib/utils";
import { Avatar as AvatarPrimitive } from "../ui/avatar";
import { Button } from "../ui/button";
import { CommandMenu, type CommandItem } from "../ui/command-menu";
import { Dropdown, DropdownItem } from "../ui/dropdown";
import { LanguageSelector } from "../ui/language-selector";
import { ThemeToggle } from "../ui/theme-toggle";

interface WorkspaceContextValue {
  session: AuthSession;
  organization: OrganizationSummary;
  setOrganizationId: (id: string) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("Workspace context is unavailable");
  return context;
}

const SEARCH_TYPE_ICONS: Record<SearchEntityType, typeof FileText> = { document: FileText, folder: Folder, list: List, list_item: List, task: CheckSquare, workflow: GitBranch, user: UserRound, site: Globe, news: Newspaper };
const SEARCH_TYPE_LABEL_KEYS: Record<SearchEntityType, string> = { document: "search.documents", folder: "search.folders", list: "search.lists", list_item: "search.records", task: "search.tasks", workflow: "search.workflows", user: "search.users", site: "search.sites", news: "search.news" };

// Permissions that unlock at least one screen in the /admin area.
const ADMIN_PERMISSIONS = new Set([
  "organizations.manage",
  "roles.manage",
  "users.create",
  "users.update",
  "users.delete",
  "audit.view",
  "settings.manage",
  "webhooks.manage",
  "workflows.manage"
]);

export function canAccessAdmin(organization: OrganizationSummary): boolean {
  return organization.permissions.some((key) => ADMIN_PERMISSIONS.has(key));
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { organization } = useWorkspace();
  if (!canAccessAdmin(organization)) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

export function RequireSuperAdmin({ children }: { children: ReactNode }) {
  const { session } = useWorkspace();
  if (!session.user.isSuperAdmin) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

export function AppLayout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const sessionQuery = useQuery({ queryKey: ["session"], queryFn: authApi.me, retry: false });
  const [organizationId, setOrganizationIdState] = useState(() => localStorage.getItem("nexora.organizationId") ?? "");
  const [navOpen, setNavOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const deferredPaletteQuery = useDeferredValue(paletteQuery);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((value) => !value);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
  const logout = useMutation({
    mutationFn: authApi.logout,
    onSettled: async () => {
      queryClient.clear();
      await navigate("/login", { replace: true });
    }
  });

  const organization = sessionQuery.data?.organizations.find(({ id }) => id === organizationId) ?? sessionQuery.data?.organizations[0];
  const realtime = useRealtimeChannel({
    organizationId: organization?.id ?? "",
    channel: { type: "notifications" },
    enabled: Boolean(organization?.id),
    onEvent: (event) => {
      if (event.type === "connected" || event.type === "notification.created" || event.type === "notification.updated") {
        void queryClient.invalidateQueries({ queryKey: ["notifications-unread-count", organization?.id] });
        void queryClient.invalidateQueries({ queryKey: ["notifications", organization?.id] });
      }
    }
  });
  const unreadQuery = useQuery({
    queryKey: ["notifications-unread-count", organization?.id],
    queryFn: () => notificationsApi.unreadCount(organization!.id),
    enabled: !!organization?.id,
    refetchInterval: realtime.status === "live" ? false : 30000
  });
  const unreadCount = unreadQuery.data?.unreadCount ?? 0;

  const paletteSearch = useQuery({
    queryKey: ["command-search", organization?.id, deferredPaletteQuery],
    queryFn: () => searchApi.search(organization!.id, deferredPaletteQuery),
    enabled: paletteOpen && !!organization?.id && deferredPaletteQuery.length >= 2,
    staleTime: 15000
  });

  const paletteItems = useMemo<CommandItem[]>(() => {
    const searchAll: CommandItem[] = deferredPaletteQuery.length >= 2 ? [{
      id: "search-all",
      label: t("commandMenu.searchAll", { query: deferredPaletteQuery }),
      description: t("commandMenu.searchAllDesc"),
      icon: <Search className="size-4" />,
      keywords: [deferredPaletteQuery],
      group: t("commandMenu.searchResults"),
      onSelect: () => void navigate(`/search?q=${encodeURIComponent(deferredPaletteQuery)}`)
    }] : [];
    const remote: CommandItem[] = (paletteSearch.data?.groups ?? []).flatMap((group) =>
      group.results.map((result) => {
        const Icon = SEARCH_TYPE_ICONS[result.type] ?? Search;
        return {
          id: `${result.type}-${result.id}`,
          label: result.title || t("search.record"),
          description: result.subtitle ?? undefined,
          icon: <Icon className="size-4" />,
          keywords: [deferredPaletteQuery],
          group: t(SEARCH_TYPE_LABEL_KEYS[result.type] ?? "commandMenu.searchResults"),
          onSelect: () => void navigate(result.href)
        };
      })
    );
    const destination = (id: string, label: string, icon: ReactNode, to: string): CommandItem => ({ id: `nav-${id}`, label, icon, keywords: [to], group: t("commandMenu.navigation"), onSelect: () => navigate(to) });
    const nav: CommandItem[] = [
      destination("my-day", t("navigation.myDay"), <CalendarCheck2 className="size-4" />, "/my-day"),
      destination("dashboard", t("navigation.dashboard"), <LayoutDashboard className="size-4" />, "/dashboard"),
      destination("search", t("navigation.search"), <Search className="size-4" />, "/search"),
      destination("tasks", t("navigation.tasks"), <CheckSquare className="size-4" />, "/tasks"),
      destination("approvals", t("navigation.approvals"), <CheckCheck className="size-4" />, "/approvals"),
      destination("workflows", t("navigation.workflows"), <GitBranch className="size-4" />, "/workflows"),
      ...(organization?.permissions.includes("analytics.view") ? [destination("analytics", t("navigation.analytics"), <BarChart3 className="size-4" />, "/analytics")] : []),
      destination("notifications", t("navigation.notifications"), <Bell className="size-4" />, "/notifications"),
      destination("sites", t("navigation.sites"), <Globe className="size-4" />, "/sites"),
      destination("news", t("navigation.news"), <Newspaper className="size-4" />, "/news"),
      destination("documents", t("navigation.documents"), <FileText className="size-4" />, "/documents"),
      destination("lists", t("navigation.lists"), <List className="size-4" />, "/lists"),
      destination("forms", t("navigation.forms"), <FilePlus className="size-4" />, "/forms"),
      destination("ai", t("navigation.ai"), <Sparkles className="size-4" />, "/ai"),
      destination("help", t("navigation.help"), <HelpCircle className="size-4" />, "/help"),
      destination("billing", t("navigation.billing"), <CreditCard className="size-4" />, "/billing"),
      destination("settings", t("navigation.settings"), <Settings className="size-4" />, "/settings"),
      destination("profile", t("navigation.profile"), <UserRound className="size-4" />, "/profile")
    ];
    if (organization && canAccessAdmin(organization)) nav.push(destination("admin", t("navigation.admin"), <Shield className="size-4" />, "/admin"));
    return [...searchAll, ...remote, ...nav];
  }, [paletteSearch.data, deferredPaletteQuery, organization, t, navigate]);

  if (sessionQuery.isPending) return <div className="grid min-h-screen place-items-center bg-background text-sm text-muted-foreground">{t("common.loading")}</div>;
  if (sessionQuery.isError) return <Navigate to="/login" replace />;

  const session = sessionQuery.data;
  if (session.organizations.length === 0) return <div className="grid min-h-screen place-items-center bg-background text-secondary-foreground">{t("common.noOrganization")}</div>;

  function setOrganizationId(id: string) {
    localStorage.setItem("nexora.organizationId", id);
    setOrganizationIdState(id);
  }

  return (
    <WorkspaceContext.Provider value={{ session, organization: organization!, setOrganizationId }}>
      <div className="flex min-h-screen bg-background text-foreground">
        {navOpen ? <div className="fixed inset-0 z-30 bg-overlay lg:hidden" aria-hidden="true" onClick={() => setNavOpen(false)} /> : null}
        <aside className={cn("fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-nav text-nav-foreground transition-transform duration-[var(--nx-duration-normal)] ease-[var(--nx-ease-out)] lg:translate-x-0", navOpen ? "translate-x-0" : "-translate-x-full")}>
          <div className="flex h-16 items-center gap-3 border-b border-nav-border px-5"><img src={organization?.logoUrl || "/logo.png"} alt={organization?.name ?? "NEXORA"} className="size-8 rounded-md object-cover" /><span><span className="block text-sm font-semibold tracking-[0.16em]">NEXORA</span><span className="mt-0.5 block text-[10px] text-nav-muted">{t("navigation.enterpriseWorkspace")}</span></span><Button variant="ghost" size="icon-sm" className="ml-auto text-nav-muted hover:bg-nav-hover hover:text-nav-foreground lg:hidden" aria-label={t("common.close")} onClick={() => setNavOpen(false)}><X /></Button></div>
          <nav className="nx-scrollbar flex-1 overflow-y-auto p-3" onClick={() => setNavOpen(false)}>
            <div className="space-y-0.5">
              <NavigationLink to="/my-day" icon={CalendarCheck2}>{t("navigation.myDay")}</NavigationLink>
              <NavigationLink to="/dashboard" icon={LayoutDashboard}>{t("navigation.dashboard")}</NavigationLink>
              <NavigationLink to="/search" icon={Search}>{t("navigation.search")}</NavigationLink>
            </div>
            <NavigationGroup label={t("navigation.groupWork")}>
              <NavigationLink to="/tasks" icon={CheckSquare}>{t("navigation.tasks")}</NavigationLink>
              <NavigationLink to="/approvals" icon={CheckCheck}>{t("navigation.approvals")}</NavigationLink>
              <NavigationLink to="/workflows" icon={GitBranch}>{t("navigation.workflows")}</NavigationLink>
              <NavigationLink to="/notifications" icon={Bell} badge={unreadCount}>{t("navigation.notifications")}</NavigationLink>
              {organization?.permissions.includes("analytics.view") ? <NavigationLink to="/analytics" icon={BarChart3}>{t("navigation.analytics")}</NavigationLink> : null}
            </NavigationGroup>
            <NavigationGroup label={t("navigation.groupContent")}>
              <NavigationLink to="/sites" icon={Globe}>{t("navigation.sites")}</NavigationLink>
              <NavigationLink to="/news" icon={Newspaper}>{t("navigation.news")}</NavigationLink>
              <NavigationLink to="/documents" icon={FileText}>{t("navigation.documents")}</NavigationLink>
              <NavigationLink to="/lists" icon={List}>{t("navigation.lists")}</NavigationLink>
              <NavigationLink to="/forms" icon={FilePlus}>{t("navigation.forms")}</NavigationLink>
            </NavigationGroup>
            <NavigationGroup label={t("navigation.groupTools")}>
              <NavigationLink to="/ai" icon={Sparkles}>{t("navigation.ai")}</NavigationLink>
              <NavigationLink to="/help" icon={HelpCircle}>{t("navigation.help")}</NavigationLink>
            </NavigationGroup>
            <NavigationGroup label={t("navigation.groupManage")}>
              {canAccessAdmin(organization!) ? <NavigationLink to="/admin" icon={Shield}>{t("navigation.admin")}</NavigationLink> : null}
              <NavigationLink to="/billing" icon={CreditCard}>{t("navigation.billing")}</NavigationLink>
              <NavigationLink to="/settings" icon={Settings}>{t("navigation.settings")}</NavigationLink>
              <NavigationLink to="/profile" icon={UserRound}>{t("navigation.profile")}</NavigationLink>
            </NavigationGroup>
          </nav>
          <div className="border-t border-nav-border px-4 py-3 text-xs text-nav-muted">{organization!.name}</div>
        </aside>
        <div className="min-w-0 flex-1 lg:pl-64">
          <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border bg-surface px-4 sm:px-5 lg:px-8">
            <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground"><Button variant="ghost" size="icon" className="lg:hidden" aria-label={t("common.menu")} onClick={() => setNavOpen(true)}><Menu /></Button>{session.organizations.length > 1 ? <Dropdown align="start" trigger={<button type="button" aria-label={t("common.activeOrganization")} className="nx-focus-ring flex max-w-56 items-center gap-2 rounded-md px-2 py-1.5 hover:bg-surface-secondary"><Building2 className="size-4 shrink-0 text-muted-foreground" /><span className="truncate font-medium text-secondary-foreground">{organization!.name}</span><ChevronDown className="size-4 shrink-0 text-muted-foreground" /></button>}>{session.organizations.map((item) => <DropdownItem key={item.id} onClick={() => setOrganizationId(item.id)}><Building2 className="size-4 shrink-0 text-muted-foreground" /><span className="flex-1 truncate">{item.name}</span>{item.id === organization!.id ? <Check className="size-4 shrink-0 text-primary" /> : null}</DropdownItem>)}</Dropdown> : <span className="flex max-w-56 items-center gap-2 px-2 py-1.5"><Building2 className="size-4 shrink-0 text-muted-foreground" /><span className="truncate font-medium text-secondary-foreground">{organization!.name}</span></span>}</div>
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="sm" className="hidden gap-2 font-normal text-muted-foreground sm:inline-flex" onClick={() => setPaletteOpen(true)} aria-label={t("common.searchCommands")}><Search className="size-4" /><kbd className="rounded border border-border bg-surface-secondary px-1 text-[10px] font-semibold">Ctrl K</kbd></Button>
              <ThemeToggle />
              <LanguageSelector />
              <Button variant="ghost" size="icon" className="relative text-muted-foreground" onClick={() => navigate("/notifications")} title={t("navigation.notifications")} aria-label={t("navigation.notifications")}><Bell />{unreadCount > 0 ? <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">{unreadCount > 9 ? "9+" : unreadCount}</span> : null}</Button>
              <Dropdown
                trigger={
                  <button type="button" className="nx-focus-ring flex items-center gap-3 rounded-md p-1 hover:bg-surface-secondary">
                    <Avatar name={session.user.name} avatar={session.user.avatar} />
                    <span className="hidden text-left sm:block"><span className="block text-sm font-medium text-foreground">{session.user.name}</span><span className="block text-xs text-muted-foreground">{session.user.email}</span></span>
                    <ChevronDown className="size-4 text-muted-foreground" />
                  </button>
                }
              >
                <DropdownItem onClick={() => void navigate("/profile")}><UserRound className="size-4" />{t("common.profile")}</DropdownItem>
                <DropdownItem destructive onClick={() => logout.mutate()}><LogOut className="size-4" />{t("common.logout")}</DropdownItem>
              </Dropdown>
            </div>
          </header>
          <main className="min-w-0 p-[var(--nx-page-padding)]"><Suspense fallback={<div className="grid min-h-[50vh] place-items-center text-sm text-muted-foreground">{t("common.loading")}</div>}><Outlet /></Suspense></main>
          <CommandMenu open={paletteOpen} onOpenChange={setPaletteOpen} items={paletteItems} onQueryChange={setPaletteQuery} loading={paletteSearch.isFetching && deferredPaletteQuery.length >= 2} />
        </div>
      </div>
    </WorkspaceContext.Provider>
  );
}

function NavigationGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mt-5">
      <p className="nx-label px-3 pb-1.5 uppercase text-nav-muted/70">{label}</p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function NavigationLink({ to, icon: Icon, children, badge }: { to: string; icon: typeof LayoutDashboard; children: string; badge?: number }) {
  return (
    <NavLink to={to} className={({ isActive }) => `nx-focus-ring flex min-h-9 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${isActive ? "bg-primary text-white" : "text-nav-muted hover:bg-nav-hover hover:text-nav-foreground"}`}>
      <Icon className="size-4" strokeWidth={1.8} />
      <span className="flex-1">{children}</span>
      {badge !== undefined && badge > 0 ? <span className="grid min-w-5 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">{badge > 9 ? "9+" : badge}</span> : null}
    </NavLink>
  );
}

export function Avatar({ name, avatar }: { name: string; avatar: string | null }) {
  return <AvatarPrimitive name={name} src={avatar} />;
}
