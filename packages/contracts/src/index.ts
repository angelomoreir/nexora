export type ServiceStatus = "operational" | "degraded";
export type UserStatus = "ACTIVE" | "SUSPENDED";
export type MemberStatus = "ACTIVE" | "SUSPENDED";
export type RoleName = "Super Admin" | "Admin" | "Manager" | "Editor" | "Member" | "Viewer";

export interface HealthResponse {
  service: "nexora-api";
  status: ServiceStatus;
  database: ServiceStatus;
  timestamp: string;
  version: string;
}

export interface UserDto {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
  jobTitle: string | null;
  status: UserStatus;
  isSuperAdmin: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
  status: string;
  memberStatus: MemberStatus;
  logoUrl: string | null;
  roles: RoleName[];
  permissions: string[];
}

export interface AuthSession {
  user: UserDto;
  organizations: OrganizationSummary[];
}

export interface InvitationDto {
  id: string;
  email: string;
  role: string;
  invitedByName: string;
  status: "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";
  expiresAt: string;
  createdAt: string;
}

export type ChangePlanResponse = SubscriptionDto | { checkoutUrl: string };

export interface SsoConfigDto {
  provider: string;
  issuerUrl: string;
  clientId: string;
  clientSecretSet: boolean;
  scopes: string;
  emailDomains: string[];
  isEnabled: boolean;
}

export type SsoLookupResponse =
  | { enabled: true; organizationId: string; organizationName: string }
  | { enabled: false };

export interface InvitationPreviewDto {
  organizationName: string;
  email: string;
  role: string;
  inviterName: string;
  expiresAt: string;
  accountExists: boolean;
}

export interface DashboardResponse {
  metrics: {
    documents: number;
    users: number;
    teams: number;
    pendingTasks: number;
    activeProcesses: number;
    pendingApprovals: number;
    storageBytes: number;
    tasks: number;
    lists: number;
    forms: number;
  };
  recentActivity: Array<{
    id: string;
    action: string;
    resourceType: string;
    resourceId: string | null;
    occurredAt: string;
    actor: { id: string; name: string; avatar: string | null } | null;
  }>;
  recentDocuments: Array<{
    id: string;
    name: string;
    status: string;
    updatedAt: string;
    folderName: string | null;
    latestVersion: { version: number; sizeBytes: number; mimeType: string } | null;
  }>;
  pendingTasks: Array<{
    id: string;
    title: string;
    status: string;
    priority: string;
    dueAt: string | null;
    updatedAt: string;
  }>;
  notifications: Array<{
    id: string;
    type: string;
    title: string;
    body: string;
    readAt: string | null;
    createdAt: string;
  }>;
  taskDistribution: Array<{ status: string; count: number }>;
  news: Array<{
    id: string;
    title: string;
    excerpt: string | null;
    category: string | null;
    featured: boolean;
    publishedAt: string | null;
    siteName: string | null;
    author: { id: string; name: string; avatar: string | null } | null;
  }>;
}

export type DocumentAccess = "view" | "edit" | "delete" | "share";

export interface DocumentOwnerDto {
  id: string;
  name: string;
  avatar: string | null;
}

export interface DocumentCheckoutDto {
  membershipId: string;
  user: DocumentOwnerDto;
  at: string;
}

export type FolderMetadataFieldType =
  | "text"
  | "longtext"
  | "number"
  | "currency"
  | "date"
  | "datetime"
  | "boolean"
  | "choice"
  | "email"
  | "url"
  | "user";

export interface FolderMetadataFieldDto {
  id: string;
  name: string;
  slug: string;
  type: FolderMetadataFieldType;
  required: boolean;
  options: ListFieldOption[] | null;
  order: number;
}

export interface FolderMetadataFieldInput {
  name: string;
  slug: string;
  type: FolderMetadataFieldType;
  required: boolean;
  options: ListFieldOption[] | null;
  order: number;
}

export interface FolderMetadataFieldsResponse {
  fields: FolderMetadataFieldDto[];
  inherited: FolderMetadataFieldDto[];
}

export type DocumentPublishStatus = "PUBLISHED" | "DRAFT" | "PENDING" | "REJECTED";

export type EditorDocumentKind = "DOC" | "SHEET";

