import type { ApiErrorResponse, AuthSession, DashboardResponse, BulkDownloadInput, DocumentActivityResponse, DocumentCommentDto, DocumentDetailResponse, DocumentItemDto, CreateEditorDocumentInput, EditorContentResponse, SaveEditorContentInput, FolderMetadataFieldInput, FolderMetadataFieldsResponse, TrashResponse, DocumentShareLinkDto, DocumentSharePermission, DocumentShareTargetsResponse, DocumentShareTargetType, DocumentVersionType, DocumentsResponse, FolderItemDto, FormDefinitionDto, FormStatus, FormSubmissionDto, FormSubmissionsResponse, FormsResponse, HealthResponse, ListDefinitionDto, ListFieldDto, ListItemDto, ListItemsResponse, ListsResponse, ProjectDto, ProjectsResponse, PublicDocumentShareDto, PublicShareFolderContentsDto, RoleName, SharedDocumentsResponse, TaskCommentDto, TaskDto, TaskPriority, TaskStatus, TasksResponse, UserDto, WorkflowDefinitionDto, WorkflowInstanceDto, WorkflowInstancesResponse, WorkflowInstanceStatus, WorkflowStatus, WorkflowStepType, WorkflowsResponse, ApprovalDetailDto, ApprovalsResponse, ApprovalStatus, NotificationsResponse, UnreadCountResponse, SearchResponse, SearchFilters, AuditLogListResponse, AuditLogFilters, OrganizationSettingsDto, UpdateOrganizationSettingsDto, TeamDto, TeamDetailDto, CreateTeamDto, UpdateTeamDto, PermissionDto, RoleDto, CreateRoleDto, UpdateRoleDto, AIChatResponse, AIConversationDto, AIDocumentSummaryResponse, AIActionProposal, AIReportResponse, PlanDto, SubscriptionDto, UsageStats, SavedViewDto, SavedViewResourceType, CreateSavedViewInput, UpdateSavedViewInput, SavedViewsResponse, ResourceSubscriptionDto, SubscribeInput, UnsubscribeInput, SubscriptionsResponse, SubscriptionCheckResponse, SubscriptionTargetType, TemplatesResponse, DashboardDto, DashboardWidgetDto, CreateDashboardInput, UpdateDashboardInput, CreateWidgetInput, UpdateWidgetInput, DashboardsResponse, RenderedDashboardResponse, AccessPanelResponse, AccessRequestDto, AccessRequestStatus, RequestAccessInput, DecideAccessInput, AccessRequestsResponse, UpdateGovernanceInput, RecentDocumentsResponse, FavoritesResponse, InvitationDto, InvitationPreviewDto, ChangePlanResponse, SsoConfigDto, SsoLookupResponse, AutofillMetadataResponse, WebhookDto, WebhooksResponse, CreateWebhookInput, CreateWebhookResponse, UpdateWebhookInput, WebhookDeliveryDto, WebhookDeliveriesResponse, WorkflowTriggerDto, WorkflowTriggersResponse, WorkflowTriggerScope, QuickActionDto, QuickActionsResponse, AnnouncementDto, AnnouncementsResponse, AccessReviewResponse, GovernanceReportDto, DeltaFeedResponse } from "@nexora/contracts";

import type { CreateSiteInput, NewsCommentDto, NewsDetailResponse, NewsListResponse, NewsPostDto, NewsStatus, SiteDto, SiteMemberDto, SiteRole, SitesResponse, SiteDetailResponse, SitePagesResponse, SitePageResponse, UpdateSiteInput, UpsertNewsInput, UpsertSitePageInput, AIScaffoldApplyInput, AIScaffoldApplyResponse, AIScaffoldProposal, AIContextResourceType, AIContextualResponse, AutomationResourcesResponse, CollaborationMembersResponse, AnalyticsPeriodDays, OperationalAnalyticsResponse, UserSessionsResponse, SecurityOverviewDto } from "@nexora/contracts";
import type { ContactRequestsResponse, PlatformOrganizationsResponse } from "@nexora/contracts";

const apiUrl = import.meta.env?.VITE_API_URL ?? "http://localhost:3000/api/v1";

export function getApiUrl() {
  return apiUrl;
}

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields?: Record<string, string[]>
  ) {
    super(message);
  }
}

