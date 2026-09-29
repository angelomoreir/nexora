import { lazy } from "react";
import { Navigate, createBrowserRouter } from "react-router";
import { AppLayout, RequireAdmin, RequireSuperAdmin } from "../components/layout/app-layout";
import { PublicLayout } from "../components/layout/public-layout";
import { RouteErrorPage } from "../pages/error-page";

const AnalyticsPage = lazy(() => import("../pages/analytics-page").then((m) => ({ default: m.AnalyticsPage })));
const DashboardPage = lazy(() => import("../pages/dashboard-page").then((m) => ({ default: m.DashboardPage })));
const DocumentDetailPage = lazy(() => import("../pages/document-detail-page").then((m) => ({ default: m.DocumentDetailPage })));
const DocumentsPage = lazy(() => import("../pages/documents-page").then((m) => ({ default: m.DocumentsPage })));
const DocumentsTrashPage = lazy(() => import("../pages/documents-trash-page").then((m) => ({ default: m.DocumentsTrashPage })));
const DocumentEditorPage = lazy(() => import("../pages/document-editor-page").then((m) => ({ default: m.DocumentEditorPage })));
const ForgotPasswordPage = lazy(() => import("../pages/forgot-password-page").then((m) => ({ default: m.ForgotPasswordPage })));
const FormBuilderPage = lazy(() => import("../pages/form-builder-page").then((m) => ({ default: m.FormBuilderPage })));
const FormDetailPage = lazy(() => import("../pages/form-detail-page").then((m) => ({ default: m.FormDetailPage })));
const FormsPage = lazy(() => import("../pages/forms-page").then((m) => ({ default: m.FormsPage })));
const ListDetailPage = lazy(() => import("../pages/list-detail-page").then((m) => ({ default: m.ListDetailPage })));
const ListsPage = lazy(() => import("../pages/lists-page").then((m) => ({ default: m.ListsPage })));
const LoginPage = lazy(() => import("../pages/login-page").then((m) => ({ default: m.LoginPage })));
const MyDayPage = lazy(() => import("../pages/my-day-page").then((m) => ({ default: m.MyDayPage })));
const ProfilePage = lazy(() => import("../pages/profile-page").then((m) => ({ default: m.ProfilePage })));
const RegisterPage = lazy(() => import("../pages/register-page").then((m) => ({ default: m.RegisterPage })));
const ResetPasswordPage = lazy(() => import("../pages/reset-password-page").then((m) => ({ default: m.ResetPasswordPage })));
const SettingsPage = lazy(() => import("../pages/settings-page").then((m) => ({ default: m.SettingsPage })));
const SharedDocumentPage = lazy(() => import("../pages/shared-document-page").then((m) => ({ default: m.SharedDocumentPage })));
const TaskDetailPage = lazy(() => import("../pages/task-detail-page").then((m) => ({ default: m.TaskDetailPage })));
const TasksPage = lazy(() => import("../pages/tasks-page").then((m) => ({ default: m.TasksPage })));
const WorkflowBuilderPage = lazy(() => import("../pages/workflow-builder-page").then((m) => ({ default: m.WorkflowBuilderPage })));
const WorkflowDetailPage = lazy(() => import("../pages/workflow-detail-page").then((m) => ({ default: m.WorkflowDetailPage })));
const WorkflowsPage = lazy(() => import("../pages/workflows-page").then((m) => ({ default: m.WorkflowsPage })));
const ApprovalsPage = lazy(() => import("../pages/approvals-page").then((m) => ({ default: m.ApprovalsPage })));
const NotificationsPage = lazy(() => import("../pages/notifications-page").then((m) => ({ default: m.NotificationsPage })));
const SearchPage = lazy(() => import("../pages/search-page").then((m) => ({ default: m.SearchPage })));
const AdminPage = lazy(() => import("../pages/admin-page").then((m) => ({ default: m.AdminPage })));
const AdminUsersPage = lazy(() => import("../pages/admin-users-page").then((m) => ({ default: m.AdminUsersPage })));
const AdminTeamsPage = lazy(() => import("../pages/admin-teams-page").then((m) => ({ default: m.AdminTeamsPage })));
const AdminRolesPage = lazy(() => import("../pages/admin-roles-page").then((m) => ({ default: m.AdminRolesPage })));
const AdminAuditPage = lazy(() => import("../pages/admin-audit-page").then((m) => ({ default: m.AdminAuditPage })));
const AdminSecurityPage = lazy(() => import("../pages/admin-security-page").then((m) => ({ default: m.AdminSecurityPage })));
const AdminSettingsPage = lazy(() => import("../pages/admin-settings-page").then((m) => ({ default: m.AdminSettingsPage })));
const AdminWebhooksPage = lazy(() => import("../pages/admin-webhooks-page").then((m) => ({ default: m.AdminWebhooksPage })));
const AdminAutomationPage = lazy(() => import("../pages/admin-automation-page").then((m) => ({ default: m.AdminAutomationPage })));
const AdminGovernancePage = lazy(() => import("../pages/admin-governance-page").then((m) => ({ default: m.AdminGovernancePage })));
const AdminAnnouncementsPage = lazy(() => import("../pages/admin-announcements-page").then((m) => ({ default: m.AdminAnnouncementsPage })));
const AdminContactRequestsPage = lazy(() => import("../pages/admin-contact-requests-page").then((m) => ({ default: m.AdminContactRequestsPage })));
const AdminOrganizationsPage = lazy(() => import("../pages/admin-organizations-page").then((m) => ({ default: m.AdminOrganizationsPage })));
const AIPage = lazy(() => import("../pages/ai-page").then((m) => ({ default: m.AIPage })));
const BillingPage = lazy(() => import("../pages/billing-page").then((m) => ({ default: m.BillingPage })));
const DesignSystemPage = lazy(() => import("../pages/design-system-page").then((m) => ({ default: m.DesignSystemPage })));
const HelpCenterPage = lazy(() => import("../pages/help-center-page").then((m) => ({ default: m.HelpCenterPage })));
const HelpArticlePage = lazy(() => import("../pages/help-article-page").then((m) => ({ default: m.HelpArticlePage })));
const HelpCategoryPage = lazy(() => import("../pages/help-category-page").then((m) => ({ default: m.HelpCategoryPage })));
const HelpSearchPage = lazy(() => import("../pages/help-search-page").then((m) => ({ default: m.HelpSearchPage })));
const HelpAssistantPage = lazy(() => import("../pages/help-assistant-page").then((m) => ({ default: m.HelpAssistantPage })));
const HelpAdminPage = lazy(() => import("../pages/help-admin-page").then((m) => ({ default: m.HelpAdminPage })));
const SitesPage = lazy(() => import("../pages/sites-page").then((m) => ({ default: m.SitesPage })));
const SiteDetailPage = lazy(() => import("../pages/site-detail-page").then((m) => ({ default: m.SiteDetailPage })));
const PageViewPage = lazy(() => import("../pages/page-view-page").then((m) => ({ default: m.PageViewPage })));
const NewsPage = lazy(() => import("../pages/news-page").then((m) => ({ default: m.NewsPage })));
const NewsDetailPage = lazy(() => import("../pages/news-detail-page").then((m) => ({ default: m.NewsDetailPage })));
const AcceptInvitePage = lazy(() => import("../pages/accept-invite-page").then((m) => ({ default: m.AcceptInvitePage })));
const LandingPage = lazy(() => import("../pages/public/landing-page").then((m) => ({ default: m.LandingPage })));
const FeaturesPage = lazy(() => import("../pages/public/features-page").then((m) => ({ default: m.FeaturesPage })));
const PricingPage = lazy(() => import("../pages/public/pricing-page").then((m) => ({ default: m.PricingPage })));
const AboutPage = lazy(() => import("../pages/public/about-page").then((m) => ({ default: m.AboutPage })));
const ContactPage = lazy(() => import("../pages/public/contact-page").then((m) => ({ default: m.ContactPage })));
const FaqPage = lazy(() => import("../pages/public/faq-page").then((m) => ({ default: m.FaqPage })));
const TermsPage = lazy(() => import("../pages/public/legal-page").then((m) => ({ default: m.TermsPage })));
const PrivacyPage = lazy(() => import("../pages/public/legal-page").then((m) => ({ default: m.PrivacyPage })));

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  { path: "/register", element: <RegisterPage /> },
  { path: "/forgot-password", element: <ForgotPasswordPage /> },
  { path: "/reset-password", element: <ResetPasswordPage /> },
  { path: "/share/:token", element: <SharedDocumentPage /> },
  { path: "/accept-invite", element: <AcceptInvitePage /> },
  {
    element: <PublicLayout />,
    errorElement: <RouteErrorPage />,
    children: [
      { path: "/", element: <LandingPage /> },
      { path: "/features", element: <FeaturesPage /> },
      { path: "/pricing", element: <PricingPage /> },
      { path: "/about", element: <AboutPage /> },
      { path: "/faq", element: <FaqPage /> },
      { path: "/contact", element: <ContactPage /> },
      { path: "/terms", element: <TermsPage /> },
      { path: "/privacy", element: <PrivacyPage /> }
    ]
  },
  {
    element: <AppLayout />,
    errorElement: <RouteErrorPage />,
    children: [
      { path: "/my-day", element: <MyDayPage /> },
      { path: "/dashboard", element: <DashboardPage /> },
      { path: "/analytics", element: <AnalyticsPage /> },
      { path: "/sites", element: <SitesPage /> },
      { path: "/sites/:siteId", element: <SiteDetailPage /> },
      { path: "/pages/:pageId", element: <PageViewPage /> },
      { path: "/news", element: <NewsPage /> },
      { path: "/news/:postId", element: <NewsDetailPage /> },
      { path: "/documents", element: <DocumentsPage /> },
      { path: "/documents/trash", element: <DocumentsTrashPage /> },
      { path: "/documents/:id", element: <DocumentDetailPage /> },
      { path: "/documents/:id/editor", element: <DocumentEditorPage /> },
      { path: "/lists", element: <ListsPage /> },
      { path: "/lists/:id", element: <ListDetailPage /> },
      { path: "/forms", element: <FormsPage /> },
      { path: "/forms/:id", element: <FormDetailPage /> },
      { path: "/forms/:id/builder", element: <FormBuilderPage /> },
      { path: "/tasks", element: <TasksPage /> },
      { path: "/tasks/:id", element: <TaskDetailPage /> },
      { path: "/workflows", element: <WorkflowsPage /> },
      { path: "/workflows/:id", element: <WorkflowDetailPage /> },
      { path: "/workflows/:id/builder", element: <WorkflowBuilderPage /> },
      { path: "/approvals", element: <ApprovalsPage /> },
      { path: "/notifications", element: <NotificationsPage /> },
      { path: "/search", element: <SearchPage /> },
      { path: "/ai", element: <AIPage /> },
      { path: "/billing", element: <BillingPage /> },
      { path: "/admin", element: <RequireAdmin><AdminPage /></RequireAdmin> },
      { path: "/admin/users", element: <RequireAdmin><AdminUsersPage /></RequireAdmin> },
      { path: "/admin/teams", element: <RequireAdmin><AdminTeamsPage /></RequireAdmin> },
      { path: "/admin/roles", element: <RequireAdmin><AdminRolesPage /></RequireAdmin> },
      { path: "/admin/audit", element: <RequireAdmin><AdminAuditPage /></RequireAdmin> },
      { path: "/admin/security", element: <RequireAdmin><AdminSecurityPage /></RequireAdmin> },
      { path: "/admin/webhooks", element: <RequireAdmin><AdminWebhooksPage /></RequireAdmin> },
      { path: "/admin/automation", element: <RequireAdmin><AdminAutomationPage /></RequireAdmin> },
      { path: "/admin/governance", element: <RequireAdmin><AdminGovernancePage /></RequireAdmin> },
      { path: "/admin/announcements", element: <RequireAdmin><AdminAnnouncementsPage /></RequireAdmin> },
      { path: "/admin/contact-requests", element: <RequireSuperAdmin><AdminContactRequestsPage /></RequireSuperAdmin> },
      { path: "/admin/organizations", element: <RequireSuperAdmin><AdminOrganizationsPage /></RequireSuperAdmin> },
      { path: "/admin/settings", element: <RequireAdmin><AdminSettingsPage /></RequireAdmin> },
      { path: "/settings", element: <SettingsPage /> },
      { path: "/profile", element: <ProfilePage /> },
      { path: "/design-system", element: import.meta.env.DEV ? <DesignSystemPage /> : <Navigate to="/dashboard" replace /> },
      { path: "/help", element: <HelpCenterPage /> },
      { path: "/help/search", element: <HelpSearchPage /> },
      { path: "/help/assistant", element: <HelpAssistantPage /> },
      { path: "/help/admin", element: <HelpAdminPage /> },
      { path: "/help/category/:categoryId", element: <HelpCategoryPage /> },
      { path: "/help/:slug", element: <HelpArticlePage /> }
    ]
  },
  { path: "*", element: <Navigate to="/" replace /> }
]);