export interface DocumentItemDto {
  id: string;
  kind: "document";
  documentKind: "FILE" | EditorDocumentKind;
  name: string;
  originalName: string;
  extension: string;
  mimeType: string;
  sizeBytes: number;
  folderId: string | null;
  owner: DocumentOwnerDto;
  favorite: boolean;
  permissions: Record<DocumentAccess, boolean>;
  checkedOut: DocumentCheckoutDto | null;
  metadata: Record<string, unknown>;
  metadataAuto: string[];
  isTemplate: boolean;
  pinnedAt: string | null;
  publishStatus: DocumentPublishStatus;
  isRecord: boolean;
  legalHold: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FolderItemDto {
  id: string;
  kind: "folder";
  name: string;
  parentId: string | null;
  owner: DocumentOwnerDto | null;
  favorite: boolean;
  permissions: Record<DocumentAccess, boolean>;
  isTemplate: boolean;
  pinnedAt: string | null;
  governance: GovernanceSettings;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentBreadcrumbDto {
  id: string | null;
  name: string;
}

export interface DocumentsResponse {
  folder: FolderItemDto | null;
  breadcrumbs: DocumentBreadcrumbDto[];
  folders: FolderItemDto[];
  documents: DocumentItemDto[];
  metadataFields: FolderMetadataFieldDto[];
  total: number;
}

export type DocumentVersionType = "MAJOR" | "MINOR";

export interface DocumentVersionDto {
  id: string;
  version: number;
  versionType: DocumentVersionType;
  label: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  creator: DocumentOwnerDto;
  createdAt: string;
  current: boolean;
}

export interface DocumentDetailResponse {
  document: DocumentItemDto;
  breadcrumbs: DocumentBreadcrumbDto[];
  versions: DocumentVersionDto[];
  metadataFields: FolderMetadataFieldDto[];
}

// --- Nexora Docs & Sheets (in-app editor documents) ---

export interface CreateEditorDocumentInput {
  name: string;
  kind: EditorDocumentKind;
  folderId?: string | null;
}

export interface EditorContentResponse {
  kind: EditorDocumentKind;
  content: unknown;
  updatedAt: string;
}

export interface SaveEditorContentInput {
  content: unknown;
  plainText?: string;
}

export interface DocumentCommentDto {
  id: string;
  body: string;
  author: { id: string; name: string; avatar: string | null };
  createdAt: string;
  updatedAt: string;
}

export interface TrashItemDto {
  id: string;
  kind: "document" | "folder";
  name: string;
  deletedAt: string;
  deletedBy: DocumentOwnerDto | null;
  originalLocation: string;
}

export interface TrashResponse {
  folders: TrashItemDto[];
  documents: TrashItemDto[];
}

export type DocumentSharePermission = "READ" | "EDIT" | "UPLOAD";
export type DocumentShareTargetType = "USER" | "TEAM" | "ORGANIZATION";

export interface DocumentShareTargetsResponse {
  users: Array<{ id: string; name: string; email: string }>;
  teams: Array<{ id: string; name: string }>;
  organizations: Array<{ id: string; name: string }>;
}

export interface DocumentShareLinkDto {
  id: string;
  targetType: "document" | "folder";
  permission: DocumentSharePermission;
  expiresAt: string;
  passwordProtected: boolean;
  createdAt: string;
  url?: string;
}

export interface PublicDocumentShareDto {
  kind: "document" | "folder";
  documentId: string | null;
  folderId: string | null;
  name: string;
  mimeType: string | null;
  sizeBytes: number | null;
  permission: DocumentSharePermission;
  expiresAt: string;
}

export interface PublicShareItemDto {
  id: string;
  kind: "document" | "folder";
  name: string;
  mimeType: string | null;
  sizeBytes: number | null;
  updatedAt: string;
}

export interface PublicShareFolderContentsDto {
  folder: { id: string; name: string };
  breadcrumbs: DocumentBreadcrumbDto[];
  items: PublicShareItemDto[];
}

export interface DocumentPermissionDto {
  membershipId: string;
  user: DocumentOwnerDto;
  view: boolean;
  edit: boolean;
  delete: boolean;
  share: boolean;
}

// --- Access management ("Gerir acesso" / Request Access) ---

export type AccessEntrySource = "user" | "team" | "owner" | "link";

export interface AccessEntryDto {
  membershipId?: string;
  teamId?: string;
  name: string;
  access: Record<DocumentAccess, boolean>;
  source: AccessEntrySource;
}

export interface AccessPanelResponse {
  entries: AccessEntryDto[];
  inheritsPermissions: boolean;
  owner: DocumentOwnerDto | null;
  linksCount: number;
}

export interface SetInheritanceInput {
  inherit: boolean;
}

export type AccessRequestStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface AccessRequestDto {
  id: string;
  resourceType: "document" | "folder";
  resourceId: string;
  resourceName: string;
  requester: { membershipId: string; name: string; email: string } | null;
  message: string | null;
  status: AccessRequestStatus;
  decidedByMembershipId: string | null;
  decidedAt: string | null;
  createdAt: string;
}

export interface RequestAccessInput {
  resourceType: "document" | "folder";
  resourceId: string;
  message?: string;
}

export interface DecideAccessInput {
  approve: boolean;
  access?: "view" | "edit";
}

export interface AccessRequestsResponse {
  requests: AccessRequestDto[];
}

// --- Pinning / Recent / Favorites ---

export interface SetPinnedInput {
  pinned: boolean;
}

export interface RecentDocumentDto extends DocumentItemDto {
  folderName: string | null;
}

export interface RecentDocumentsResponse {
  documents: RecentDocumentDto[];
}

export interface FavoritesResponse {
  folders: FolderItemDto[];
  documents: DocumentItemDto[];
}

// --- Document activity, shared views & bulk download ---

export interface DocumentActivityDto {
  id: string;
  action: string;
  actor: DocumentOwnerDto | null;
  context: Record<string, unknown> | null;
  occurredAt: string;
}

export interface DocumentActivityResponse {
  activity: DocumentActivityDto[];
  stats: { views: number; downloads: number; edits: number };
}

export type SharedVia = "DIRECT" | "TEAM" | "ORGANIZATION";

export interface SharedDocumentDto extends DocumentItemDto {
  sharedVia: SharedVia;
  canEdit: boolean;
  folderName: string | null;
}

export interface SharedByMeDto extends DocumentItemDto {
  grants: number;
  links: number;
}

export interface SharedDocumentsResponse {
  sharedWithMe: SharedDocumentDto[];
  sharedByMe: SharedByMeDto[];
}

export interface BulkDownloadInput {
  documentIds?: string[];
  folderIds?: string[];
}

export interface PublishDocumentInput {
  note?: string;
}

export interface DecidePublishInput {
  note?: string;
}

// --- Retention & sensitivity governance ---

export type RetentionMode = "NONE" | "RETAIN" | "BLOCK_DELETE";
export type SensitivityLevel = "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED";

export interface GovernanceSettings {
  retentionMode: RetentionMode;
  retentionDays: number | null;
  sensitivity: SensitivityLevel;
  requireApproval: boolean;
  inheritedFrom?: string | null;
}

export interface UpdateGovernanceInput {
  retentionMode?: RetentionMode;
  retentionDays?: number | null;
  sensitivity?: SensitivityLevel;
  requireApproval?: boolean;
}

// --- External webhooks ---

export type WebhookStatus = "ACTIVE" | "DISABLED";

export interface WebhookDto {
  id: string;
  name: string;
  url: string;
  events: string[];
  status: WebhookStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWebhookInput {
  name: string;
  url: string;
  events: string[];
}

export interface UpdateWebhookInput {
  name?: string;
  url?: string;
  events?: string[];
  status?: WebhookStatus;
}

export interface WebhooksResponse {
  webhooks: WebhookDto[];
}

export interface CreateWebhookResponse {
  webhook: WebhookDto;
  secret: string;
}

export interface WebhookDeliveryDto {
  id: string;
  webhookId: string;
  event: string;
  status: "PENDING" | "SUCCESS" | "FAILED";
  responseCode: number | null;
  error: string | null;
  attemptedAt: string;
}

export interface WebhookDeliveriesResponse {
  deliveries: WebhookDeliveryDto[];
}

// --- AI auto-metadata ---

export interface AutofillMetadataResponse {
  suggested: Record<string, unknown>;
  applied: Record<string, unknown>;
}

// --- Document & Folder Templates ---

export interface SetTemplateInput {
  isTemplate: boolean;
}

export interface InstantiateInput {
  folderId?: string | null;
  parentId?: string | null;
  name?: string;
}

export interface TemplatesResponse {
  documents: DocumentItemDto[];
  folders: FolderItemDto[];
}

// --- Saved Views ---

export type SavedViewResourceType = "list" | "tasks" | "documents";

export type SavedViewConfig = Record<string, unknown>;

export interface SavedViewDto {
  id: string;
  resourceType: SavedViewResourceType;
  resourceId: string | null;
  name: string;
  isShared: boolean;
  config: SavedViewConfig;
  createdByMembershipId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSavedViewInput {
  resourceType: SavedViewResourceType;
  resourceId?: string | null;
  name: string;
  config: SavedViewConfig;
  isShared?: boolean;
}

export interface UpdateSavedViewInput {
  name?: string;
  config?: SavedViewConfig;
  isShared?: boolean;
}

export interface SavedViewsResponse {
  views: SavedViewDto[];
}

// --- Subscriptions / Alerts ("Avisar-me") ---

export type SubscriptionTargetType = "folder" | "document" | "list" | "task" | "project";

export type SubscriptionEvent = "created" | "updated" | "deleted" | "version.added" | "item.added" | "commented";

export interface ResourceSubscriptionDto {
  id: string;
  targetType: SubscriptionTargetType;
  targetId: string;
  events: string[];
  createdAt: string;
}

export interface SubscribeInput {
  targetType: SubscriptionTargetType;
  targetId: string;
  events: string[];
}

export interface UnsubscribeInput {
  targetType: SubscriptionTargetType;
  targetId: string;
}

export interface SubscriptionsResponse {
  subscriptions: ResourceSubscriptionDto[];
}

export interface SubscriptionCheckResponse {
  subscribed: boolean;
}

// --- Configurable Dashboards ---

export type DashboardWidgetType =
  | "metrics"
  | "recentDocuments"
  | "pendingTasks"
  | "notifications"
  | "recentActivity"
  | "taskDistribution"
  | "quickLinks";

export interface DashboardWidgetDto {
  id: string;
  type: DashboardWidgetType;
  config: Record<string, unknown>;
  position: Record<string, unknown>;
}

export interface DashboardDto {
  id: string;
  name: string;
  layout: Record<string, unknown>;
  widgets: DashboardWidgetDto[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateDashboardInput {
  name: string;
  layout?: Record<string, unknown>;
}

export interface UpdateDashboardInput {
  name?: string;
  layout?: Record<string, unknown>;
}

export interface CreateWidgetInput {
  type: DashboardWidgetType;
  config?: Record<string, unknown>;
  position?: Record<string, unknown>;
}

export interface UpdateWidgetInput {
  config?: Record<string, unknown>;
  position?: Record<string, unknown>;
}

export interface DashboardsResponse {
  dashboards: DashboardDto[];
}

export interface RenderedDashboardResponse {
  dashboard: DashboardDto;
  widgets: Array<DashboardWidgetDto & { data: unknown }>;
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string[]>;
  };
}

export type ListFieldType =
  | "text"
  | "longtext"
  | "number"
  | "currency"
  | "date"
  | "datetime"
  | "boolean"
  | "choice"
  | "email"
  | "url"
  | "user"
  | "relation"
  | "file";

export interface ListFieldOption {
  value: string;
  label: string;
}

export interface ListFieldDto {
  id: string;
  name: string;
  slug: string;
  type: ListFieldType;
  required: boolean;
  options: ListFieldOption[] | null;
  relationListId: string | null;
  order: number;
}

export interface ListSummaryDto {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  fieldCount: number;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ListDefinitionDto {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  fields: ListFieldDto[];
  itemCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ListsResponse {
  lists: ListSummaryDto[];
  total: number;
}

export interface ListItemsResponse {
  items: ListItemDto[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ListItemDto {
  id: string;
  values: Record<string, unknown>;
  creator: { id: string; name: string; avatar: string | null };
  createdAt: string;
  updatedAt: string;
}

export type FormFieldType =
  | "text"
  | "longtext"
  | "number"
  | "currency"
  | "email"
  | "phone"
  | "date"
  | "select"
  | "radio"
  | "checkbox"
  | "upload"
  | "heading"
  | "separator";

export type FormStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

export interface FormFieldOption {
  value: string;
  label: string;
}

export interface FormFieldDefinition {
  id: string;
  type: FormFieldType;
  label: string;
  required: boolean;
  placeholder?: string;
  defaultValue?: unknown;
  options?: FormFieldOption[] | null;
  order: number;
}

export interface FormDefinitionDto {
  id: string;
  name: string;
  description: string | null;
  status: FormStatus;
  fields: FormFieldDefinition[];
  submissionCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface FormSummaryDto {
  id: string;
  name: string;
  description: string | null;
  status: FormStatus;
  fieldCount: number;
  submissionCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface FormsResponse {
  forms: FormSummaryDto[];
  total: number;
}

export interface FormSubmissionDto {
  id: string;
  values: Record<string, unknown>;
  submitter: { id: string; name: string; avatar: string | null } | null;
  submittedAt: string;
}

export interface FormSubmissionsResponse {
  submissions: FormSubmissionDto[];
  total: number;
  page: number;
  pageSize: number;
}

export type TaskStatus = "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "DONE" | "CANCELLED";
export type TaskPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";

export interface TaskCommentDto {
  id: string;
  body: string;
  author: { id: string; name: string; avatar: string | null };
  createdAt: string;
  updatedAt: string;
}

export interface TaskDto {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  startAt: string | null;
  dueAt: string | null;
  completedAt: string | null;
  tags: string[];
  assignee: { id: string; name: string; avatar: string | null } | null;
  team: { id: string; name: string } | null;
  project: { id: string; name: string; color: string } | null;
  document: { id: string; name: string } | null;
  creator: { id: string; name: string; avatar: string | null };
  comments: TaskCommentDto[];
  createdAt: string;
  updatedAt: string;
}

export interface TaskSummaryDto {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  startAt: string | null;
  dueAt: string | null;
  completedAt: string | null;
  tags: string[];
  assignee: { id: string; name: string; avatar: string | null } | null;
  team: { id: string; name: string } | null;
  project: { id: string; name: string; color: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface TasksResponse {
  tasks: TaskSummaryDto[];
  total: number;
}

export type AnalyticsPeriodDays = 7 | 30 | 90;

export interface OperationalAnalyticsResponse {
  period: { days: AnalyticsPeriodDays; from: string; to: string; timezone: "UTC" };
  summary: {
    documentsCreated: number;
    tasksCreated: number;
    tasksCompleted: number;
    activeUsers: number;
    overdueTasks: number;
    currentTaskCompletionRatio: number | null;
    avgApprovalHours: number | null;
    workflowRuns: number;
    workflowSuccessRate: number | null;
  };
  trend: Array<{
    date: string;
    documentsCreated: number;
    tasksCreated: number;
    tasksCompleted: number;
    approvalsDecided: number;
    workflowRuns: number;
  }>;
  taskStatus: Array<{ status: TaskStatus; count: number }>;
  approvalOutcomes: { pending: number; approved: number; rejected: number };
  workflowPerformance: Array<{
    workflowId: string;
    workflowName: string;
    runs: number;
    completed: number;
    failed: number;
    successRate: number | null;
    avgDurationHours: number | null;
  }>;
  adoption: Array<{ resourceType: string; actions: number }>;
}

export interface ProjectDto {
  id: string;
  name: string;
  description: string | null;
  color: string;
  taskCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectsResponse {
  projects: ProjectDto[];
  total: number;
}

export type WorkflowStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";
export type WorkflowStepType =
  | "START"
  | "CREATE_TASK"
  | "SEND_NOTIFICATION"
  | "SEND_EMAIL"
  | "APPROVAL"
  | "CHANGE_STATUS"
  | "ASSIGN_USER"
  | "CHANGE_FIELD"
  | "MOVE_DOCUMENT"
  | "CONDITION"
  | "END";

export type WorkflowInstanceStatus = "RUNNING" | "WAITING_APPROVAL" | "COMPLETED" | "FAILED" | "CANCELLED";
export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface WorkflowStepDto {
  id: string;
  order: number;
  type: WorkflowStepType;
  name: string;
  config: Record<string, unknown>;
}

export interface WorkflowDefinitionDto {
  id: string;
  name: string;
  description: string | null;
  version: number;
  status: WorkflowStatus;
  steps: WorkflowStepDto[];
  instanceCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowsResponse {
  workflows: WorkflowDefinitionDto[];
  total: number;
}

export interface WorkflowStepExecutionDto {
  id: string;
  stepOrder: number;
  stepType: WorkflowStepType;
  stepName: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "SKIPPED";
  result: Record<string, unknown> | null;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
}

export interface ApprovalDto {
  id: string;
  stepOrder: number;
  approver: { id: string; name: string };
  status: ApprovalStatus;
  decisionNote: string | null;
  decidedAt: string | null;
  createdAt: string;
}

export interface WorkflowInstanceDto {
  id: string;
  workflowDefinitionId: string;
  workflowName: string;
  status: WorkflowInstanceStatus;
  currentStepOrder: number;
  startedBy: { id: string; name: string };
  input: Record<string, unknown> | null;
  context: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
  steps: WorkflowStepDto[];
  executions: WorkflowStepExecutionDto[];
  approvals: ApprovalDto[];
}

export interface WorkflowInstancesResponse {
  instances: WorkflowInstanceDto[];
  total: number;
}

// --- Approvals ---

export interface ApprovalCommentDto {
  id: string;
  author: { id: string; name: string };
  body: string;
  createdAt: string;
}

export interface ApprovalDelegationDto {
  id: string;
  fromMember: { id: string; name: string };
  toMember: { id: string; name: string };
  reason: string | null;
  createdAt: string;
}

export interface ApprovalDetailDto {
  id: string;
  status: ApprovalStatus;
  stepOrder: number;
  workflowInstanceId: string;
  workflowName: string;
  approver: { id: string; name: string };
  delegatedBy: { id: string; name: string } | null;
  decisionNote: string | null;
  decidedAt: string | null;
  createdAt: string;
  comments: ApprovalCommentDto[];
  delegations: ApprovalDelegationDto[];
}

export interface ApprovalsResponse {
  approvals: ApprovalDetailDto[];
  total: number;
}

// --- Notifications ---

export interface NotificationDto {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationsResponse {
  notifications: NotificationDto[];
  total: number;
  unreadCount: number;
}

export interface UnreadCountResponse {
  unreadCount: number;
}

// --- Global Search ---

export type SearchEntityType = "document" | "folder" | "list" | "list_item" | "task" | "workflow" | "user" | "site" | "news";

export interface SearchResultDto {
  id: string;
  type: SearchEntityType;
  title: string;
  subtitle: string | null;
  href: string;
  createdAt: string;
  createdBy: { id: string; name: string } | null;
  status: string | null;
  snippet?: string | null;
}

export interface SearchGroupDto {
  type: SearchEntityType;
  label: string;
  results: SearchResultDto[];
  total: number;
}

export interface SearchResponse {
  query: string;
  groups: SearchGroupDto[];
  total: number;
  facets?: SearchFacetDto[];
}

export interface SearchFilters {
  types?: SearchEntityType[];
  createdAfter?: string;
  createdBefore?: string;
  createdBy?: string;
  teamId?: string;
  status?: string;
  mimeType?: string;
  sensitivity?: string;
  publishStatus?: string;
  meta?: string; // "slug:value" metadata refiner
}

export interface SearchFacetDto {
  field: string;
  values: { value: string; count: number }[];
}

// --- Admin: Audit Logs ---

export interface AuditLogDto {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  context: Record<string, unknown> | null;
  ipAddress: string | null;
  result: string;
  occurredAt: string;
  actor: { id: string; name: string; email: string } | null;
}

export interface AuditLogListResponse {
  logs: AuditLogDto[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AuditLogFilters {
  action?: string;
  resourceType?: string;
  actorId?: string;
  result?: string;
  after?: string;
  before?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

// --- Admin: Organization Settings ---

export interface OrganizationSettingsDto {
  logoUrl: string | null;
  language: string;
  timezone: string;
  passwordPolicy: {
    minLength: number;
    requireUpper: boolean;
    requireLower: boolean;
    requireDigit: boolean;
    requireSymbol: boolean;
  };
  storageQuotaBytes: number;
  notificationsEnabled: boolean;
  emailNotifications: boolean;
  trashRetentionDays: number;
}

export interface UpdateOrganizationSettingsDto {
  logoUrl?: string | null;
  language?: string;
  timezone?: string;
  passwordMinLength?: number;
  passwordRequireUpper?: boolean;
  passwordRequireLower?: boolean;
  passwordRequireDigit?: boolean;
  passwordRequireSymbol?: boolean;
  storageQuotaBytes?: number;
  notificationsEnabled?: boolean;
  emailNotifications?: boolean;
  trashRetentionDays?: number;
}

// --- Admin: Teams ---

export interface TeamDto {
  id: string;
  name: string;
  description: string | null;
  memberCount: number;
  createdAt: string;
}

export interface TeamDetailDto extends TeamDto {
  members: { id: string; name: string; email: string; role: string }[];
}

export interface CreateTeamDto {
  name: string;
  description?: string;
}

export interface UpdateTeamDto {
  name?: string;
  description?: string;
}

// --- Admin: Roles & Permissions ---

export interface PermissionDto {
  id: string;
  key: string;
  description: string;
}

export interface RoleDto {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: PermissionDto[];
}

export interface CreateRoleDto {
  name: string;
  description?: string;
  permissionKeys: string[];
}

export interface UpdateRoleDto {
  name?: string;
  description?: string;
  permissionKeys?: string[];
}

// --- AI ---

export type AIActionType =
  | "chat"
  | "summarize"
  | "extract"
  | "classify"
  | "keywords"
  | "qa"
  | "create_list"
  | "create_workflow"
  | "create_app"
  | "report";

export interface AIMessageDto {
  id: string;
  role: "user" | "assistant";
  content: string;
  actionType: AIActionType | null;
  actionData: unknown | null;
  createdAt: string;
}

export interface AIConversationDto {
  id: string;
  title: string;
  messages: AIMessageDto[];
  createdAt: string;
  updatedAt: string;
}

export interface AIChatRequest {
  message: string;
  conversationId?: string;
}

export interface AIChatResponse {
  conversationId: string;
  message: AIMessageDto;
  usage: { tokensUsed: number; costUsd: number };
}

export interface AIDocumentSummaryResponse {
  documentId: string;
  documentName: string;
  summary: string;
  keywords: string[];
  classification: string;
  usage: { tokensUsed: number; costUsd: number };
}

export type AIContextResourceType = "document" | "task" | "list" | "workflow";

export interface AIContextualResponse {
  resourceType: AIContextResourceType;
  resourceId: string;
  resourceName: string;
  answer: string;
  usage: { tokensUsed: number; costUsd: number };
}

export interface AIProposedListField {
  name: string;
  slug: string;
  type: string;
  required: boolean;
}

export interface AIProposedList {
  name: string;
  description: string;
  fields: AIProposedListField[];
}

export interface AIProposedWorkflowStep {
  order: number;
  type: string;
  name: string;
  config: Record<string, unknown>;
}

export interface AIProposedWorkflow {
  name: string;
  description: string;
  steps: AIProposedWorkflowStep[];
}

export interface AIActionProposal {
  type: "create_list" | "create_workflow";
  list?: AIProposedList;
  workflow?: AIProposedWorkflow;
  explanation: string;
}

export interface AIReportResponse {
  title: string;
  summary: string;
  sections: { heading: string; body: string; data?: unknown }[];
  usage: { tokensUsed: number; costUsd: number };
}

// --- Plans & Billing ---

export interface PlanLimits {
  maxUsers: number; // -1 = unlimited
  maxStorageBytes: number; // -1 = unlimited
  maxDocuments: number; // -1 = unlimited
  maxOrganizations: number; // -1 = unlimited
  maxWorkflows: number; // -1 = unlimited
  aiRequestsPerMonth: number; // -1 = unlimited
}

export interface PlanDto {
  id: string;
  code: string;
  name: string;
  description: string | null;
  priceMonthly: number;
  priceAnnual: number;
  currency: string;
  isActive: boolean;
  sortOrder: number;
  features: string[];
  limits: PlanLimits;
}

export interface SubscriptionDto {
  id: string;
  plan: PlanDto;
  status: string;
  billingCycle: string;
  trialEndsAt: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  canceledAt: string | null;
  /** True when the subscription is managed by an external billing provider (e.g. Stripe). */
  billingManaged: boolean;
}

export interface UsageStats {
  users: number;
  storageBytes: number;
  documents: number;
  workflows: number;
  aiRequestsThisMonth: number;
  limits: PlanLimits;
  exceeded: string[];
}

// --- Health (extended) ---

export interface HealthCheckDetail {
  name: string;
  status: "operational" | "degraded" | "down";
  latencyMs?: number;
  message?: string;
}

// --- Automation: workflow triggers & quick actions ---

export type WorkflowTriggerScope = "organization" | "folder" | "list";

export interface WorkflowTriggerDto {
  id: string;
  workflowDefinitionId: string;
  workflowName: string;
  workflowStatus: string;
  event: string;
  scopeType: WorkflowTriggerScope;
  scopeId: string | null;
  enabled: boolean;
  createdAt: string;
}

export interface WorkflowTriggersResponse {
  triggers: WorkflowTriggerDto[];
}

export interface QuickActionDto {
  id: string;
  name: string;
  targetType: "document" | "folder";
  workflowDefinitionId: string;
  workflowName: string;
  workflowStatus: string;
  scopeId: string | null;
  position: number;
  createdAt: string;
}

export interface QuickActionsResponse {
  actions: QuickActionDto[];
}

export interface AutomationResourcesResponse {
  folders: Array<{ id: string; name: string; path: string }>;
  lists: Array<{ id: string; name: string }>;
  members: Array<{ id: string; name: string }>;
}

export interface CollaborationMemberDto {
  membershipId: string;
  userId: string;
  name: string;
  avatar: string | null;
}
export interface CollaborationMembersResponse { members: CollaborationMemberDto[]; }
export type RealtimeResourceType = "document" | "task" | "news" | "approval";
export interface RealtimePresenceDto {
  membershipId: string;
  userId: string;
  name: string;
  avatar: string | null;
}
export interface RealtimeEventDto {
  id: string;
  type: "connected" | "notification.created" | "notification.updated" | "comment.created" | "comment.deleted" | "resource.updated" | "presence.updated";
  occurredAt: string;
  resourceType?: RealtimeResourceType;
  resourceId?: string;
  actor?: { userId: string; name: string; avatar: string | null };
  presence?: RealtimePresenceDto[];
}

// --- Records & legal hold ---

export interface DocumentRecordState {
  isRecord: boolean;
  legalHold: boolean;
  legalHoldReason?: string | null;
}

// --- Announcements / news ---

export interface AnnouncementDto {
  id: string;
  title: string;
  body: string;
  audience: string; // ALL | TEAM:<teamId>
  publishAt: string;
  expiresAt: string | null;
  author: string;
  createdAt: string;
}

export interface AnnouncementsResponse {
  announcements: AnnouncementDto[];
}

// --- Governance & access review ---

export interface EffectiveAccessEntryDto {
  membershipId: string;
  userName: string;
  email: string;
  access: "direct" | "team" | "organization" | "owner" | "link";
  permission: string;
  source: string; // e.g. team name, link label
}

export interface AccessReviewResponse {
  resourceId: string;
  resourceName: string;
  resourceType: "document" | "folder";
  entries: EffectiveAccessEntryDto[];
  publicLinks: { id: string; permission: string; expiresAt: string | null; createdAt: string }[];
}

export interface GovernanceReportDto {
  publicLinks: { id: string; targetType: string; targetName: string; permission: string; expiresAt: string | null; createdBy: string }[];
  inactiveDocuments: { id: string; name: string; lastActivityAt: string; sizeBytes: number }[];
  duplicateDocuments: { checksum: string; documentIds: string[]; names: string[]; sizeBytes: number }[];
  recordsCount: number;
  legalHoldsCount: number;
}

// --- Delta / changes feed ---

export interface DeltaEntryDto {
  type: "created" | "updated" | "deleted";
  resourceType: "document" | "folder";
  resourceId: string;
  name: string;
  folderId: string | null;
  changedAt: string;
}

export interface DeltaFeedResponse {
  entries: DeltaEntryDto[];
  cursor: string; // pass as ?cursor= to get the next page
}

// --- Sites / workspaces ---

export type SiteType = "DEPARTMENT" | "PROJECT" | "TEAM" | "HUB";
export type SiteVisibility = "ORG" | "PRIVATE";
export type SiteRole = "ADMIN" | "MANAGER" | "EDITOR" | "CONTRIBUTOR" | "VIEWER";

export interface SiteDto {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  description: string | null;
  type: SiteType;
  icon: string;
  color: string;
  visibility: SiteVisibility;
  myRole: SiteRole | null;
  memberCount: number;
  childrenCount: number;
  createdAt: string;
}

export interface SitesResponse {
  sites: SiteDto[];
}

export interface SiteMemberDto {
  membershipId: string;
  role: SiteRole;
  user: { id: string; name: string; email: string; avatar: string | null };
}

export interface SitePageDto {
  id: string;
  siteId: string;
  title: string;
  slug: string;
  widgets: PageWidget[];
  status: "DRAFT" | "PUBLISHED";
  isHome: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PageWidget {
  id: string;
  type: string;
  props: Record<string, unknown>;
}

export interface SiteContentItem {
  id: string;
  name: string;
  kind: "list" | "form" | "workflow" | "task" | "folder";
  status: string | null;
  href: string;
}

export interface SiteDetailResponse {
  site: SiteDto;
  children: SiteDto[];
  members: SiteMemberDto[];
  pages: SitePageDto[];
  homePage: SitePageDto | null;
  content: SiteContentItem[];
  stats: { documents: number; lists: number; tasks: number; workflows: number; members: number; pages: number; news: number };
}

export interface CreateSiteInput {
  name: string;
  type?: SiteType;
  parentId?: string | null;
  description?: string | null;
  icon?: string;
  color?: string;
  visibility?: SiteVisibility;
}

export interface UpdateSiteInput {
  name?: string;
  description?: string | null;
  icon?: string;
  color?: string;
  visibility?: SiteVisibility;
}

export interface SitePagesResponse {
  pages: SitePageDto[];
}

export interface SitePageResponse {
  page: SitePageDto;
}

export interface UpsertSitePageInput {
  title: string;
  slug?: string;
  widgets?: PageWidget[];
  status?: "DRAFT" | "PUBLISHED";
  isHome?: boolean;
}

// --- News ---

export type NewsStatus = "DRAFT" | "PUBLISHED" | "SCHEDULED";

export interface NewsPostDto {
  id: string;
  siteId: string | null;
  siteName: string | null;
  title: string;
  excerpt: string | null;
  body: string;
  coverColor: string;
  category: string | null;
  tags: string[];
  status: NewsStatus;
  featured: boolean;
  publishedAt: string | null;
  author: { id: string; name: string; avatar: string | null } | null;
  commentCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface NewsCommentDto {
  id: string;
  body: string;
  author: { id: string; name: string; avatar: string | null } | null;
  createdAt: string;
}

export interface NewsListResponse {
  news: NewsPostDto[];
}

export interface NewsDetailResponse {
  post: NewsPostDto;
  comments: NewsCommentDto[];
}

export interface UpsertNewsInput {
  title: string;
  excerpt?: string | null;
  body?: string;
  siteId?: string | null;
  category?: string | null;
  tags?: string[];
  coverColor?: string;
  status?: NewsStatus;
  featured?: boolean;
  publishedAt?: string | null;
}

// --- AI no-code scaffold ---

export interface AIScaffoldFormField {
  type: FormFieldType;
  label: string;
  required: boolean;
  options?: FormFieldOption[] | null;
}

export interface AIScaffoldSpec {
  name: string;
  description: string;
  list: AIProposedList;
  form: { name: string; fields: AIScaffoldFormField[] };
  workflow: AIProposedWorkflow;
  page: { title: string; widgets: PageWidget[] } | null;
}

export interface AIScaffoldProposal {
  type: "create_app";
  spec: AIScaffoldSpec;
  explanation: string;
}

export interface AIScaffoldApplyInput {
  siteId?: string | null;
  spec: AIScaffoldSpec;
}

export interface AIScaffoldApplyResponse {
  list: { id: string; name: string };
  form: { id: string; name: string };
  workflow: { id: string; name: string };
  page: { id: string; title: string; siteId: string } | null;
}

// --- Trust center: sessions & security overview ---

export interface UserSessionDto {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  current: boolean;
}

export interface UserSessionsResponse {
  sessions: UserSessionDto[];
}

export interface SecurityOverviewDto {
  sso: { enabled: boolean; issuerUrl: string | null; emailDomains: string[] };
  passwordPolicy: { minLength: number; requireUpper: boolean; requireLower: boolean; requireDigit: boolean; requireSymbol: boolean };
  members: { active: number; suspended: number; pendingInvitations: number };
  sessions: { active: number };
  securityEvents30d: { failedLogins: number; logins: number; settingsChanges: number; roleChanges: number };
  recentSecurityEvents: Array<{ id: string; action: string; occurredAt: string; actorName: string | null; ipAddress: string | null; result: string | null }>;
}

// --- Public contact requests (admin) ---

export interface ContactRequestDto {
  id: string;
  name: string;
  email: string;
  company: string | null;
  message: string;
  createdAt: string;
}

export interface ContactRequestsResponse {
  requests: ContactRequestDto[];
  total: number;
  page: number;
  pageSize: number;
}

// --- Platform organizations (super admin, read-only) ---

export interface PlatformOrganizationDto {
  id: string;
  name: string;
  slug: string;
  status: string;
  createdAt: string;
  memberCount: number;
  ownerName: string | null;
  ownerEmail: string | null;
  planName: string | null;
  subscriptionStatus: string | null;
}

export interface PlatformOrganizationsResponse {
  organizations: PlatformOrganizationDto[];
  total: number;
  page: number;
  pageSize: number;
}