async function apiRequest<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${apiUrl}${path}`, { ...init, headers, credentials: "include" });
  const refreshExcluded = ["/auth/login", "/auth/register", "/auth/refresh", "/auth/logout", "/auth/forgot-password", "/auth/reset-password"];
  if (response.status === 401 && retry && !refreshExcluded.includes(path)) {
    const refreshed = await fetch(`${apiUrl}/auth/refresh`, { method: "POST", credentials: "include" });
    if (refreshed.ok) {
      return apiRequest<T>(path, init, false);
    }
  }
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as ApiErrorResponse | null;
    throw new ApiClientError(
      response.status,
      payload?.error.code ?? "REQUEST_FAILED",
      payload?.error.message ?? `Request failed with status ${response.status}`,
      payload?.error.fields
    );
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

export async function getHealth(baseUrl = apiUrl): Promise<HealthResponse> {
  const response = await fetch(`${baseUrl}/health`, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`API health check failed with status ${response.status}`);
  }
  return response.json() as Promise<HealthResponse>;
}

export const authApi = {
  login: (input: { email: string; password: string }) =>
    apiRequest<AuthSession>("/auth/login", { method: "POST", body: JSON.stringify(input) }, false),
  register: (input: { name: string; email: string; password: string; organizationName: string }) =>
    apiRequest<AuthSession>("/auth/register", { method: "POST", body: JSON.stringify(input) }, false),
  logout: () => apiRequest<void>("/auth/logout", { method: "POST" }, false),
  me: () => apiRequest<AuthSession>("/auth/me"),
  forgotPassword: (email: string) =>
    apiRequest<{ message: string; resetToken?: string }>(
      "/auth/forgot-password",
      { method: "POST", body: JSON.stringify({ email }) },
      false
    ),
  resetPassword: (token: string, password: string) =>
    apiRequest<{ message: string }>(
      "/auth/reset-password",
      { method: "POST", body: JSON.stringify({ token, password }) },
      false
    ),
  changePassword: (currentPassword: string, newPassword: string) =>
    apiRequest<{ message: string }>(
      "/auth/change-password",
      { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) }
    ),
  updateProfile: (input: { name?: string; avatar?: string | null; jobTitle?: string | null }) =>
    apiRequest<UserDto>("/auth/me", { method: "PATCH", body: JSON.stringify(input) }),
  sessions: () => apiRequest<UserSessionsResponse>("/auth/sessions"),
  revokeSession: (sessionId: string) => apiRequest<void>(`/auth/sessions/${sessionId}`, { method: "DELETE" })
};

export const securityApi = {
  overview: (organizationId: string) => apiRequest<SecurityOverviewDto>(`/organizations/${organizationId}/security/overview`)
};

export interface OrganizationUser extends UserDto {
  memberId: string;
  memberStatus: "ACTIVE" | "SUSPENDED";
  roles: RoleName[];
}

export const ssoApi = {
  get: (organizationId: string) => apiRequest<SsoConfigDto | null>(`/organizations/${organizationId}/sso`),
  update: (organizationId: string, input: { issuerUrl: string; clientId: string; clientSecret?: string; scopes?: string; emailDomains?: string[]; isEnabled?: boolean }) =>
    apiRequest<SsoConfigDto>(`/organizations/${organizationId}/sso`, { method: "PUT", body: JSON.stringify(input) }),
  remove: (organizationId: string) =>
    apiRequest<void>(`/organizations/${organizationId}/sso`, { method: "DELETE" }),
  lookup: (email: string) =>
    apiRequest<SsoLookupResponse>("/auth/sso/lookup", { method: "POST", body: JSON.stringify({ email }) }, false),
  startUrl: (organizationId: string) => `${apiUrl}/auth/sso/${organizationId}/start`
};

export const invitationsApi = {
  list: (organizationId: string) =>
    apiRequest<InvitationDto[]>(`/organizations/${organizationId}/invitations`),
  create: (organizationId: string, input: { email: string; role: RoleName }) =>
    apiRequest<{ invitation: InvitationDto; inviteUrl: string; emailSent: boolean }>(
      `/organizations/${organizationId}/invitations`,
      { method: "POST", body: JSON.stringify(input) }
    ),
  revoke: (organizationId: string, invitationId: string) =>
    apiRequest<void>(`/organizations/${organizationId}/invitations/${invitationId}`, { method: "DELETE" }),
  preview: (token: string) => apiRequest<InvitationPreviewDto>(`/auth/invitations/${token}`),
  accept: (token: string, input: { name?: string; password?: string }) =>
    apiRequest<AuthSession>(`/auth/invitations/${token}/accept`, { method: "POST", body: JSON.stringify(input) }, false)
};

export const dashboardApi = {
  get: (organizationId: string) =>
    apiRequest<DashboardResponse>(`/organizations/${organizationId}/dashboard`)
};

export const usersApi = {
  list: (organizationId: string) => apiRequest<OrganizationUser[]>(`/organizations/${organizationId}/users`),
  create: (
    organizationId: string,
    input: { name: string; email: string; password: string; jobTitle?: string; role: RoleName }
  ) =>
    apiRequest<OrganizationUser>(`/organizations/${organizationId}/users`, {
      method: "POST",
      body: JSON.stringify(input)
    }),
  update: (
    organizationId: string,
    userId: string,
    input: { memberStatus?: "ACTIVE" | "SUSPENDED"; role?: RoleName }
  ) =>
    apiRequest<OrganizationUser>(`/organizations/${organizationId}/users/${userId}`, {
      method: "PATCH",
      body: JSON.stringify(input)
    }),
  remove: (organizationId: string, userId: string) =>
    apiRequest<void>(`/organizations/${organizationId}/users/${userId}`, { method: "DELETE" })
};

export type FileManagerItem = DocumentItemDto | FolderItemDto;

async function downloadFile(path: string, retry = true, headers?: HeadersInit) {
  const response = await fetch(`${apiUrl}${path}`, { credentials: "include", headers });
  if (response.status === 401 && retry && !path.startsWith("/shares/")) {
    const refreshed = await fetch(`${apiUrl}/auth/refresh`, { method: "POST", credentials: "include" });
    if (refreshed.ok) return downloadFile(path, false, headers);
  }
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as ApiErrorResponse | null;
    throw new ApiClientError(response.status, payload?.error.code ?? "DOWNLOAD_FAILED", payload?.error.message ?? "Download failed");
  }
  const disposition = response.headers.get("content-disposition") ?? "";
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/)?.[1];
  return { blob: await response.blob(), name: encoded ? decodeURIComponent(encoded) : "document" };
}

export const documentsApi = {
  list: (organizationId: string, query: { folderId?: string; search?: string; sort?: string; order?: string; filter?: string; type?: string; meta?: string; sensitivity?: string; publishStatus?: string }) => {
    const params = new URLSearchParams(Object.entries(query).filter((entry): entry is [string, string] => Boolean(entry[1])));
    return apiRequest<DocumentsResponse>(`/organizations/${organizationId}/documents?${params}`);
  },
  get: (organizationId: string, documentId: string) => apiRequest<DocumentDetailResponse>(`/organizations/${organizationId}/documents/${documentId}`),
  createFolder: (organizationId: string, name: string, parentId: string | null) => apiRequest<FolderItemDto>(`/organizations/${organizationId}/folders`, { method: "POST", body: JSON.stringify({ name, parentId }) }),
  upload: (organizationId: string, file: File, folderId: string | null, path?: string) => {
    const form = new FormData();
    form.append("file", file);
    if (path) form.append("path", path);
    const suffix = folderId ? `?folderId=${encodeURIComponent(folderId)}` : "";
    return apiRequest<DocumentDetailResponse>(`/organizations/${organizationId}/documents${suffix}`, { method: "POST", body: form });
  },
  rename: (organizationId: string, item: FileManagerItem, name: string) => apiRequest<DocumentDetailResponse | FolderItemDto>(`/organizations/${organizationId}/${item.kind === "document" ? "documents" : "folders"}/${item.id}`, { method: "PATCH", body: JSON.stringify({ name }) }),
  move: (organizationId: string, item: FileManagerItem, destinationId: string | null) => apiRequest<DocumentDetailResponse | FolderItemDto>(`/organizations/${organizationId}/${item.kind === "document" ? "documents" : "folders"}/${item.id}`, { method: "PATCH", body: JSON.stringify(item.kind === "document" ? { folderId: destinationId } : { parentId: destinationId }) }),
  copy: (organizationId: string, item: FileManagerItem, destinationId: string | null) => apiRequest<DocumentDetailResponse | FolderItemDto>(`/organizations/${organizationId}/${item.kind === "document" ? "documents" : "folders"}/${item.id}/copy`, { method: "POST", body: JSON.stringify(item.kind === "document" ? { folderId: destinationId } : { parentId: destinationId }) }),
  remove: (organizationId: string, item: FileManagerItem) => apiRequest<void>(`/organizations/${organizationId}/${item.kind === "document" ? "documents" : "folders"}/${item.id}`, { method: "DELETE" }),
  favorite: (organizationId: string, item: FileManagerItem, favorite: boolean) => apiRequest<void>(`/organizations/${organizationId}/${item.kind}/${item.id}/favorite`, { method: "PUT", body: JSON.stringify({ favorite }) }),
  share: (organizationId: string, item: FileManagerItem, input: { membershipId: string; view: boolean; edit: boolean; delete: boolean; share: boolean }) => apiRequest<void>(`/organizations/${organizationId}/${item.kind}/${item.id}/permissions`, { method: "PUT", body: JSON.stringify(input) }),
  uploadVersion: (organizationId: string, documentId: string, file: File, versionType?: Lowercase<DocumentVersionType>) => {
    const form = new FormData();
    form.append("file", file);
    if (versionType) form.append("versionType", versionType);
    return apiRequest<DocumentDetailResponse>(`/organizations/${organizationId}/documents/${documentId}/versions`, { method: "POST", body: form });
  },
  downloadVersion: (organizationId: string, documentId: string, versionId: string) => downloadFile(`/organizations/${organizationId}/documents/${documentId}/versions/${versionId}/download`),
  restoreVersion: (organizationId: string, documentId: string, versionId: string) => apiRequest<DocumentDetailResponse>(`/organizations/${organizationId}/documents/${documentId}/versions/${versionId}/restore`, { method: "POST" }),
  shareTargets: (organizationId: string, documentId: string) => apiRequest<DocumentShareTargetsResponse>(`/organizations/${organizationId}/documents/${documentId}/share-targets`),
  shareDocument: (organizationId: string, documentId: string, input: { targetType: DocumentShareTargetType; targetId: string; permission: DocumentSharePermission }) => apiRequest<void>(`/organizations/${organizationId}/documents/${documentId}/shares`, { method: "POST", body: JSON.stringify(input) }),
  shareLinks: (organizationId: string, documentId: string) => apiRequest<DocumentShareLinkDto[]>(`/organizations/${organizationId}/documents/${documentId}/share-links`),
  createShareLink: (organizationId: string, documentId: string, input: { expiresInHours: number; password?: string; permission: DocumentSharePermission }) => apiRequest<DocumentShareLinkDto>(`/organizations/${organizationId}/documents/${documentId}/share-links`, { method: "POST", body: JSON.stringify(input) }),
  revokeShareLink: (organizationId: string, documentId: string, linkId: string) => apiRequest<void>(`/organizations/${organizationId}/documents/${documentId}/share-links/${linkId}`, { method: "DELETE" }),
  download: (organizationId: string, documentId: string) => downloadFile(`/organizations/${organizationId}/documents/${documentId}/download`),
  listTrash: (organizationId: string) => apiRequest<TrashResponse>(`/organizations/${organizationId}/trash`),
  restoreTrashItem: (organizationId: string, kind: "document" | "folder", id: string) => apiRequest<void>(`/organizations/${organizationId}/trash/${kind}/${id}/restore`, { method: "POST" }),
  purgeTrashItem: (organizationId: string, kind: "document" | "folder", id: string) => apiRequest<void>(`/organizations/${organizationId}/trash/${kind}/${id}`, { method: "DELETE" }),
  emptyTrash: (organizationId: string) => apiRequest<void>(`/organizations/${organizationId}/trash`, { method: "DELETE" }),
  checkOut: (organizationId: string, documentId: string) => apiRequest<DocumentDetailResponse>(`/organizations/${organizationId}/documents/${documentId}/checkout`, { method: "POST" }),
  checkIn: (organizationId: string, documentId: string) => apiRequest<DocumentDetailResponse>(`/organizations/${organizationId}/documents/${documentId}/checkin`, { method: "POST" }),
  listComments: (organizationId: string, documentId: string) => apiRequest<DocumentCommentDto[]>(`/organizations/${organizationId}/documents/${documentId}/comments`),
  createComment: (organizationId: string, documentId: string, body: string) => apiRequest<DocumentCommentDto>(`/organizations/${organizationId}/documents/${documentId}/comments`, { method: "POST", body: JSON.stringify({ body }) }),
  deleteComment: (organizationId: string, documentId: string, commentId: string) => apiRequest<void>(`/organizations/${organizationId}/documents/${documentId}/comments/${commentId}`, { method: "DELETE" }),
  getFolderMetadataFields: (organizationId: string, folderId: string) => apiRequest<FolderMetadataFieldsResponse>(`/organizations/${organizationId}/folders/${folderId}/metadata-fields`),
  setFolderMetadataFields: (organizationId: string, folderId: string, fields: FolderMetadataFieldInput[]) => apiRequest<FolderMetadataFieldsResponse>(`/organizations/${organizationId}/folders/${folderId}/metadata-fields`, { method: "PUT", body: JSON.stringify({ fields }) }),
  updateDocumentMetadata: (organizationId: string, documentId: string, values: Record<string, unknown>) => apiRequest<DocumentDetailResponse>(`/organizations/${organizationId}/documents/${documentId}/metadata`, { method: "PATCH", body: JSON.stringify({ values }) }),
  pin: (organizationId: string, item: FileManagerItem, pinned: boolean) => apiRequest<DocumentDetailResponse | FolderItemDto>(`/organizations/${organizationId}/${item.kind === "document" ? "documents" : "folders"}/${item.id}/pin`, { method: "POST", body: JSON.stringify({ pinned }) }),
  recent: (organizationId: string) => apiRequest<RecentDocumentsResponse>(`/organizations/${organizationId}/documents/recent`),
  favorites: (organizationId: string) => apiRequest<FavoritesResponse>(`/organizations/${organizationId}/documents/favorites`),
  autofillMetadata: (organizationId: string, documentId: string) => apiRequest<AutofillMetadataResponse>(`/organizations/${organizationId}/documents/${documentId}/autofill-metadata`, { method: "POST" }),
  setFolderGovernance: (organizationId: string, folderId: string, input: UpdateGovernanceInput) => apiRequest<FolderItemDto>(`/organizations/${organizationId}/folders/${folderId}/governance`, { method: "PATCH", body: JSON.stringify(input) }),
  shared: (organizationId: string) => apiRequest<SharedDocumentsResponse>(`/organizations/${organizationId}/documents/shared`),
  activity: (organizationId: string, documentId: string) => apiRequest<DocumentActivityResponse>(`/organizations/${organizationId}/documents/${documentId}/activity`),
  bulkDownload: async (organizationId: string, input: BulkDownloadInput) => {
    const response = await fetch(`${apiUrl}/organizations/${organizationId}/documents/bulk-download`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/zip" },
      body: JSON.stringify({ documentIds: input.documentIds ?? [], folderIds: input.folderIds ?? [] })
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as ApiErrorResponse | null;
      throw new ApiClientError(response.status, payload?.error.code ?? "DOWNLOAD_FAILED", payload?.error.message ?? "Download failed");
    }
    const disposition = response.headers.get("content-disposition") ?? "";
    const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/)?.[1];
    return { blob: await response.blob(), name: encoded ? decodeURIComponent(encoded) : "download.zip" };
  },
  createEditorDocument: (organizationId: string, input: CreateEditorDocumentInput) => apiRequest<DocumentDetailResponse>(`/organizations/${organizationId}/editor-documents`, { method: "POST", body: JSON.stringify(input) }),
  getEditorContent: (organizationId: string, documentId: string) => apiRequest<EditorContentResponse>(`/organizations/${organizationId}/documents/${documentId}/editor-content`),
  saveEditorContent: (organizationId: string, documentId: string, input: SaveEditorContentInput) => apiRequest<EditorContentResponse>(`/organizations/${organizationId}/documents/${documentId}/editor-content`, { method: "PUT", body: JSON.stringify(input) }),
  folderShareLinks: (organizationId: string, folderId: string) => apiRequest<DocumentShareLinkDto[]>(`/organizations/${organizationId}/folders/${folderId}/share-links`),
  createFolderShareLink: (organizationId: string, folderId: string, input: { expiresInHours: number; password?: string; permission: "READ" | "UPLOAD" }) => apiRequest<DocumentShareLinkDto>(`/organizations/${organizationId}/folders/${folderId}/share-links`, { method: "POST", body: JSON.stringify(input) }),
  revokeFolderShareLink: (organizationId: string, folderId: string, linkId: string) => apiRequest<void>(`/organizations/${organizationId}/folders/${folderId}/share-links/${linkId}`, { method: "DELETE" }),
  publish: (organizationId: string, documentId: string, note?: string) => apiRequest<DocumentDetailResponse>(`/organizations/${organizationId}/documents/${documentId}/publish`, { method: "POST", body: JSON.stringify({ note }) }),
  approvePublication: (organizationId: string, documentId: string, note?: string) => apiRequest<DocumentDetailResponse>(`/organizations/${organizationId}/documents/${documentId}/approve`, { method: "POST", body: JSON.stringify({ note }) }),
  rejectPublication: (organizationId: string, documentId: string, note?: string) => apiRequest<DocumentDetailResponse>(`/organizations/${organizationId}/documents/${documentId}/reject`, { method: "POST", body: JSON.stringify({ note }) }),
  setRecord: (organizationId: string, documentId: string, isRecord: boolean) => apiRequest<DocumentDetailResponse>(`/organizations/${organizationId}/documents/${documentId}/record`, { method: "POST", body: JSON.stringify({ isRecord }) }),
  setLegalHold: (organizationId: string, documentId: string, legalHold: boolean, reason?: string) => apiRequest<DocumentDetailResponse>(`/organizations/${organizationId}/documents/${documentId}/legal-hold`, { method: "POST", body: JSON.stringify({ legalHold, reason }) }),
  delta: (organizationId: string, cursor?: string) => apiRequest<DeltaFeedResponse>(`/organizations/${organizationId}/documents/delta${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`)
};

export const automationApi = {
  resources: (organizationId: string) => apiRequest<AutomationResourcesResponse>(`/organizations/${organizationId}/automation-resources`),
  listTriggers: (organizationId: string) => apiRequest<WorkflowTriggersResponse>(`/organizations/${organizationId}/workflow-triggers`),
  createTrigger: (organizationId: string, input: { workflowDefinitionId: string; event: string; scopeType?: WorkflowTriggerScope; scopeId?: string | null; enabled?: boolean }) =>
    apiRequest<WorkflowTriggerDto>(`/organizations/${organizationId}/workflow-triggers`, { method: "POST", body: JSON.stringify(input) }),
  updateTrigger: (organizationId: string, triggerId: string, input: { event?: string; scopeType?: WorkflowTriggerScope; scopeId?: string | null; enabled?: boolean }) =>
    apiRequest<WorkflowTriggerDto>(`/organizations/${organizationId}/workflow-triggers/${triggerId}`, { method: "PATCH", body: JSON.stringify(input) }),
  deleteTrigger: (organizationId: string, triggerId: string) => apiRequest<void>(`/organizations/${organizationId}/workflow-triggers/${triggerId}`, { method: "DELETE" }),
  listQuickActions: (organizationId: string, query: { targetType?: "document" | "folder"; folderId?: string } = {}) => {
    const entries = Object.entries(query).filter(([, value]) => Boolean(value)).map(([key, value]) => [key, String(value)] as [string, string]);
    return apiRequest<QuickActionsResponse>(`/organizations/${organizationId}/quick-actions?${new URLSearchParams(entries)}`);
  },
  createQuickAction: (organizationId: string, input: { name: string; targetType?: "document" | "folder"; workflowDefinitionId: string; scopeId?: string | null }) =>
    apiRequest<QuickActionDto>(`/organizations/${organizationId}/quick-actions`, { method: "POST", body: JSON.stringify(input) }),
  deleteQuickAction: (organizationId: string, actionId: string) => apiRequest<void>(`/organizations/${organizationId}/quick-actions/${actionId}`, { method: "DELETE" }),
  runQuickAction: (organizationId: string, actionId: string, targetId: string) =>
    apiRequest<WorkflowInstanceDto>(`/organizations/${organizationId}/quick-actions/${actionId}/run`, { method: "POST", body: JSON.stringify({ targetId }) })
};

export const announcementsApi = {
  list: (organizationId: string, all = false) => apiRequest<AnnouncementsResponse>(`/organizations/${organizationId}/announcements${all ? "?all=true" : ""}`),
  create: (organizationId: string, input: { title: string; body: string; audience?: string; publishAt?: string; expiresAt?: string | null }) =>
    apiRequest<AnnouncementDto>(`/organizations/${organizationId}/announcements`, { method: "POST", body: JSON.stringify(input) }),
  update: (organizationId: string, announcementId: string, input: { title?: string; body?: string; audience?: string; publishAt?: string; expiresAt?: string | null }) =>
    apiRequest<AnnouncementDto>(`/organizations/${organizationId}/announcements/${announcementId}`, { method: "PATCH", body: JSON.stringify(input) }),
  remove: (organizationId: string, announcementId: string) => apiRequest<void>(`/organizations/${organizationId}/announcements/${announcementId}`, { method: "DELETE" })
};

export const contactRequestsApi = {
  list: (filters: { search?: string; page?: number; pageSize?: number } = {}) => {
    const entries: [string, string][] = [];
    if (filters.search) entries.push(["search", filters.search]);
    if (filters.page) entries.push(["page", String(filters.page)]);
    if (filters.pageSize) entries.push(["pageSize", String(filters.pageSize)]);
    const qs = entries.length ? `?${new URLSearchParams(entries)}` : "";
    return apiRequest<ContactRequestsResponse>(`/platform/contact-requests${qs}`);
  },
  remove: (requestId: string) =>
    apiRequest<void>(`/platform/contact-requests/${requestId}`, { method: "DELETE" })
};

export const platformOrganizationsApi = {
  list: (filters: { search?: string; page?: number; pageSize?: number } = {}) => {
    const entries: [string, string][] = [];
    if (filters.search) entries.push(["search", filters.search]);
    if (filters.page) entries.push(["page", String(filters.page)]);
    if (filters.pageSize) entries.push(["pageSize", String(filters.pageSize)]);
    const qs = entries.length ? `?${new URLSearchParams(entries)}` : "";
    return apiRequest<PlatformOrganizationsResponse>(`/platform/organizations${qs}`);
  },
  remove: (organizationId: string) =>
    apiRequest<void>(`/platform/organizations/${organizationId}`, { method: "DELETE" })
};

export const governanceApi = {
  report: (organizationId: string, inactiveDays?: number) => apiRequest<GovernanceReportDto>(`/organizations/${organizationId}/governance/report${inactiveDays ? `?inactiveDays=${inactiveDays}` : ""}`),
  accessReview: (organizationId: string, kind: "document" | "folder", id: string) => apiRequest<AccessReviewResponse>(`/organizations/${organizationId}/access-review/${kind}/${id}`)
};

export const accessApi = {
  panel: (organizationId: string, kind: "document" | "folder", id: string) =>
    apiRequest<AccessPanelResponse>(`/organizations/${organizationId}/documents/access/${kind}/${id}`),
  setInherit: (organizationId: string, kind: "document" | "folder", id: string, inherit: boolean) =>
    apiRequest<AccessPanelResponse>(`/organizations/${organizationId}/documents/access/${kind}/${id}/inherit`, { method: "POST", body: JSON.stringify({ inherit }) }),
  request: (organizationId: string, input: RequestAccessInput) =>
    apiRequest<AccessRequestDto>(`/organizations/${organizationId}/access-requests`, { method: "POST", body: JSON.stringify(input) }),
  listRequests: (organizationId: string, status?: AccessRequestStatus) =>
    apiRequest<AccessRequestsResponse>(`/organizations/${organizationId}/access-requests${status ? `?status=${encodeURIComponent(status)}` : ""}`),
  decide: (organizationId: string, requestId: string, input: DecideAccessInput) =>
    apiRequest<AccessRequestDto>(`/organizations/${organizationId}/access-requests/${requestId}/decide`, { method: "POST", body: JSON.stringify(input) })
};

export const webhooksApi = {
  list: (organizationId: string) =>
    apiRequest<WebhooksResponse>(`/organizations/${organizationId}/webhooks`),
  create: (organizationId: string, input: CreateWebhookInput) =>
    apiRequest<CreateWebhookResponse>(`/organizations/${organizationId}/webhooks`, { method: "POST", body: JSON.stringify(input) }),
  update: (organizationId: string, webhookId: string, input: UpdateWebhookInput) =>
    apiRequest<WebhookDto>(`/organizations/${organizationId}/webhooks/${webhookId}`, { method: "PATCH", body: JSON.stringify(input) }),
  remove: (organizationId: string, webhookId: string) =>
    apiRequest<void>(`/organizations/${organizationId}/webhooks/${webhookId}`, { method: "DELETE" }),
  deliveries: (organizationId: string, webhookId: string) =>
    apiRequest<WebhookDeliveriesResponse>(`/organizations/${organizationId}/webhooks/${webhookId}/deliveries`),
  test: (organizationId: string, webhookId: string) =>
    apiRequest<WebhookDeliveryDto>(`/organizations/${organizationId}/webhooks/${webhookId}/test`, { method: "POST" })
};

export const publicShareApi = {
  get: (token: string, password?: string) => apiRequest<PublicDocumentShareDto>(`/shares/${encodeURIComponent(token)}`, { headers: password ? { "x-share-password": password } : undefined }, false),
  download: (token: string, password?: string) => downloadFile(`/shares/${encodeURIComponent(token)}/download`, false, password ? { "x-share-password": password } : undefined),
  uploadVersion: (token: string, file: File, password?: string) => {
    const form = new FormData();
    form.append("file", file);
    return apiRequest<DocumentDetailResponse>(`/shares/${encodeURIComponent(token)}/versions`, { method: "POST", headers: password ? { "x-share-password": password } : undefined, body: form }, false);
  },
  browse: (token: string, folderId?: string, password?: string) => apiRequest<PublicShareFolderContentsDto>(`/shares/${encodeURIComponent(token)}/browse${folderId ? `/${encodeURIComponent(folderId)}` : ""}`, { headers: password ? { "x-share-password": password } : undefined }, false),
  downloadFile: (token: string, documentId: string, password?: string) => downloadFile(`/shares/${encodeURIComponent(token)}/files/${encodeURIComponent(documentId)}/download`, false, password ? { "x-share-password": password } : undefined),
  uploadFile: (token: string, file: File, password?: string) => {
    const form = new FormData();
    form.append("file", file);
    return apiRequest<DocumentDetailResponse>(`/shares/${encodeURIComponent(token)}/uploads`, { method: "POST", headers: password ? { "x-share-password": password } : undefined, body: form }, false);
  }
};

export type ListFieldInput = Omit<ListFieldDto, "id"> & { id?: string };

export const listsApi = {
  list: (organizationId: string, query: { search?: string; sort?: string; order?: string }) => {
    const params = new URLSearchParams(Object.entries(query).filter((entry): entry is [string, string] => Boolean(entry[1])));
    return apiRequest<ListsResponse>(`/organizations/${organizationId}/lists?${params}`);
  },
  get: (organizationId: string, listId: string) => apiRequest<ListDefinitionDto>(`/organizations/${organizationId}/lists/${listId}`),
  create: (organizationId: string, input: { name: string; description?: string | null; icon?: string | null; fields: ListFieldInput[] }) =>
    apiRequest<ListDefinitionDto>(`/organizations/${organizationId}/lists`, { method: "POST", body: JSON.stringify(input) }),
  update: (organizationId: string, listId: string, input: { name?: string; description?: string | null; icon?: string | null; fields?: ListFieldInput[] }) =>
    apiRequest<ListDefinitionDto>(`/organizations/${organizationId}/lists/${listId}`, { method: "PATCH", body: JSON.stringify(input) }),
  duplicate: (organizationId: string, listId: string, name?: string) =>
    apiRequest<ListDefinitionDto>(`/organizations/${organizationId}/lists/${listId}/duplicate`, { method: "POST", body: JSON.stringify({ name }) }),
  remove: (organizationId: string, listId: string) =>
    apiRequest<void>(`/organizations/${organizationId}/lists/${listId}`, { method: "DELETE" }),
  items: (organizationId: string, listId: string, query: { search?: string; sort?: string; order?: string; page?: number; pageSize?: number }) => {
    const entries = Object.entries(query).filter(([, value]) => Boolean(value)).map(([key, value]) => [key, String(value)] as [string, string]);
    const params = new URLSearchParams(entries);
    return apiRequest<ListItemsResponse>(`/organizations/${organizationId}/lists/${listId}/items?${params}`);
  },
  createItem: (organizationId: string, listId: string, values: Record<string, unknown>) =>
    apiRequest<ListItemDto>(`/organizations/${organizationId}/lists/${listId}/items`, { method: "POST", body: JSON.stringify({ values }) }),
  updateItem: (organizationId: string, listId: string, itemId: string, values: Record<string, unknown>) =>
    apiRequest<ListItemDto>(`/organizations/${organizationId}/lists/${listId}/items/${itemId}`, { method: "PATCH", body: JSON.stringify({ values }) }),
  removeItem: (organizationId: string, listId: string, itemId: string) =>
    apiRequest<void>(`/organizations/${organizationId}/lists/${listId}/items/${itemId}`, { method: "DELETE" }),
  removeItems: (organizationId: string, listId: string, itemIds: string[]) =>
    apiRequest<void>(`/organizations/${organizationId}/lists/${listId}/items/delete-batch`, { method: "POST", body: JSON.stringify({ itemIds }) }),
  exportCsv: (organizationId: string, listId: string) =>
    downloadFile(`/organizations/${organizationId}/lists/${listId}/export.csv`)
};

export type FormFieldInput = {
  id: string;
  type: import("@nexora/contracts").FormFieldType;
  label: string;
  required: boolean;
  placeholder?: string;
  defaultValue?: unknown;
  options?: import("@nexora/contracts").FormFieldOption[] | null;
  order: number;
};

export const formsApi = {
  list: (organizationId: string, query: { search?: string; status?: FormStatus; sort?: string; order?: string }) => {
    const params = new URLSearchParams(Object.entries(query).filter((entry): entry is [string, string] => Boolean(entry[1])));
    return apiRequest<FormsResponse>(`/organizations/${organizationId}/forms?${params}`);
  },
  get: (organizationId: string, formId: string) => apiRequest<FormDefinitionDto>(`/organizations/${organizationId}/forms/${formId}`),
  create: (organizationId: string, input: { name: string; description?: string | null; fields: FormFieldInput[] }) =>
    apiRequest<FormDefinitionDto>(`/organizations/${organizationId}/forms`, { method: "POST", body: JSON.stringify(input) }),
  update: (organizationId: string, formId: string, input: { name?: string; description?: string | null; fields?: FormFieldInput[]; status?: FormStatus }) =>
    apiRequest<FormDefinitionDto>(`/organizations/${organizationId}/forms/${formId}`, { method: "PATCH", body: JSON.stringify(input) }),
  duplicate: (organizationId: string, formId: string, name?: string) =>
    apiRequest<FormDefinitionDto>(`/organizations/${organizationId}/forms/${formId}/duplicate`, { method: "POST", body: JSON.stringify({ name }) }),
  remove: (organizationId: string, formId: string) =>
    apiRequest<void>(`/organizations/${organizationId}/forms/${formId}`, { method: "DELETE" }),
  submissions: (organizationId: string, formId: string, query: { page?: number; pageSize?: number }) => {
    const entries = Object.entries(query).filter(([, value]) => Boolean(value)).map(([key, value]) => [key, String(value)] as [string, string]);
    const params = new URLSearchParams(entries);
    return apiRequest<FormSubmissionsResponse>(`/organizations/${organizationId}/forms/${formId}/submissions?${params}`);
  },
  submit: (organizationId: string, formId: string, values: Record<string, unknown>) =>
    apiRequest<FormSubmissionDto>(`/organizations/${organizationId}/forms/${formId}/submissions`, { method: "POST", body: JSON.stringify({ values }) }),
  exportSubmissions: (organizationId: string, formId: string) =>
    downloadFile(`/organizations/${organizationId}/forms/${formId}/submissions/export.csv`)
};

export type TaskInput = {
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  startAt?: string | null;
  dueAt?: string | null;
  tags?: string[];
  assignedMembershipId?: string | null;
  assignedTeamId?: string | null;
  projectId?: string | null;
  documentId?: string | null;
};

export const tasksApi = {
  list: (organizationId: string, query: { search?: string; status?: TaskStatus; priority?: TaskPriority; scope?: "all" | "mine"; assignedMembershipId?: string; projectId?: string; tag?: string; sort?: string; order?: string }) => {
    const entries = Object.entries(query).filter(([, value]) => Boolean(value)).map(([key, value]) => [key, String(value)] as [string, string]);
    const params = new URLSearchParams(entries);
    return apiRequest<TasksResponse>(`/organizations/${organizationId}/tasks?${params}`);
  },
  get: (organizationId: string, taskId: string) => apiRequest<TaskDto>(`/organizations/${organizationId}/tasks/${taskId}`),
  create: (organizationId: string, input: TaskInput) =>
    apiRequest<TaskDto>(`/organizations/${organizationId}/tasks`, { method: "POST", body: JSON.stringify(input) }),
  update: (organizationId: string, taskId: string, input: Partial<TaskInput>) =>
    apiRequest<TaskDto>(`/organizations/${organizationId}/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify(input) }),
  remove: (organizationId: string, taskId: string) =>
    apiRequest<void>(`/organizations/${organizationId}/tasks/${taskId}`, { method: "DELETE" }),
  comments: (organizationId: string, taskId: string) =>
    apiRequest<TaskCommentDto[]>(`/organizations/${organizationId}/tasks/${taskId}/comments`),
  addComment: (organizationId: string, taskId: string, body: string) =>
    apiRequest<TaskCommentDto>(`/organizations/${organizationId}/tasks/${taskId}/comments`, { method: "POST", body: JSON.stringify({ body }) }),
  removeComment: (organizationId: string, taskId: string, commentId: string) =>
    apiRequest<void>(`/organizations/${organizationId}/tasks/${taskId}/comments/${commentId}`, { method: "DELETE" })
};

export const projectsApi = {
  list: (organizationId: string) => apiRequest<ProjectsResponse>(`/organizations/${organizationId}/projects`),
  create: (organizationId: string, input: { name: string; description?: string; color?: string }) =>
    apiRequest<ProjectDto>(`/organizations/${organizationId}/projects`, { method: "POST", body: JSON.stringify(input) }),
  update: (organizationId: string, projectId: string, input: { name?: string; description?: string; color?: string }) =>
    apiRequest<ProjectDto>(`/organizations/${organizationId}/projects/${projectId}`, { method: "PATCH", body: JSON.stringify(input) }),
  remove: (organizationId: string, projectId: string) =>
    apiRequest<void>(`/organizations/${organizationId}/projects/${projectId}`, { method: "DELETE" })
};

export type WorkflowStepInput = { id?: string; order: number; type: WorkflowStepType; name: string; config: Record<string, unknown> };
export type WorkflowInput = { name: string; description?: string | null; steps?: WorkflowStepInput[] };

export const workflowsApi = {
  list: (organizationId: string, query: { search?: string; status?: WorkflowStatus }) => {
    const entries = Object.entries(query).filter(([, value]) => Boolean(value)).map(([key, value]) => [key, String(value)] as [string, string]);
    return apiRequest<WorkflowsResponse>(`/organizations/${organizationId}/workflows?${new URLSearchParams(entries)}`);
  },
  get: (organizationId: string, workflowId: string) => apiRequest<WorkflowDefinitionDto>(`/organizations/${organizationId}/workflows/${workflowId}`),
  create: (organizationId: string, input: WorkflowInput) =>
    apiRequest<WorkflowDefinitionDto>(`/organizations/${organizationId}/workflows`, { method: "POST", body: JSON.stringify(input) }),
  update: (organizationId: string, workflowId: string, input: Partial<WorkflowInput>) =>
    apiRequest<WorkflowDefinitionDto>(`/organizations/${organizationId}/workflows/${workflowId}`, { method: "PATCH", body: JSON.stringify(input) }),
  remove: (organizationId: string, workflowId: string) =>
    apiRequest<void>(`/organizations/${organizationId}/workflows/${workflowId}`, { method: "DELETE" }),
  publish: (organizationId: string, workflowId: string) =>
    apiRequest<WorkflowDefinitionDto>(`/organizations/${organizationId}/workflows/${workflowId}/publish`, { method: "POST" }),
  archive: (organizationId: string, workflowId: string) =>
    apiRequest<WorkflowDefinitionDto>(`/organizations/${organizationId}/workflows/${workflowId}/archive`, { method: "POST" }),
  unpublish: (organizationId: string, workflowId: string) =>
    apiRequest<WorkflowDefinitionDto>(`/organizations/${organizationId}/workflows/${workflowId}/unpublish`, { method: "POST" }),
  start: (organizationId: string, workflowId: string, input: Record<string, unknown>) =>
    apiRequest<WorkflowInstanceDto>(`/organizations/${organizationId}/workflows/${workflowId}/start`, { method: "POST", body: JSON.stringify({ input }) }),
  instances: (organizationId: string, query: { status?: WorkflowInstanceStatus; workflowDefinitionId?: string }) => {
    const entries = Object.entries(query).filter(([, value]) => Boolean(value)).map(([key, value]) => [key, String(value)] as [string, string]);
    return apiRequest<WorkflowInstancesResponse>(`/organizations/${organizationId}/workflow-instances?${new URLSearchParams(entries)}`);
  },
  instance: (organizationId: string, instanceId: string) =>
    apiRequest<WorkflowInstanceDto>(`/organizations/${organizationId}/workflow-instances/${instanceId}`),
  cancelInstance: (organizationId: string, instanceId: string) =>
    apiRequest<WorkflowInstanceDto>(`/organizations/${organizationId}/workflow-instances/${instanceId}/cancel`, { method: "POST" }),
  decideApproval: (organizationId: string, approvalId: string, decision: "APPROVED" | "REJECTED", note?: string) =>
    apiRequest<WorkflowInstanceDto>(`/organizations/${organizationId}/approvals/${approvalId}/decide`, { method: "POST", body: JSON.stringify({ decision, note }) })
};

export const approvalsApi = {
  list: (organizationId: string, query: { status?: ApprovalStatus; scope?: "mine" | "all" }) => {
    const entries = Object.entries(query).filter(([, value]) => Boolean(value)).map(([key, value]) => [key, String(value)] as [string, string]);
    return apiRequest<ApprovalsResponse>(`/organizations/${organizationId}/approvals?${new URLSearchParams(entries)}`);
  },
  get: (organizationId: string, approvalId: string) => apiRequest<ApprovalDetailDto>(`/organizations/${organizationId}/approvals/${approvalId}`),
  addComment: (organizationId: string, approvalId: string, body: string) =>
    apiRequest<{ id: string; author: { id: string; name: string }; body: string; createdAt: string }>(`/organizations/${organizationId}/approvals/${approvalId}/comments`, { method: "POST", body: JSON.stringify({ body }) }),
  delegate: (organizationId: string, approvalId: string, toMemberId: string, reason?: string) =>
    apiRequest<ApprovalDetailDto>(`/organizations/${organizationId}/approvals/${approvalId}/delegate`, { method: "POST", body: JSON.stringify({ toMemberId, reason }) })
};

export const notificationsApi = {
  list: (organizationId: string, query: { unreadOnly?: boolean; type?: string }) => {
    const entries = Object.entries(query).filter(([, value]) => value !== undefined && value !== "").map(([key, value]) => [key, String(value)] as [string, string]);
    return apiRequest<NotificationsResponse>(`/organizations/${organizationId}/notifications?${new URLSearchParams(entries)}`);
  },
  unreadCount: (organizationId: string) => apiRequest<UnreadCountResponse>(`/organizations/${organizationId}/notifications/unread-count`),
  markAsRead: (organizationId: string, notificationId: string) =>
    apiRequest<void>(`/organizations/${organizationId}/notifications/${notificationId}/read`, { method: "POST" }),
  markAllAsRead: (organizationId: string) => apiRequest<void>(`/organizations/${organizationId}/notifications/read-all`, { method: "POST" })
};

export const searchApi = {
  search: (organizationId: string, query: string, filters: SearchFilters = {}) => {
    const entries: [string, string][] = [["q", query]];
    if (filters.types?.length) entries.push(["types", filters.types.join(",")]);
    if (filters.createdAfter) entries.push(["createdAfter", filters.createdAfter]);
    if (filters.createdBefore) entries.push(["createdBefore", filters.createdBefore]);
    if (filters.createdBy) entries.push(["createdBy", filters.createdBy]);
    if (filters.teamId) entries.push(["teamId", filters.teamId]);
    if (filters.status) entries.push(["status", filters.status]);
    if (filters.mimeType) entries.push(["mimeType", filters.mimeType]);
    if (filters.sensitivity) entries.push(["sensitivity", filters.sensitivity]);
    if (filters.publishStatus) entries.push(["publishStatus", filters.publishStatus]);
    if (filters.meta) entries.push(["meta", filters.meta]);
    return apiRequest<SearchResponse>(`/organizations/${organizationId}/search?${new URLSearchParams(entries)}`);
  }
};

export const auditApi = {
  list: (organizationId: string, filters: AuditLogFilters = {}) => {
    const entries: [string, string][] = [];
    if (filters.action) entries.push(["action", filters.action]);
    if (filters.resourceType) entries.push(["resourceType", filters.resourceType]);
    if (filters.actorId) entries.push(["actorId", filters.actorId]);
    if (filters.result) entries.push(["result", filters.result]);
    if (filters.after) entries.push(["after", filters.after]);
    if (filters.before) entries.push(["before", filters.before]);
    if (filters.search) entries.push(["search", filters.search]);
    if (filters.page) entries.push(["page", String(filters.page)]);
    if (filters.pageSize) entries.push(["pageSize", String(filters.pageSize)]);
    return apiRequest<AuditLogListResponse>(`/organizations/${organizationId}/audit?${new URLSearchParams(entries)}`);
  }
};

export const settingsApi = {
  get: (organizationId: string) => apiRequest<OrganizationSettingsDto>(`/organizations/${organizationId}/settings`),
  update: (organizationId: string, input: UpdateOrganizationSettingsDto) =>
    apiRequest<OrganizationSettingsDto>(`/organizations/${organizationId}/settings`, { method: "PATCH", body: JSON.stringify(input) })
};

export const teamsApi = {
  list: (organizationId: string) => apiRequest<TeamDto[]>(`/organizations/${organizationId}/teams`),
  get: (organizationId: string, teamId: string) => apiRequest<TeamDetailDto>(`/organizations/${organizationId}/teams/${teamId}`),
  create: (organizationId: string, input: CreateTeamDto) =>
    apiRequest<TeamDto>(`/organizations/${organizationId}/teams`, { method: "POST", body: JSON.stringify(input) }),
  update: (organizationId: string, teamId: string, input: UpdateTeamDto) =>
    apiRequest<TeamDto>(`/organizations/${organizationId}/teams/${teamId}`, { method: "PATCH", body: JSON.stringify(input) }),
  delete: (organizationId: string, teamId: string) =>
    apiRequest<void>(`/organizations/${organizationId}/teams/${teamId}`, { method: "DELETE" }),
  addMember: (organizationId: string, teamId: string, membershipId: string) =>
    apiRequest<void>(`/organizations/${organizationId}/teams/${teamId}/members`, { method: "POST", body: JSON.stringify({ membershipId }) }),
  removeMember: (organizationId: string, teamId: string, membershipId: string) =>
    apiRequest<void>(`/organizations/${organizationId}/teams/${teamId}/members/${membershipId}`, { method: "DELETE" })
};

export const rolesApi = {
  list: (organizationId: string) => apiRequest<RoleDto[]>(`/organizations/${organizationId}/roles`),
  listPermissions: (organizationId: string) => apiRequest<PermissionDto[]>(`/organizations/${organizationId}/permissions`),
  create: (organizationId: string, input: CreateRoleDto) =>
    apiRequest<RoleDto>(`/organizations/${organizationId}/roles`, { method: "POST", body: JSON.stringify(input) }),
  update: (organizationId: string, roleId: string, input: UpdateRoleDto) =>
    apiRequest<RoleDto>(`/organizations/${organizationId}/roles/${roleId}`, { method: "PATCH", body: JSON.stringify(input) }),
  delete: (organizationId: string, roleId: string) =>
    apiRequest<void>(`/organizations/${organizationId}/roles/${roleId}`, { method: "DELETE" })
};

export const aiApi = {
  chat: (organizationId: string, message: string, conversationId?: string) =>
    apiRequest<AIChatResponse>(`/organizations/${organizationId}/ai/chat`, { method: "POST", body: JSON.stringify({ message, conversationId }) }),
  listConversations: (organizationId: string) =>
    apiRequest<{ id: string; title: string; createdAt: string; updatedAt: string }[]>(`/organizations/${organizationId}/ai/conversations`),
  getConversation: (organizationId: string, conversationId: string) =>
    apiRequest<AIConversationDto>(`/organizations/${organizationId}/ai/conversations/${conversationId}`),
  summarizeDocument: (organizationId: string, documentId: string) =>
    apiRequest<AIDocumentSummaryResponse>(`/organizations/${organizationId}/ai/documents/${documentId}/summarize`, { method: "POST" }),
  qaDocument: (organizationId: string, documentId: string, question: string) =>
    apiRequest<{ answer: string; usage: { tokensUsed: number; costUsd: number } }>(`/organizations/${organizationId}/ai/documents/${documentId}/qa`, { method: "POST", body: JSON.stringify({ question }) }),
  classifyDocument: (organizationId: string, documentId: string) =>
    apiRequest<{ classification: string; keywords: string[]; usage: { tokensUsed: number; costUsd: number } }>(`/organizations/${organizationId}/ai/documents/${documentId}/classify`, { method: "POST" }),
  contextual: (organizationId: string, input: { resourceType: AIContextResourceType; resourceId: string; prompt: string }) =>
    apiRequest<AIContextualResponse>(`/organizations/${organizationId}/ai/contextual`, { method: "POST", body: JSON.stringify(input) }),
  proposeList: (organizationId: string, description: string) =>
    apiRequest<AIActionProposal>(`/organizations/${organizationId}/ai/propose-list`, { method: "POST", body: JSON.stringify({ description }) }),
  proposeWorkflow: (organizationId: string, description: string) =>
    apiRequest<AIActionProposal>(`/organizations/${organizationId}/ai/propose-workflow`, { method: "POST", body: JSON.stringify({ description }) }),
  proposeApp: (organizationId: string, description: string) =>
    apiRequest<AIScaffoldProposal>(`/organizations/${organizationId}/ai/propose-app`, { method: "POST", body: JSON.stringify({ description }) }),
  applyScaffold: (organizationId: string, input: AIScaffoldApplyInput) =>
    apiRequest<AIScaffoldApplyResponse>(`/organizations/${organizationId}/ai/scaffold/apply`, { method: "POST", body: JSON.stringify(input) }),
  report: (organizationId: string, prompt: string) =>
    apiRequest<AIReportResponse>(`/organizations/${organizationId}/ai/report`, { method: "POST", body: JSON.stringify({ prompt }) }),
  usage: (organizationId: string) =>
    apiRequest<{ today: { requests: number; tokensInput: number; tokensOutput: number; costUsd: number }; total: { requests: number; tokensInput: number; tokensOutput: number; costUsd: number } }>(`/organizations/${organizationId}/ai/usage`)
};

export const billingApi = {
  listPlans: () => apiRequest<PlanDto[]>("/plans"),
  getSubscription: (organizationId: string) => apiRequest<SubscriptionDto | null>(`/organizations/${organizationId}/subscription`),
  getUsage: (organizationId: string) => apiRequest<UsageStats>(`/organizations/${organizationId}/usage`),
  changePlan: (organizationId: string, planCode: string, billingCycle: "MONTHLY" | "ANNUAL") =>
    apiRequest<ChangePlanResponse>(`/organizations/${organizationId}/subscription`, { method: "POST", body: JSON.stringify({ planCode, billingCycle }) }),
  createPortalSession: (organizationId: string) =>
    apiRequest<{ portalUrl: string }>(`/organizations/${organizationId}/billing-portal`, { method: "POST" }),
  cancelSubscription: (organizationId: string) =>
    apiRequest<void>(`/organizations/${organizationId}/subscription`, { method: "DELETE" })
};

export const viewsApi = {
  list: (organizationId: string, query: { resourceType: SavedViewResourceType; resourceId?: string | null }) => {
    const entries: [string, string][] = [["resourceType", query.resourceType]];
    if (query.resourceId) entries.push(["resourceId", query.resourceId]);
    return apiRequest<SavedViewsResponse>(`/organizations/${organizationId}/views?${new URLSearchParams(entries)}`);
  },
  create: (organizationId: string, input: CreateSavedViewInput) =>
    apiRequest<SavedViewDto>(`/organizations/${organizationId}/views`, { method: "POST", body: JSON.stringify(input) }),
  update: (organizationId: string, viewId: string, input: UpdateSavedViewInput) =>
    apiRequest<SavedViewDto>(`/organizations/${organizationId}/views/${viewId}`, { method: "PATCH", body: JSON.stringify(input) }),
  remove: (organizationId: string, viewId: string) =>
    apiRequest<void>(`/organizations/${organizationId}/views/${viewId}`, { method: "DELETE" })
};

export const subscriptionsApi = {
  subscribe: (organizationId: string, input: SubscribeInput) =>
    apiRequest<ResourceSubscriptionDto>(`/organizations/${organizationId}/subscriptions`, { method: "POST", body: JSON.stringify(input) }),
  unsubscribe: (organizationId: string, input: UnsubscribeInput) =>
    apiRequest<void>(`/organizations/${organizationId}/subscriptions`, { method: "DELETE", body: JSON.stringify(input) }),
  mine: (organizationId: string) =>
    apiRequest<SubscriptionsResponse>(`/organizations/${organizationId}/subscriptions/mine`),
  check: (organizationId: string, targetType: SubscriptionTargetType, targetId: string) =>
    apiRequest<SubscriptionCheckResponse>(`/organizations/${organizationId}/subscriptions/check?${new URLSearchParams({ targetType, targetId })}`)
};

export const templatesApi = {
  list: (organizationId: string) =>
    apiRequest<TemplatesResponse>(`/organizations/${organizationId}/documents/templates`),
  setDocumentTemplate: (organizationId: string, documentId: string, isTemplate: boolean) =>
    apiRequest<DocumentDetailResponse>(`/organizations/${organizationId}/documents/${documentId}/template`, { method: "POST", body: JSON.stringify({ isTemplate }) }),
  setFolderTemplate: (organizationId: string, folderId: string, isTemplate: boolean) =>
    apiRequest<FolderItemDto>(`/organizations/${organizationId}/folders/${folderId}/template`, { method: "POST", body: JSON.stringify({ isTemplate }) }),
  instantiateDocument: (organizationId: string, documentId: string, input: { folderId?: string | null; name?: string }) =>
    apiRequest<DocumentDetailResponse>(`/organizations/${organizationId}/documents/templates/${documentId}/instantiate`, { method: "POST", body: JSON.stringify(input) }),
  instantiateFolder: (organizationId: string, folderId: string, input: { parentId?: string | null; name?: string }) =>
    apiRequest<FolderItemDto>(`/organizations/${organizationId}/folders/templates/${folderId}/instantiate`, { method: "POST", body: JSON.stringify(input) })
};

export const dashboardsApi = {
  list: (organizationId: string) =>
    apiRequest<DashboardsResponse>(`/organizations/${organizationId}/dashboards`),
  create: (organizationId: string, input: CreateDashboardInput) =>
    apiRequest<DashboardDto>(`/organizations/${organizationId}/dashboards`, { method: "POST", body: JSON.stringify(input) }),
  update: (organizationId: string, dashboardId: string, input: UpdateDashboardInput) =>
    apiRequest<DashboardDto>(`/organizations/${organizationId}/dashboards/${dashboardId}`, { method: "PATCH", body: JSON.stringify(input) }),
  remove: (organizationId: string, dashboardId: string) =>
    apiRequest<void>(`/organizations/${organizationId}/dashboards/${dashboardId}`, { method: "DELETE" }),
  addWidget: (organizationId: string, dashboardId: string, input: CreateWidgetInput) =>
    apiRequest<DashboardWidgetDto>(`/organizations/${organizationId}/dashboards/${dashboardId}/widgets`, { method: "POST", body: JSON.stringify(input) }),
  updateWidget: (organizationId: string, dashboardId: string, widgetId: string, input: UpdateWidgetInput) =>
    apiRequest<DashboardWidgetDto>(`/organizations/${organizationId}/dashboards/${dashboardId}/widgets/${widgetId}`, { method: "PATCH", body: JSON.stringify(input) }),
  removeWidget: (organizationId: string, dashboardId: string, widgetId: string) =>
    apiRequest<void>(`/organizations/${organizationId}/dashboards/${dashboardId}/widgets/${widgetId}`, { method: "DELETE" }),
  render: (organizationId: string, dashboardId: string) =>
    apiRequest<RenderedDashboardResponse>(`/organizations/${organizationId}/dashboards/${dashboardId}/render`)
};

export const sitesApi = {
  list: (organizationId: string) =>
    apiRequest<SitesResponse>(`/organizations/${organizationId}/sites`),
  create: (organizationId: string, input: CreateSiteInput) =>
    apiRequest<SiteDto>(`/organizations/${organizationId}/sites`, { method: "POST", body: JSON.stringify(input) }),
  get: (organizationId: string, siteId: string) =>
    apiRequest<SiteDetailResponse>(`/organizations/${organizationId}/sites/${siteId}`),
  update: (organizationId: string, siteId: string, input: UpdateSiteInput) =>
    apiRequest<SiteDto>(`/organizations/${organizationId}/sites/${siteId}`, { method: "PATCH", body: JSON.stringify(input) }),
  remove: (organizationId: string, siteId: string) =>
    apiRequest<void>(`/organizations/${organizationId}/sites/${siteId}`, { method: "DELETE" }),
  addMember: (organizationId: string, siteId: string, membershipId: string, role: SiteRole) =>
    apiRequest<SiteMemberDto>(`/organizations/${organizationId}/sites/${siteId}/members`, { method: "POST", body: JSON.stringify({ membershipId, role }) }),
  updateMember: (organizationId: string, siteId: string, membershipId: string, role: SiteRole) =>
    apiRequest<SiteMemberDto>(`/organizations/${organizationId}/sites/${siteId}/members/${membershipId}`, { method: "PATCH", body: JSON.stringify({ role }) }),
  removeMember: (organizationId: string, siteId: string, membershipId: string) =>
    apiRequest<void>(`/organizations/${organizationId}/sites/${siteId}/members/${membershipId}`, { method: "DELETE" }),
  listPages: (organizationId: string, siteId: string) =>
    apiRequest<SitePagesResponse>(`/organizations/${organizationId}/sites/${siteId}/pages`),
  createPage: (organizationId: string, siteId: string, input: UpsertSitePageInput) =>
    apiRequest<SitePageResponse>(`/organizations/${organizationId}/sites/${siteId}/pages`, { method: "POST", body: JSON.stringify(input) }),
  getPage: (organizationId: string, pageId: string) =>
    apiRequest<SitePageResponse>(`/organizations/${organizationId}/pages/${pageId}`),
  updatePage: (organizationId: string, pageId: string, input: Partial<UpsertSitePageInput>) =>
    apiRequest<SitePageResponse>(`/organizations/${organizationId}/pages/${pageId}`, { method: "PATCH", body: JSON.stringify(input) }),
  deletePage: (organizationId: string, pageId: string) =>
    apiRequest<void>(`/organizations/${organizationId}/pages/${pageId}`, { method: "DELETE" })
};

export const newsApi = {
  list: (organizationId: string, query?: { siteId?: string; status?: NewsStatus }) => {
    const params = new URLSearchParams();
    if (query?.siteId) params.set("siteId", query.siteId);
    if (query?.status) params.set("status", query.status);
    const suffix = params.toString() ? `?${params.toString()}` : "";
    return apiRequest<NewsListResponse>(`/organizations/${organizationId}/news${suffix}`);
  },
  get: (organizationId: string, postId: string) =>
    apiRequest<NewsDetailResponse>(`/organizations/${organizationId}/news/${postId}`),
  create: (organizationId: string, input: UpsertNewsInput) =>
    apiRequest<{ post: NewsPostDto }>(`/organizations/${organizationId}/news`, { method: "POST", body: JSON.stringify(input) }),
  update: (organizationId: string, postId: string, input: Partial<UpsertNewsInput>) =>
    apiRequest<{ post: NewsPostDto }>(`/organizations/${organizationId}/news/${postId}`, { method: "PATCH", body: JSON.stringify(input) }),
  remove: (organizationId: string, postId: string) =>
    apiRequest<void>(`/organizations/${organizationId}/news/${postId}`, { method: "DELETE" }),
  addComment: (organizationId: string, postId: string, body: string) =>
    apiRequest<NewsCommentDto>(`/organizations/${organizationId}/news/${postId}/comments`, { method: "POST", body: JSON.stringify({ body }) }),
  removeComment: (organizationId: string, postId: string, commentId: string) =>
    apiRequest<void>(`/organizations/${organizationId}/news/${postId}/comments/${commentId}`, { method: "DELETE" })
};

export const analyticsApi = {
  operational: (organizationId: string, days: AnalyticsPeriodDays) =>
    apiRequest<OperationalAnalyticsResponse>(`/organizations/${organizationId}/analytics/operational?days=${days}`)
};

export const collaborationApi = {
  members: (organizationId: string, q = "") => {
    const suffix = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
    return apiRequest<CollaborationMembersResponse>(`/organizations/${organizationId}/collaboration/members${suffix}`);
  }
};
