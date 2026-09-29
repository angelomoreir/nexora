// Help Center articles — based on the REAL features of the Nexora application.
// Each article documents actual functionality: real routes, real buttons, real fields,
// real permissions. Nothing is invented.

export interface HelpArticleSection {
  heading: string;
  body: string;
}

export interface HelpArticle {
  slug: string;
  category: string;
  icon: string; // lucide icon name
  titleKey: string; // i18n key for title
  summaryKey: string; // i18n key for summary
  sections: HelpArticleSection[];
  relatedSlugs: string[];
  keywords: string[];
  contextualRoute?: string; // route prefix for contextual help linking
}

export interface HelpCategory {
  id: string;
  icon: string;
  titleKey: string;
  descriptionKey: string;
  articleSlugs: string[];
}

// --- Categories ---

export const HELP_CATEGORIES: HelpCategory[] = [
  {
    id: "getting-started",
    icon: "Rocket",
    titleKey: "help.categories.gettingStarted",
    descriptionKey: "help.categories.gettingStartedDesc",
    articleSlugs: ["getting-started", "dashboard-guide", "custom-dashboards", "navigation-guide"]
  },
  {
    id: "documents",
    icon: "FileText",
    titleKey: "help.categories.documents",
    descriptionKey: "help.categories.documentsDesc",
    articleSlugs: ["documents-overview", "upload-document", "manage-folders", "document-versions", "share-document", "document-permissions", "recycle-bin", "document-comments", "checkout-checkin", "document-metadata", "document-templates", "saved-views", "manage-access", "governance", "pin-recent-favorites", "ai-metadata"]
  },
  {
    id: "lists",
    icon: "List",
    titleKey: "help.categories.lists",
    descriptionKey: "help.categories.listsDesc",
    articleSlugs: ["lists-overview", "create-list", "manage-list-items", "export-list-csv"]
  },
  {
    id: "forms",
    icon: "FilePlus",
    titleKey: "help.categories.forms",
    descriptionKey: "help.categories.formsDesc",
    articleSlugs: ["forms-overview", "form-builder", "form-submissions", "publish-form"]
  },
  {
    id: "tasks",
    icon: "CheckSquare",
    titleKey: "help.categories.tasks",
    descriptionKey: "help.categories.tasksDesc",
    articleSlugs: ["tasks-overview", "create-task", "task-views", "task-comments", "task-projects"]
  },
  {
    id: "workflows",
    icon: "GitBranch",
    titleKey: "help.categories.workflows",
    descriptionKey: "help.categories.workflowsDesc",
    articleSlugs: ["workflows-overview", "workflow-builder", "workflow-steps", "run-workflow", "workflow-instances"]
  },
  {
    id: "approvals",
    icon: "CheckCheck",
    titleKey: "help.categories.approvals",
    descriptionKey: "help.categories.approvalsDesc",
    articleSlugs: ["approvals-overview", "approve-reject", "delegate-approval", "approval-comments"]
  },
  {
    id: "notifications",
    icon: "Bell",
    titleKey: "help.categories.notifications",
    descriptionKey: "help.categories.notificationsDesc",
    articleSlugs: ["notifications-overview", "manage-notifications", "subscriptions-alerts"]
  },
  {
    id: "search",
    icon: "Search",
    titleKey: "help.categories.search",
    descriptionKey: "help.categories.searchDesc",
    articleSlugs: ["search-overview", "search-filters"]
  },
  {
    id: "ai",
    icon: "Sparkles",
    titleKey: "help.categories.ai",
    descriptionKey: "help.categories.aiDesc",
    articleSlugs: ["ai-overview", "ai-document-operations", "ai-create-list", "ai-create-workflow", "ai-reports"]
  },
  {
    id: "admin",
    icon: "Shield",
    titleKey: "help.categories.admin",
    descriptionKey: "help.categories.adminDesc",
    articleSlugs: ["admin-overview", "manage-users", "invite-team", "manage-teams", "manage-roles", "audit-logs", "organization-settings", "webhooks"]
  },
  {
    id: "billing",
    icon: "CreditCard",
    titleKey: "help.categories.billing",
    descriptionKey: "help.categories.billingDesc",
    articleSlugs: ["billing-overview", "manage-subscription", "usage-limits"]
  },
  {
    id: "account",
    icon: "UserRound",
    titleKey: "help.categories.account",
    descriptionKey: "help.categories.accountDesc",
    articleSlugs: ["profile-settings", "change-password", "manage-organizations"]
  },
  {
    id: "faq",
    icon: "HelpCircle",
    titleKey: "help.categories.faq",
    descriptionKey: "help.categories.faqDesc",
    articleSlugs: ["faq-account", "faq-permissions", "faq-documents", "faq-workflows", "faq-notifications", "faq-security"]
  },
  {
    id: "troubleshooting",
    icon: "Wrench",
    titleKey: "help.categories.troubleshooting",
    descriptionKey: "help.categories.troubleshootingDesc",
    articleSlugs: ["trouble-login", "trouble-permissions", "trouble-document-access", "trouble-notifications", "trouble-workflow"]
  }
];

// --- Articles ---

export const HELP_ARTICLES: HelpArticle[] = [
  // Getting Started
  {
    slug: "getting-started",
    category: "getting-started",
    icon: "Rocket",
    titleKey: "help.articles.gettingStarted.title",
    summaryKey: "help.articles.gettingStarted.summary",
    contextualRoute: "/dashboard",
    keywords: ["começar", "iniciar", "primeiros passos", "start", "begin", "introdução"],
    sections: [
      { heading: "help.articles.gettingStarted.welcome", body: "help.articles.gettingStarted.welcomeBody" },
      { heading: "help.articles.gettingStarted.firstSteps", body: "help.articles.gettingStarted.firstStepsBody" },
      { heading: "help.articles.gettingStarted.sidebar", body: "help.articles.gettingStarted.sidebarBody" },
      { heading: "help.articles.gettingStarted.orgSwitcher", body: "help.articles.gettingStarted.orgSwitcherBody" }
    ],
    relatedSlugs: ["dashboard-guide", "navigation-guide", "profile-settings"]
  },
  {
    slug: "dashboard-guide",
    category: "getting-started",
    icon: "LayoutDashboard",
    titleKey: "help.articles.dashboard.title",
    summaryKey: "help.articles.dashboard.summary",
    contextualRoute: "/dashboard",
    keywords: ["dashboard", "painel", "métricas", "metrics", "atividade"],
    sections: [
      { heading: "help.articles.dashboard.overview", body: "help.articles.dashboard.overviewBody" },
      { heading: "help.articles.dashboard.metrics", body: "help.articles.dashboard.metricsBody" },
      { heading: "help.articles.dashboard.recentActivity", body: "help.articles.dashboard.recentActivityBody" },
      { heading: "help.articles.dashboard.pendingTasks", body: "help.articles.dashboard.pendingTasksBody" },
      { heading: "help.articles.dashboard.notifications", body: "help.articles.dashboard.notificationsBody" }
    ],
    relatedSlugs: ["getting-started", "navigation-guide", "tasks-overview", "notifications-overview", "custom-dashboards"]
  },
  {
    slug: "custom-dashboards",
    category: "getting-started",
    icon: "LayoutDashboard",
    titleKey: "help.articles.customDashboards.title",
    summaryKey: "help.articles.customDashboards.summary",
    contextualRoute: "/dashboard",
    keywords: ["dashboard", "widgets", "personalizar", "customize", "painel"],
    sections: [
      { heading: "help.articles.customDashboards.whatIs", body: "help.articles.customDashboards.whatIsBody" },
      { heading: "help.articles.customDashboards.create", body: "help.articles.customDashboards.createBody" },
      { heading: "help.articles.customDashboards.widgets", body: "help.articles.customDashboards.widgetsBody" },
      { heading: "help.articles.customDashboards.manage", body: "help.articles.customDashboards.manageBody" }
    ],
    relatedSlugs: ["dashboard-guide", "getting-started", "navigation-guide"]
  },
  {
    slug: "navigation-guide",
    category: "getting-started",
    icon: "Compass",
    titleKey: "help.articles.navigation.title",
    summaryKey: "help.articles.navigation.summary",
    keywords: ["navegação", "menu", "sidebar", "navigation", "menu"],
    sections: [
      { heading: "help.articles.navigation.sidebar", body: "help.articles.navigation.sidebarBody" },
      { heading: "help.articles.navigation.topbar", body: "help.articles.navigation.topbarBody" },
      { heading: "help.articles.navigation.language", body: "help.articles.navigation.languageBody" },
      { heading: "help.articles.navigation.theme", body: "help.articles.navigation.themeBody" }
    ],
    relatedSlugs: ["getting-started", "dashboard-guide", "manage-organizations"]
  },

  // Documents
  {
    slug: "documents-overview",
    category: "documents",
    icon: "FileText",
    titleKey: "help.articles.documentsOverview.title",
    summaryKey: "help.articles.documentsOverview.summary",
    contextualRoute: "/documents",
    keywords: ["documentos", "ficheiros", "files", "documents", "gestão"],
    sections: [
      { heading: "help.articles.documentsOverview.whatIs", body: "help.articles.documentsOverview.whatIsBody" },
      { heading: "help.articles.documentsOverview.access", body: "help.articles.documentsOverview.accessBody" },
      { heading: "help.articles.documentsOverview.permissions", body: "help.articles.documentsOverview.permissionsBody" },
      { heading: "help.articles.documentsOverview.actions", body: "help.articles.documentsOverview.actionsBody" }
    ],
    relatedSlugs: ["upload-document", "manage-folders", "share-document", "document-permissions", "recycle-bin", "document-comments", "checkout-checkin", "document-metadata"]
  },
  {
    slug: "upload-document",
    category: "documents",
    icon: "Upload",
    titleKey: "help.articles.uploadDocument.title",
    summaryKey: "help.articles.uploadDocument.summary",
    contextualRoute: "/documents",
    keywords: ["upload", "enviar", "carregar", "novo documento", "ficheiro"],
    sections: [
      { heading: "help.articles.uploadDocument.prerequisites", body: "help.articles.uploadDocument.prerequisitesBody" },
      { heading: "help.articles.uploadDocument.steps", body: "help.articles.uploadDocument.stepsBody" },
      { heading: "help.articles.uploadDocument.maxSize", body: "help.articles.uploadDocument.maxSizeBody" },
      { heading: "help.articles.uploadDocument.supportedTypes", body: "help.articles.uploadDocument.supportedTypesBody" },
      { heading: "help.articles.uploadDocument.dragDrop", body: "help.articles.uploadDocument.dragDropBody" },
      { heading: "help.articles.uploadDocument.folderUpload", body: "help.articles.uploadDocument.folderUploadBody" }
    ],
    relatedSlugs: ["documents-overview", "document-versions", "manage-folders", "document-templates"]
  },
  {
    slug: "document-templates",
    category: "documents",
    icon: "FileBadge",
    titleKey: "help.articles.documentTemplates.title",
    summaryKey: "help.articles.documentTemplates.summary",
    contextualRoute: "/documents",
    keywords: ["template", "modelo", "reutilizar", "reuse", "documents"],
    sections: [
      { heading: "help.articles.documentTemplates.whatIs", body: "help.articles.documentTemplates.whatIsBody" },
      { heading: "help.articles.documentTemplates.mark", body: "help.articles.documentTemplates.markBody" },
      { heading: "help.articles.documentTemplates.use", body: "help.articles.documentTemplates.useBody" }
    ],
    relatedSlugs: ["upload-document", "saved-views", "documents-overview"]
  },
  {
    slug: "saved-views",
    category: "documents",
    icon: "Bookmark",
    titleKey: "help.articles.savedViews.title",
    summaryKey: "help.articles.savedViews.summary",
    contextualRoute: "/documents",
    keywords: ["vistas", "views", "filtros", "filters", "guardar", "saved"],
    sections: [
      { heading: "help.articles.savedViews.whatIs", body: "help.articles.savedViews.whatIsBody" },
      { heading: "help.articles.savedViews.save", body: "help.articles.savedViews.saveBody" },
      { heading: "help.articles.savedViews.apply", body: "help.articles.savedViews.applyBody" },
      { heading: "help.articles.savedViews.manage", body: "help.articles.savedViews.manageBody" }
    ],
    relatedSlugs: ["documents-overview", "document-templates", "tasks-overview"]
  },
  {
    slug: "manage-folders",
    category: "documents",
    icon: "Folder",
    titleKey: "help.articles.manageFolders.title",
    summaryKey: "help.articles.manageFolders.summary",
    contextualRoute: "/documents",
    keywords: ["pastas", "folders", "organizar", "estrutura", "diretórios"],
    sections: [
      { heading: "help.articles.manageFolders.create", body: "help.articles.manageFolders.createBody" },
      { heading: "help.articles.manageFolders.navigate", body: "help.articles.manageFolders.navigateBody" },
      { heading: "help.articles.manageFolders.rename", body: "help.articles.manageFolders.renameBody" },
      { heading: "help.articles.manageFolders.move", body: "help.articles.manageFolders.moveBody" },
      { heading: "help.articles.manageFolders.delete", body: "help.articles.manageFolders.deleteBody" }
    ],
    relatedSlugs: ["documents-overview", "upload-document", "document-permissions"]
  },
  {
    slug: "document-versions",
    category: "documents",
    icon: "GitCommit",
    titleKey: "help.articles.documentVersions.title",
    summaryKey: "help.articles.documentVersions.summary",
    contextualRoute: "/documents",
    keywords: ["versões", "versions", "histórico", "restore", "restaurar"],
    sections: [
      { heading: "help.articles.documentVersions.whatIs", body: "help.articles.documentVersions.whatIsBody" },
      { heading: "help.articles.documentVersions.upload", body: "help.articles.documentVersions.uploadBody" },
      { heading: "help.articles.documentVersions.download", body: "help.articles.documentVersions.downloadBody" },
      { heading: "help.articles.documentVersions.restore", body: "help.articles.documentVersions.restoreBody" }
    ],
    relatedSlugs: ["documents-overview", "upload-document"]
  },
  {
    slug: "share-document",
    category: "documents",
    icon: "Share2",
    titleKey: "help.articles.shareDocument.title",
    summaryKey: "help.articles.shareDocument.summary",
    contextualRoute: "/documents",
    keywords: ["partilhar", "share", "link", "público", "externo"],
    sections: [
      { heading: "help.articles.shareDocument.methods", body: "help.articles.shareDocument.methodsBody" },
      { heading: "help.articles.shareDocument.userShare", body: "help.articles.shareDocument.userShareBody" },
      { heading: "help.articles.shareDocument.linkShare", body: "help.articles.shareDocument.linkShareBody" },
      { heading: "help.articles.shareDocument.password", body: "help.articles.shareDocument.passwordBody" },
      { heading: "help.articles.shareDocument.revoke", body: "help.articles.shareDocument.revokeBody" }
    ],
    relatedSlugs: ["documents-overview", "document-permissions"]
  },
  {
    slug: "document-permissions",
    category: "documents",
    icon: "Lock",
    titleKey: "help.articles.documentPermissions.title",
    summaryKey: "help.articles.documentPermissions.summary",
    contextualRoute: "/documents",
    keywords: ["permissões", "permissions", "acesso", "view", "edit", "delete", "share"],
    sections: [
      { heading: "help.articles.documentPermissions.levels", body: "help.articles.documentPermissions.levelsBody" },
      { heading: "help.articles.documentPermissions.grant", body: "help.articles.documentPermissions.grantBody" },
      { heading: "help.articles.documentPermissions.teamShare", body: "help.articles.documentPermissions.teamShareBody" },
      { heading: "help.articles.documentPermissions.orgShare", body: "help.articles.documentPermissions.orgShareBody" }
    ],
    relatedSlugs: ["documents-overview", "share-document", "manage-roles"]
  },
  {
    slug: "recycle-bin",
    category: "documents",
    icon: "Trash2",
    titleKey: "help.articles.recycleBin.title",
    summaryKey: "help.articles.recycleBin.summary",
    contextualRoute: "/documents/trash",
    keywords: ["reciclagem", "lixo", "recycle bin", "trash", "eliminar", "restaurar", "purgar"],
    sections: [
      { heading: "help.articles.recycleBin.whatIs", body: "help.articles.recycleBin.whatIsBody" },
      { heading: "help.articles.recycleBin.howToDelete", body: "help.articles.recycleBin.howToDeleteBody" },
      { heading: "help.articles.recycleBin.howToRestore", body: "help.articles.recycleBin.howToRestoreBody" },
      { heading: "help.articles.recycleBin.purge", body: "help.articles.recycleBin.purgeBody" },
      { heading: "help.articles.recycleBin.retention", body: "help.articles.recycleBin.retentionBody" },
      { heading: "help.articles.recycleBin.permissions", body: "help.articles.recycleBin.permissionsBody" }
    ],
    relatedSlugs: ["documents-overview", "manage-folders", "document-permissions", "organization-settings"]
  },
  {
    slug: "document-comments",
    category: "documents",
    icon: "MessageSquare",
    titleKey: "help.articles.documentComments.title",
    summaryKey: "help.articles.documentComments.summary",
    contextualRoute: "/documents",
    keywords: ["comentário", "comentários", "menção", "comment", "mention", "discussão"],
    sections: [
      { heading: "help.articles.documentComments.whatIs", body: "help.articles.documentComments.whatIsBody" },
      { heading: "help.articles.documentComments.add", body: "help.articles.documentComments.addBody" },
      { heading: "help.articles.documentComments.mentions", body: "help.articles.documentComments.mentionsBody" },
      { heading: "help.articles.documentComments.delete", body: "help.articles.documentComments.deleteBody" },
      { heading: "help.articles.documentComments.notifications", body: "help.articles.documentComments.notificationsBody" }
    ],
    relatedSlugs: ["documents-overview", "notifications-overview", "task-comments"]
  },
  {
    slug: "checkout-checkin",
    category: "documents",
    icon: "Lock",
    titleKey: "help.articles.checkoutCheckin.title",
    summaryKey: "help.articles.checkoutCheckin.summary",
    contextualRoute: "/documents",
    keywords: ["check-out", "check-in", "bloquear", "lock", "checkout", "exclusivo"],
    sections: [
      { heading: "help.articles.checkoutCheckin.whatIs", body: "help.articles.checkoutCheckin.whatIsBody" },
      { heading: "help.articles.checkoutCheckin.checkOut", body: "help.articles.checkoutCheckin.checkOutBody" },
      { heading: "help.articles.checkoutCheckin.blockedActions", body: "help.articles.checkoutCheckin.blockedActionsBody" },
      { heading: "help.articles.checkoutCheckin.checkIn", body: "help.articles.checkoutCheckin.checkInBody" },
      { heading: "help.articles.checkoutCheckin.forceCheckIn", body: "help.articles.checkoutCheckin.forceCheckInBody" }
    ],
    relatedSlugs: ["documents-overview", "document-versions", "trouble-document-access"]
  },
  {
    slug: "document-metadata",
    category: "documents",
    icon: "Tags",
    titleKey: "help.articles.documentMetadata.title",
    summaryKey: "help.articles.documentMetadata.summary",
    contextualRoute: "/documents",
    keywords: ["metadados", "metadata", "colunas", "campos", "fields", "columns", "personalizado"],
    sections: [
      { heading: "help.articles.documentMetadata.whatIs", body: "help.articles.documentMetadata.whatIsBody" },
      { heading: "help.articles.documentMetadata.defineFields", body: "help.articles.documentMetadata.defineFieldsBody" },
      { heading: "help.articles.documentMetadata.inheritance", body: "help.articles.documentMetadata.inheritanceBody" },
      { heading: "help.articles.documentMetadata.fillValues", body: "help.articles.documentMetadata.fillValuesBody" },
      { heading: "help.articles.documentMetadata.columns", body: "help.articles.documentMetadata.columnsBody" },
      { heading: "help.articles.documentMetadata.search", body: "help.articles.documentMetadata.searchBody" }
    ],
    relatedSlugs: ["documents-overview", "manage-folders", "search-overview"]
  },

  // Lists
  {
    slug: "lists-overview",
    category: "lists",
    icon: "List",
    titleKey: "help.articles.listsOverview.title",
    summaryKey: "help.articles.listsOverview.summary",
    contextualRoute: "/lists",
    keywords: ["listas", "lists", "registos", "dados", "tabelas"],
    sections: [
      { heading: "help.articles.listsOverview.whatIs", body: "help.articles.listsOverview.whatIsBody" },
      { heading: "help.articles.listsOverview.access", body: "help.articles.listsOverview.accessBody" },
      { heading: "help.articles.listsOverview.fields", body: "help.articles.listsOverview.fieldsBody" },
      { heading: "help.articles.listsOverview.actions", body: "help.articles.listsOverview.actionsBody" }
    ],
    relatedSlugs: ["create-list", "manage-list-items", "export-list-csv"]
  },
  {
    slug: "create-list",
    category: "lists",
    icon: "Plus",
    titleKey: "help.articles.createList.title",
    summaryKey: "help.articles.createList.summary",
    contextualRoute: "/lists",
    keywords: ["criar lista", "nova lista", "create list", "campos", "fields"],
    sections: [
      { heading: "help.articles.createList.prerequisites", body: "help.articles.createList.prerequisitesBody" },
      { heading: "help.articles.createList.steps", body: "help.articles.createList.stepsBody" },
      { heading: "help.articles.createList.fieldTypes", body: "help.articles.createList.fieldTypesBody" },
      { heading: "help.articles.createList.builder", body: "help.articles.createList.builderBody" }
    ],
    relatedSlugs: ["lists-overview", "manage-list-items", "export-list-csv"]
  },
  {
    slug: "manage-list-items",
    category: "lists",
    icon: "Database",
    titleKey: "help.articles.manageListItems.title",
    summaryKey: "help.articles.manageListItems.summary",
    contextualRoute: "/lists",
    keywords: ["registos", "items", "adicionar", "editar", "eliminar"],
    sections: [
      { heading: "help.articles.manageListItems.add", body: "help.articles.manageListItems.addBody" },
      { heading: "help.articles.manageListItems.edit", body: "help.articles.manageListItems.editBody" },
      { heading: "help.articles.manageListItems.delete", body: "help.articles.manageListItems.deleteBody" },
      { heading: "help.articles.manageListItems.search", body: "help.articles.manageListItems.searchBody" }
    ],
    relatedSlugs: ["lists-overview", "create-list", "export-list-csv"]
  },
  {
    slug: "export-list-csv",
    category: "lists",
    icon: "Download",
    titleKey: "help.articles.exportListCsv.title",
    summaryKey: "help.articles.exportListCsv.summary",
    contextualRoute: "/lists",
    keywords: ["exportar", "csv", "download", "excel"],
    sections: [
      { heading: "help.articles.exportListCsv.howTo", body: "help.articles.exportListCsv.howToBody" },
      { heading: "help.articles.exportListCsv.format", body: "help.articles.exportListCsv.formatBody" }
    ],
    relatedSlugs: ["lists-overview", "manage-list-items"]
  },

  // Forms
  {
    slug: "forms-overview",
    category: "forms",
    icon: "FilePlus",
    titleKey: "help.articles.formsOverview.title",
    summaryKey: "help.articles.formsOverview.summary",
    contextualRoute: "/forms",
    keywords: ["formulários", "forms", "submissões", "respostas"],
    sections: [
      { heading: "help.articles.formsOverview.whatIs", body: "help.articles.formsOverview.whatIsBody" },
      { heading: "help.articles.formsOverview.status", body: "help.articles.formsOverview.statusBody" },
      { heading: "help.articles.formsOverview.access", body: "help.articles.formsOverview.accessBody" }
    ],
    relatedSlugs: ["form-builder", "form-submissions", "publish-form"]
  },
  {
    slug: "form-builder",
    category: "forms",
    icon: "Wrench",
    titleKey: "help.articles.formBuilder.title",
    summaryKey: "help.articles.formBuilder.summary",
    contextualRoute: "/forms",
    keywords: ["builder", "construtor", "campos", "tipos", "editor"],
    sections: [
      { heading: "help.articles.formBuilder.access", body: "help.articles.formBuilder.accessBody" },
      { heading: "help.articles.formBuilder.fieldTypes", body: "help.articles.formBuilder.fieldTypesBody" },
      { heading: "help.articles.formBuilder.addField", body: "help.articles.formBuilder.addFieldBody" },
      { heading: "help.articles.formBuilder.options", body: "help.articles.formBuilder.optionsBody" },
      { heading: "help.articles.formBuilder.preview", body: "help.articles.formBuilder.previewBody" }
    ],
    relatedSlugs: ["forms-overview", "form-submissions", "publish-form"]
  },
  {
    slug: "form-submissions",
    category: "forms",
    icon: "Inbox",
    titleKey: "help.articles.formSubmissions.title",
    summaryKey: "help.articles.formSubmissions.summary",
    contextualRoute: "/forms",
    keywords: ["submissões", "submissions", "respostas", "exportar"],
    sections: [
      { heading: "help.articles.formSubmissions.view", body: "help.articles.formSubmissions.viewBody" },
      { heading: "help.articles.formSubmissions.export", body: "help.articles.formSubmissions.exportBody" },
      { heading: "help.articles.formSubmissions.requirements", body: "help.articles.formSubmissions.requirementsBody" }
    ],
    relatedSlugs: ["forms-overview", "form-builder", "publish-form"]
  },
  {
    slug: "publish-form",
    category: "forms",
    icon: "Send",
    titleKey: "help.articles.publishForm.title",
    summaryKey: "help.articles.publishForm.summary",
    contextualRoute: "/forms",
    keywords: ["publicar", "publish", "arquivar", "rascunho", "draft"],
    sections: [
      { heading: "help.articles.publishForm.howTo", body: "help.articles.publishForm.howToBody" },
      { heading: "help.articles.publishForm.archive", body: "help.articles.publishForm.archiveBody" },
      { heading: "help.articles.publishForm.effect", body: "help.articles.publishForm.effectBody" }
    ],
    relatedSlugs: ["forms-overview", "form-builder", "form-submissions"]
  },

  // Tasks
  {
    slug: "tasks-overview",
    category: "tasks",
    icon: "CheckSquare",
    titleKey: "help.articles.tasksOverview.title",
    summaryKey: "help.articles.tasksOverview.summary",
    contextualRoute: "/tasks",
    keywords: ["tarefas", "tasks", "gestão", "kanban", "lista", "calendário"],
    sections: [
      { heading: "help.articles.tasksOverview.whatIs", body: "help.articles.tasksOverview.whatIsBody" },
      { heading: "help.articles.tasksOverview.views", body: "help.articles.tasksOverview.viewsBody" },
      { heading: "help.articles.tasksOverview.status", body: "help.articles.tasksOverview.statusBody" },
      { heading: "help.articles.tasksOverview.priority", body: "help.articles.tasksOverview.priorityBody" }
    ],
    relatedSlugs: ["create-task", "task-views", "task-comments", "task-projects"]
  },
  {
    slug: "create-task",
    category: "tasks",
    icon: "Plus",
    titleKey: "help.articles.createTask.title",
    summaryKey: "help.articles.createTask.summary",
    contextualRoute: "/tasks",
    keywords: ["criar tarefa", "nova tarefa", "atribuir", "assign"],
    sections: [
      { heading: "help.articles.createTask.steps", body: "help.articles.createTask.stepsBody" },
      { heading: "help.articles.createTask.fields", body: "help.articles.createTask.fieldsBody" },
      { heading: "help.articles.createTask.assign", body: "help.articles.createTask.assignBody" },
      { heading: "help.articles.createTask.linkDocument", body: "help.articles.createTask.linkDocumentBody" }
    ],
    relatedSlugs: ["tasks-overview", "task-views", "task-comments"]
  },
  {
    slug: "task-views",
    category: "tasks",
    icon: "LayoutGrid",
    titleKey: "help.articles.taskViews.title",
    summaryKey: "help.articles.taskViews.summary",
    contextualRoute: "/tasks",
    keywords: ["vista", "views", "kanban", "lista", "calendário", "calendar"],
    sections: [
      { heading: "help.articles.taskViews.listView", body: "help.articles.taskViews.listViewBody" },
      { heading: "help.articles.taskViews.kanbanView", body: "help.articles.taskViews.kanbanViewBody" },
      { heading: "help.articles.taskViews.calendarView", body: "help.articles.taskViews.calendarViewBody" },
      { heading: "help.articles.taskViews.switch", body: "help.articles.taskViews.switchBody" }
    ],
    relatedSlugs: ["tasks-overview", "create-task"]
  },
  {
    slug: "task-comments",
    category: "tasks",
    icon: "MessageSquare",
    titleKey: "help.articles.taskComments.title",
    summaryKey: "help.articles.taskComments.summary",
    contextualRoute: "/tasks",
    keywords: ["comentários", "comments", "discussão", "conversa"],
    sections: [
      { heading: "help.articles.taskComments.add", body: "help.articles.taskComments.addBody" },
      { heading: "help.articles.taskComments.delete", body: "help.articles.taskComments.deleteBody" }
    ],
    relatedSlugs: ["tasks-overview", "create-task"]
  },
  {
    slug: "task-projects",
    category: "tasks",
    icon: "FolderKanban",
    titleKey: "help.articles.taskProjects.title",
    summaryKey: "help.articles.taskProjects.summary",
    contextualRoute: "/tasks",
    keywords: ["projetos", "projects", "agrupar", "organizar"],
    sections: [
      { heading: "help.articles.taskProjects.whatIs", body: "help.articles.taskProjects.whatIsBody" },
      { heading: "help.articles.taskProjects.create", body: "help.articles.taskProjects.createBody" },
      { heading: "help.articles.taskProjects.assign", body: "help.articles.taskProjects.assignBody" }
    ],
    relatedSlugs: ["tasks-overview", "create-task"]
  },

  // Workflows
  {
    slug: "workflows-overview",
    category: "workflows",
    icon: "GitBranch",
    titleKey: "help.articles.workflowsOverview.title",
    summaryKey: "help.articles.workflowsOverview.summary",
    contextualRoute: "/workflows",
    keywords: ["workflows", "processos", "automação", "process"],
    sections: [
      { heading: "help.articles.workflowsOverview.whatIs", body: "help.articles.workflowsOverview.whatIsBody" },
      { heading: "help.articles.workflowsOverview.status", body: "help.articles.workflowsOverview.statusBody" },
      { heading: "help.articles.workflowsOverview.lifecycle", body: "help.articles.workflowsOverview.lifecycleBody" }
    ],
    relatedSlugs: ["workflow-builder", "workflow-steps", "run-workflow", "workflow-instances"]
  },
  {
    slug: "workflow-builder",
    category: "workflows",
    icon: "Wrench",
    titleKey: "help.articles.workflowBuilder.title",
    summaryKey: "help.articles.workflowBuilder.summary",
    contextualRoute: "/workflows",
    keywords: ["builder", "construtor", "editor", "passos", "steps"],
    sections: [
      { heading: "help.articles.workflowBuilder.access", body: "help.articles.workflowBuilder.accessBody" },
      { heading: "help.articles.workflowBuilder.addStep", body: "help.articles.workflowBuilder.addStepBody" },
      { heading: "help.articles.workflowBuilder.configure", body: "help.articles.workflowBuilder.configureBody" },
      { heading: "help.articles.workflowBuilder.save", body: "help.articles.workflowBuilder.saveBody" }
    ],
    relatedSlugs: ["workflows-overview", "workflow-steps", "run-workflow"]
  },
  {
    slug: "workflow-steps",
    category: "workflows",
    icon: "ListOrdered",
    titleKey: "help.articles.workflowSteps.title",
    summaryKey: "help.articles.workflowSteps.summary",
    contextualRoute: "/workflows",
    keywords: ["passos", "steps", "tipos", "approval", "notification", "task"],
    sections: [
      { heading: "help.articles.workflowSteps.types", body: "help.articles.workflowSteps.typesBody" },
      { heading: "help.articles.workflowSteps.start", body: "help.articles.workflowSteps.startBody" },
      { heading: "help.articles.workflowSteps.createTask", body: "help.articles.workflowSteps.createTaskBody" },
      { heading: "help.articles.workflowSteps.notification", body: "help.articles.workflowSteps.notificationBody" },
      { heading: "help.articles.workflowSteps.approval", body: "help.articles.workflowSteps.approvalBody" },
      { heading: "help.articles.workflowSteps.end", body: "help.articles.workflowSteps.endBody" }
    ],
    relatedSlugs: ["workflows-overview", "workflow-builder", "run-workflow"]
  },
  {
    slug: "run-workflow",
    category: "workflows",
    icon: "Play",
    titleKey: "help.articles.runWorkflow.title",
    summaryKey: "help.articles.runWorkflow.summary",
    contextualRoute: "/workflows",
    keywords: ["executar", "run", "start", "iniciar", "publicar"],
    sections: [
      { heading: "help.articles.runWorkflow.publish", body: "help.articles.runWorkflow.publishBody" },
      { heading: "help.articles.runWorkflow.start", body: "help.articles.runWorkflow.startBody" },
      { heading: "help.articles.runWorkflow.input", body: "help.articles.runWorkflow.inputBody" }
    ],
    relatedSlugs: ["workflows-overview", "workflow-builder", "workflow-instances"]
  },
  {
    slug: "workflow-instances",
    category: "workflows",
    icon: "Activity",
    titleKey: "help.articles.workflowInstances.title",
    summaryKey: "help.articles.workflowInstances.summary",
    contextualRoute: "/workflows",
    keywords: ["instâncias", "instances", "execução", "estado", "cancelar"],
    sections: [
      { heading: "help.articles.workflowInstances.view", body: "help.articles.workflowInstances.viewBody" },
      { heading: "help.articles.workflowInstances.status", body: "help.articles.workflowInstances.statusBody" },
      { heading: "help.articles.workflowInstances.cancel", body: "help.articles.workflowInstances.cancelBody" },
      { heading: "help.articles.workflowInstances.executions", body: "help.articles.workflowInstances.executionsBody" }
    ],
    relatedSlugs: ["workflows-overview", "run-workflow", "approvals-overview"]
  },

  // Approvals
  {
    slug: "approvals-overview",
    category: "approvals",
    icon: "CheckCheck",
    titleKey: "help.articles.approvalsOverview.title",
    summaryKey: "help.articles.approvalsOverview.summary",
    contextualRoute: "/approvals",
    keywords: ["aprovações", "approvals", "aprovar", "rejeitar", "decisão"],
    sections: [
      { heading: "help.articles.approvalsOverview.whatIs", body: "help.articles.approvalsOverview.whatIsBody" },
      { heading: "help.articles.approvalsOverview.access", body: "help.articles.approvalsOverview.accessBody" },
      { heading: "help.articles.approvalsOverview.status", body: "help.articles.approvalsOverview.statusBody" },
      { heading: "help.articles.approvalsOverview.scope", body: "help.articles.approvalsOverview.scopeBody" }
    ],
    relatedSlugs: ["approve-reject", "delegate-approval", "approval-comments", "workflow-instances"]
  },
  {
    slug: "approve-reject",
    category: "approvals",
    icon: "Check",
    titleKey: "help.articles.approveReject.title",
    summaryKey: "help.articles.approveReject.summary",
    contextualRoute: "/approvals",
    keywords: ["aprovar", "approve", "rejeitar", "reject", "decidir", "decision"],
    sections: [
      { heading: "help.articles.approveReject.howTo", body: "help.articles.approveReject.howToBody" },
      { heading: "help.articles.approveReject.note", body: "help.articles.approveReject.noteBody" },
      { heading: "help.articles.approveReject.effect", body: "help.articles.approveReject.effectBody" }
    ],
    relatedSlugs: ["approvals-overview", "delegate-approval", "approval-comments"]
  },
  {
    slug: "delegate-approval",
    category: "approvals",
    icon: "Forward",
    titleKey: "help.articles.delegateApproval.title",
    summaryKey: "help.articles.delegateApproval.summary",
    contextualRoute: "/approvals",
    keywords: ["delegar", "delegate", "transferir", "encaminhar"],
    sections: [
      { heading: "help.articles.delegateApproval.howTo", body: "help.articles.delegateApproval.howToBody" },
      { heading: "help.articles.delegateApproval.reason", body: "help.articles.delegateApproval.reasonBody" }
    ],
    relatedSlugs: ["approvals-overview", "approve-reject", "approval-comments"]
  },
  {
    slug: "approval-comments",
    category: "approvals",
    icon: "MessageSquare",
    titleKey: "help.articles.approvalComments.title",
    summaryKey: "help.articles.approvalComments.summary",
    contextualRoute: "/approvals",
    keywords: ["comentários", "comments", "discussão", "aprovação"],
    sections: [
      { heading: "help.articles.approvalComments.add", body: "help.articles.approvalComments.addBody" }
    ],
    relatedSlugs: ["approvals-overview", "approve-reject", "delegate-approval"]
  },

  // Notifications
  {
    slug: "notifications-overview",
    category: "notifications",
    icon: "Bell",
    titleKey: "help.articles.notificationsOverview.title",
    summaryKey: "help.articles.notificationsOverview.summary",
    contextualRoute: "/notifications",
    keywords: ["notificações", "notifications", "alertas", "avisos"],
    sections: [
      { heading: "help.articles.notificationsOverview.whatIs", body: "help.articles.notificationsOverview.whatIsBody" },
      { heading: "help.articles.notificationsOverview.types", body: "help.articles.notificationsOverview.typesBody" },
      { heading: "help.articles.notificationsOverview.badge", body: "help.articles.notificationsOverview.badgeBody" }
    ],
    relatedSlugs: ["manage-notifications", "navigation-guide"]
  },
  {
    slug: "manage-notifications",
    category: "notifications",
    icon: "CheckCheck",
    titleKey: "help.articles.manageNotifications.title",
    summaryKey: "help.articles.manageNotifications.summary",
    contextualRoute: "/notifications",
    keywords: ["marcar", "ler", "read", "filtros", "filter"],
    sections: [
      { heading: "help.articles.manageNotifications.markRead", body: "help.articles.manageNotifications.markReadBody" },
      { heading: "help.articles.manageNotifications.markAll", body: "help.articles.manageNotifications.markAllBody" },
      { heading: "help.articles.manageNotifications.filter", body: "help.articles.manageNotifications.filterBody" }
    ],
    relatedSlugs: ["notifications-overview", "subscriptions-alerts"]
  },
  {
    slug: "subscriptions-alerts",
    category: "notifications",
    icon: "BellRing",
    titleKey: "help.articles.subscriptionsAlerts.title",
    summaryKey: "help.articles.subscriptionsAlerts.summary",
    contextualRoute: "/notifications",
    keywords: ["alertas", "alerts", "subscrições", "subscriptions", "seguir", "watch"],
    sections: [
      { heading: "help.articles.subscriptionsAlerts.whatIs", body: "help.articles.subscriptionsAlerts.whatIsBody" },
      { heading: "help.articles.subscriptionsAlerts.subscribe", body: "help.articles.subscriptionsAlerts.subscribeBody" },
      { heading: "help.articles.subscriptionsAlerts.manage", body: "help.articles.subscriptionsAlerts.manageBody" }
    ],
    relatedSlugs: ["notifications-overview", "manage-notifications", "tasks-overview"]
  },

  // Search
  {
    slug: "search-overview",
    category: "search",
    icon: "Search",
    titleKey: "help.articles.searchOverview.title",
    summaryKey: "help.articles.searchOverview.summary",
    contextualRoute: "/search",
    keywords: ["pesquisa", "search", "procurar", "encontrar", "global", "conteúdo", "content", "snippet"],
    sections: [
      { heading: "help.articles.searchOverview.whatIs", body: "help.articles.searchOverview.whatIsBody" },
      { heading: "help.articles.searchOverview.howTo", body: "help.articles.searchOverview.howToBody" },
      { heading: "help.articles.searchOverview.results", body: "help.articles.searchOverview.resultsBody" },
      { heading: "help.articles.searchOverview.content", body: "help.articles.searchOverview.contentBody" },
      { heading: "help.articles.searchOverview.permissions", body: "help.articles.searchOverview.permissionsBody" }
    ],
    relatedSlugs: ["search-filters", "navigation-guide"]
  },
  {
    slug: "search-filters",
    category: "search",
    icon: "Filter",
    titleKey: "help.articles.searchFilters.title",
    summaryKey: "help.articles.searchFilters.summary",
    contextualRoute: "/search",
    keywords: ["filtros", "filters", "tipo", "data", "autor"],
    sections: [
      { heading: "help.articles.searchFilters.types", body: "help.articles.searchFilters.typesBody" },
      { heading: "help.articles.searchFilters.date", body: "help.articles.searchFilters.dateBody" },
      { heading: "help.articles.searchFilters.author", body: "help.articles.searchFilters.authorBody" }
    ],
    relatedSlugs: ["search-overview"]
  },

  // AI
  {
    slug: "ai-overview",
    category: "ai",
    icon: "Sparkles",
    titleKey: "help.articles.aiOverview.title",
    summaryKey: "help.articles.aiOverview.summary",
    contextualRoute: "/ai",
    keywords: ["ia", "ai", "assistente", "inteligência artificial", "chat"],
    sections: [
      { heading: "help.articles.aiOverview.whatIs", body: "help.articles.aiOverview.whatIsBody" },
      { heading: "help.articles.aiOverview.access", body: "help.articles.aiOverview.accessBody" },
      { heading: "help.articles.aiOverview.permissions", body: "help.articles.aiOverview.permissionsBody" },
      { heading: "help.articles.aiOverview.usage", body: "help.articles.aiOverview.usageBody" }
    ],
    relatedSlugs: ["ai-document-operations", "ai-create-list", "ai-create-workflow", "ai-reports"]
  },
  {
    slug: "ai-document-operations",
    category: "ai",
    icon: "FileText",
    titleKey: "help.articles.aiDocumentOps.title",
    summaryKey: "help.articles.aiDocumentOps.summary",
    contextualRoute: "/ai",
    keywords: ["resumir", "summarize", "classificar", "classify", "perguntas", "qa"],
    sections: [
      { heading: "help.articles.aiDocumentOps.summarize", body: "help.articles.aiDocumentOps.summarizeBody" },
      { heading: "help.articles.aiDocumentOps.qa", body: "help.articles.aiDocumentOps.qaBody" },
      { heading: "help.articles.aiDocumentOps.classify", body: "help.articles.aiDocumentOps.classifyBody" }
    ],
    relatedSlugs: ["ai-overview", "documents-overview"]
  },
  {
    slug: "ai-create-list",
    category: "ai",
    icon: "List",
    titleKey: "help.articles.aiCreateList.title",
    summaryKey: "help.articles.aiCreateList.summary",
    contextualRoute: "/ai",
    keywords: ["criar lista", "ia", "propor", "proposal"],
    sections: [
      { heading: "help.articles.aiCreateList.howTo", body: "help.articles.aiCreateList.howToBody" },
      { heading: "help.articles.aiCreateList.confirm", body: "help.articles.aiCreateList.confirmBody" }
    ],
    relatedSlugs: ["ai-overview", "create-list"]
  },
  {
    slug: "ai-create-workflow",
    category: "ai",
    icon: "GitBranch",
    titleKey: "help.articles.aiCreateWorkflow.title",
    summaryKey: "help.articles.aiCreateWorkflow.summary",
    contextualRoute: "/ai",
    keywords: ["criar workflow", "ia", "propor", "processo"],
    sections: [
      { heading: "help.articles.aiCreateWorkflow.howTo", body: "help.articles.aiCreateWorkflow.howToBody" },
      { heading: "help.articles.aiCreateWorkflow.confirm", body: "help.articles.aiCreateWorkflow.confirmBody" }
    ],
    relatedSlugs: ["ai-overview", "workflow-builder"]
  },
  {
    slug: "ai-reports",
    category: "ai",
    icon: "BarChart3",
    titleKey: "help.articles.aiReports.title",
    summaryKey: "help.articles.aiReports.summary",
    contextualRoute: "/ai",
    keywords: ["relatório", "report", "resumo", "sumário"],
    sections: [
      { heading: "help.articles.aiReports.howTo", body: "help.articles.aiReports.howToBody" }
    ],
    relatedSlugs: ["ai-overview"]
  },

  // Admin
  {
    slug: "admin-overview",
    category: "admin",
    icon: "Shield",
    titleKey: "help.articles.adminOverview.title",
    summaryKey: "help.articles.adminOverview.summary",
    contextualRoute: "/admin",
    keywords: ["administração", "admin", "gestão", "configuração"],
    sections: [
      { heading: "help.articles.adminOverview.whatIs", body: "help.articles.adminOverview.whatIsBody" },
      { heading: "help.articles.adminOverview.access", body: "help.articles.adminOverview.accessBody" },
      { heading: "help.articles.adminOverview.sections", body: "help.articles.adminOverview.sectionsBody" }
    ],
    relatedSlugs: ["manage-users", "manage-teams", "manage-roles", "audit-logs", "organization-settings"]
  },
  {
    slug: "manage-users",
    category: "admin",
    icon: "Users",
    titleKey: "help.articles.manageUsers.title",
    summaryKey: "help.articles.manageUsers.summary",
    contextualRoute: "/admin/users",
    keywords: ["utilizadores", "users", "criar", "suspender", "função"],
    sections: [
      { heading: "help.articles.manageUsers.invite", body: "help.articles.manageUsers.inviteBody" },
      { heading: "help.articles.manageUsers.create", body: "help.articles.manageUsers.createBody" },
      { heading: "help.articles.manageUsers.update", body: "help.articles.manageUsers.updateBody" },
      { heading: "help.articles.manageUsers.suspend", body: "help.articles.manageUsers.suspendBody" },
      { heading: "help.articles.manageUsers.remove", body: "help.articles.manageUsers.removeBody" },
      { heading: "help.articles.manageUsers.permissions", body: "help.articles.manageUsers.permissionsBody" }
    ],
    relatedSlugs: ["admin-overview", "invite-team", "manage-roles", "manage-teams"]
  },
  {
    slug: "invite-team",
    category: "admin",
    icon: "UserPlus",
    titleKey: "help.articles.inviteTeam.title",
    summaryKey: "help.articles.inviteTeam.summary",
    contextualRoute: "/admin/users",
    keywords: ["convite", "invite", "equipa", "team", "onboarding", "email", "adicionar", "colaborador"],
    sections: [
      { heading: "help.articles.inviteTeam.howItWorks", body: "help.articles.inviteTeam.howItWorksBody" },
      { heading: "help.articles.inviteTeam.send", body: "help.articles.inviteTeam.sendBody" },
      { heading: "help.articles.inviteTeam.noEmail", body: "help.articles.inviteTeam.noEmailBody" },
      { heading: "help.articles.inviteTeam.accept", body: "help.articles.inviteTeam.acceptBody" },
      { heading: "help.articles.inviteTeam.pending", body: "help.articles.inviteTeam.pendingBody" },
      { heading: "help.articles.inviteTeam.expiry", body: "help.articles.inviteTeam.expiryBody" }
    ],
    relatedSlugs: ["manage-users", "manage-roles", "admin-overview"]
  },
  {
    slug: "manage-teams",
    category: "admin",
    icon: "Users",
    titleKey: "help.articles.manageTeams.title",
    summaryKey: "help.articles.manageTeams.summary",
    contextualRoute: "/admin/teams",
    keywords: ["equipas", "teams", "membros", "criar"],
    sections: [
      { heading: "help.articles.manageTeams.create", body: "help.articles.manageTeams.createBody" },
      { heading: "help.articles.manageTeams.members", body: "help.articles.manageTeams.membersBody" },
      { heading: "help.articles.manageTeams.delete", body: "help.articles.manageTeams.deleteBody" }
    ],
    relatedSlugs: ["admin-overview", "manage-users"]
  },
  {
    slug: "manage-roles",
    category: "admin",
    icon: "Key",
    titleKey: "help.articles.manageRoles.title",
    summaryKey: "help.articles.manageRoles.summary",
    contextualRoute: "/admin/roles",
    keywords: ["funções", "roles", "permissões", "permissions", "rbac"],
    sections: [
      { heading: "help.articles.manageRoles.whatIs", body: "help.articles.manageRoles.whatIsBody" },
      { heading: "help.articles.manageRoles.create", body: "help.articles.manageRoles.createBody" },
      { heading: "help.articles.manageRoles.permissions", body: "help.articles.manageRoles.permissionsBody" },
      { heading: "help.articles.manageRoles.system", body: "help.articles.manageRoles.systemBody" },
      { heading: "help.articles.manageRoles.systemMatrix", body: "help.articles.manageRoles.systemMatrixBody" },
      { heading: "help.articles.manageRoles.delete", body: "help.articles.manageRoles.deleteBody" }
    ],
    relatedSlugs: ["admin-overview", "manage-users", "invite-team", "document-permissions"]
  },
  {
    slug: "audit-logs",
    category: "admin",
    icon: "History",
    titleKey: "help.articles.auditLogs.title",
    summaryKey: "help.articles.auditLogs.summary",
    contextualRoute: "/admin/audit",
    keywords: ["auditoria", "audit", "logs", "histórico", "atividade"],
    sections: [
      { heading: "help.articles.auditLogs.whatIs", body: "help.articles.auditLogs.whatIsBody" },
      { heading: "help.articles.auditLogs.filters", body: "help.articles.auditLogs.filtersBody" },
      { heading: "help.articles.auditLogs.access", body: "help.articles.auditLogs.accessBody" }
    ],
    relatedSlugs: ["admin-overview"]
  },
  {
    slug: "organization-settings",
    category: "admin",
    icon: "Settings",
    titleKey: "help.articles.orgSettings.title",
    summaryKey: "help.articles.orgSettings.summary",
    contextualRoute: "/admin/settings",
    keywords: ["configurações", "settings", "organização", "política", "password"],
    sections: [
      { heading: "help.articles.orgSettings.access", body: "help.articles.orgSettings.accessBody" },
      { heading: "help.articles.orgSettings.general", body: "help.articles.orgSettings.generalBody" },
      { heading: "help.articles.orgSettings.password", body: "help.articles.orgSettings.passwordBody" },
      { heading: "help.articles.orgSettings.storage", body: "help.articles.orgSettings.storageBody" },
      { heading: "help.articles.orgSettings.notifications", body: "help.articles.orgSettings.notificationsBody" }
    ],
    relatedSlugs: ["admin-overview", "change-password"]
  },

  // Billing
  {
    slug: "billing-overview",
    category: "billing",
    icon: "CreditCard",
    titleKey: "help.articles.billingOverview.title",
    summaryKey: "help.articles.billingOverview.summary",
    contextualRoute: "/billing",
    keywords: ["faturação", "billing", "planos", "subscription", "pagamento"],
    sections: [
      { heading: "help.articles.billingOverview.whatIs", body: "help.articles.billingOverview.whatIsBody" },
      { heading: "help.articles.billingOverview.plans", body: "help.articles.billingOverview.plansBody" },
      { heading: "help.articles.billingOverview.usage", body: "help.articles.billingOverview.usageBody" }
    ],
    relatedSlugs: ["manage-subscription", "usage-limits"]
  },
  {
    slug: "manage-subscription",
    category: "billing",
    icon: "CreditCard",
    titleKey: "help.articles.manageSubscription.title",
    summaryKey: "help.articles.manageSubscription.summary",
    contextualRoute: "/billing",
    keywords: ["subscrição", "subscription", "cancelar", "mudar plano", "upgrade"],
    sections: [
      { heading: "help.articles.manageSubscription.change", body: "help.articles.manageSubscription.changeBody" },
      { heading: "help.articles.manageSubscription.cancel", body: "help.articles.manageSubscription.cancelBody" },
      { heading: "help.articles.manageSubscription.annual", body: "help.articles.manageSubscription.annualBody" }
    ],
    relatedSlugs: ["billing-overview", "usage-limits"]
  },
  {
    slug: "usage-limits",
    category: "billing",
    icon: "Gauge",
    titleKey: "help.articles.usageLimits.title",
    summaryKey: "help.articles.usageLimits.summary",
    contextualRoute: "/billing",
    keywords: ["limites", "limits", "utilização", "usage", "quota"],
    sections: [
      { heading: "help.articles.usageLimits.whatIs", body: "help.articles.usageLimits.whatIsBody" },
      { heading: "help.articles.usageLimits.exceeded", body: "help.articles.usageLimits.exceededBody" }
    ],
    relatedSlugs: ["billing-overview", "manage-subscription"]
  },

  // Account
  {
    slug: "profile-settings",
    category: "account",
    icon: "UserRound",
    titleKey: "help.articles.profileSettings.title",
    summaryKey: "help.articles.profileSettings.summary",
    contextualRoute: "/profile",
    keywords: ["perfil", "profile", "avatar", "nome", "cargo"],
    sections: [
      { heading: "help.articles.profileSettings.edit", body: "help.articles.profileSettings.editBody" },
      { heading: "help.articles.profileSettings.avatar", body: "help.articles.profileSettings.avatarBody" }
    ],
    relatedSlugs: ["change-password", "manage-organizations"]
  },
  {
    slug: "change-password",
    category: "account",
    icon: "Key",
    titleKey: "help.articles.changePassword.title",
    summaryKey: "help.articles.changePassword.summary",
    contextualRoute: "/settings",
    keywords: ["password", "senha", "alterar", "mudar", "segurança"],
    sections: [
      { heading: "help.articles.changePassword.howTo", body: "help.articles.changePassword.howToBody" },
      { heading: "help.articles.changePassword.policy", body: "help.articles.changePassword.policyBody" }
    ],
    relatedSlugs: ["profile-settings", "organization-settings"]
  },
  {
    slug: "manage-organizations",
    category: "account",
    icon: "Building2",
    titleKey: "help.articles.manageOrganizations.title",
    summaryKey: "help.articles.manageOrganizations.summary",
    keywords: ["organizações", "organizations", "multi-tenant", "empresa", "switch"],
    sections: [
      { heading: "help.articles.manageOrganizations.switch", body: "help.articles.manageOrganizations.switchBody" },
      { heading: "help.articles.manageOrganizations.multi", body: "help.articles.manageOrganizations.multiBody" }
    ],
    relatedSlugs: ["profile-settings", "navigation-guide"]
  },

  // FAQ
  {
    slug: "faq-account",
    category: "faq",
    icon: "HelpCircle",
    titleKey: "help.articles.faqAccount.title",
    summaryKey: "help.articles.faqAccount.summary",
    keywords: ["faq", "conta", "registo", "login", "sessão"],
    sections: [
      { heading: "help.articles.faqAccount.q1", body: "help.articles.faqAccount.a1" },
      { heading: "help.articles.faqAccount.q2", body: "help.articles.faqAccount.a2" },
      { heading: "help.articles.faqAccount.q3", body: "help.articles.faqAccount.a3" }
    ],
    relatedSlugs: ["profile-settings", "change-password", "manage-organizations"]
  },
  {
    slug: "faq-permissions",
    category: "faq",
    icon: "HelpCircle",
    titleKey: "help.articles.faqPermissions.title",
    summaryKey: "help.articles.faqPermissions.summary",
    keywords: ["faq", "permissões", "roles", "acesso"],
    sections: [
      { heading: "help.articles.faqPermissions.q1", body: "help.articles.faqPermissions.a1" },
      { heading: "help.articles.faqPermissions.q2", body: "help.articles.faqPermissions.a2" },
      { heading: "help.articles.faqPermissions.q3", body: "help.articles.faqPermissions.a3" }
    ],
    relatedSlugs: ["manage-roles", "document-permissions", "manage-users"]
  },
  {
    slug: "faq-documents",
    category: "faq",
    icon: "HelpCircle",
    titleKey: "help.articles.faqDocuments.title",
    summaryKey: "help.articles.faqDocuments.summary",
    keywords: ["faq", "documentos", "upload", "partilha"],
    sections: [
      { heading: "help.articles.faqDocuments.q1", body: "help.articles.faqDocuments.a1" },
      { heading: "help.articles.faqDocuments.q2", body: "help.articles.faqDocuments.a2" },
      { heading: "help.articles.faqDocuments.q3", body: "help.articles.faqDocuments.a3" }
    ],
    relatedSlugs: ["documents-overview", "upload-document", "share-document"]
  },
  {
    slug: "faq-workflows",
    category: "faq",
    icon: "HelpCircle",
    titleKey: "help.articles.faqWorkflows.title",
    summaryKey: "help.articles.faqWorkflows.summary",
    keywords: ["faq", "workflows", "processos", "aprovações"],
    sections: [
      { heading: "help.articles.faqWorkflows.q1", body: "help.articles.faqWorkflows.a1" },
      { heading: "help.articles.faqWorkflows.q2", body: "help.articles.faqWorkflows.a2" }
    ],
    relatedSlugs: ["workflows-overview", "workflow-builder", "approvals-overview"]
  },
  {
    slug: "faq-notifications",
    category: "faq",
    icon: "HelpCircle",
    titleKey: "help.articles.faqNotifications.title",
    summaryKey: "help.articles.faqNotifications.summary",
    keywords: ["faq", "notificações", "email", "alertas"],
    sections: [
      { heading: "help.articles.faqNotifications.q1", body: "help.articles.faqNotifications.a1" },
      { heading: "help.articles.faqNotifications.q2", body: "help.articles.faqNotifications.a2" }
    ],
    relatedSlugs: ["notifications-overview", "manage-notifications"]
  },
  {
    slug: "faq-security",
    category: "faq",
    icon: "HelpCircle",
    titleKey: "help.articles.faqSecurity.title",
    summaryKey: "help.articles.faqSecurity.summary",
    keywords: ["faq", "segurança", "dados", "multi-tenant", "isolamento"],
    sections: [
      { heading: "help.articles.faqSecurity.q1", body: "help.articles.faqSecurity.a1" },
      { heading: "help.articles.faqSecurity.q2", body: "help.articles.faqSecurity.a2" }
    ],
    relatedSlugs: ["manage-roles", "organization-settings", "change-password"]
  },

  // Troubleshooting
  {
    slug: "trouble-login",
    category: "troubleshooting",
    icon: "Wrench",
    titleKey: "help.articles.troubleLogin.title",
    summaryKey: "help.articles.troubleLogin.summary",
    keywords: ["login", "sessão", "password", "esqueceu", "reset"],
    sections: [
      { heading: "help.articles.troubleLogin.forgot", body: "help.articles.troubleLogin.forgotBody" },
      { heading: "help.articles.troubleLogin.reset", body: "help.articles.troubleLogin.resetBody" },
      { heading: "help.articles.troubleLogin.session", body: "help.articles.troubleLogin.sessionBody" }
    ],
    relatedSlugs: ["change-password", "profile-settings"]
  },
  {
    slug: "trouble-permissions",
    category: "troubleshooting",
    icon: "Wrench",
    titleKey: "help.articles.troublePermissions.title",
    summaryKey: "help.articles.troublePermissions.summary",
    keywords: ["permissões", "acesso", "negado", "forbidden", "403"],
    sections: [
      { heading: "help.articles.troublePermissions.check", body: "help.articles.troublePermissions.checkBody" },
      { heading: "help.articles.troublePermissions.contact", body: "help.articles.troublePermissions.contactBody" }
    ],
    relatedSlugs: ["manage-roles", "document-permissions", "manage-users"]
  },
  {
    slug: "trouble-document-access",
    category: "troubleshooting",
    icon: "Wrench",
    titleKey: "help.articles.troubleDocAccess.title",
    summaryKey: "help.articles.troubleDocAccess.summary",
    keywords: ["documento", "acesso", "ver", "editar", "download", "check-out", "bloqueado"],
    sections: [
      { heading: "help.articles.troubleDocAccess.cantView", body: "help.articles.troubleDocAccess.cantViewBody" },
      { heading: "help.articles.troubleDocAccess.cantEdit", body: "help.articles.troubleDocAccess.cantEditBody" },
      { heading: "help.articles.troubleDocAccess.cantDownload", body: "help.articles.troubleDocAccess.cantDownloadBody" }
    ],
    relatedSlugs: ["document-permissions", "share-document", "documents-overview", "checkout-checkin"]
  },
  {
    slug: "trouble-notifications",
    category: "troubleshooting",
    icon: "Wrench",
    titleKey: "help.articles.troubleNotifications.title",
    summaryKey: "help.articles.troubleNotifications.summary",
    keywords: ["notificações", "não recebo", "email", "alertas"],
    sections: [
      { heading: "help.articles.troubleNotifications.cantSee", body: "help.articles.troubleNotifications.cantSeeBody" },
      { heading: "help.articles.troubleNotifications.email", body: "help.articles.troubleNotifications.emailBody" }
    ],
    relatedSlugs: ["notifications-overview", "manage-notifications", "organization-settings"]
  },
  {
    slug: "trouble-workflow",
    category: "troubleshooting",
    icon: "Wrench",
    titleKey: "help.articles.troubleWorkflow.title",
    summaryKey: "help.articles.troubleWorkflow.summary",
    keywords: ["workflow", "processo", "não executa", "erro", "falha"],
    sections: [
      { heading: "help.articles.troubleWorkflow.published", body: "help.articles.troubleWorkflow.publishedBody" },
      { heading: "help.articles.troubleWorkflow.failed", body: "help.articles.troubleWorkflow.failedBody" },
      { heading: "help.articles.troubleWorkflow.stuck", body: "help.articles.troubleWorkflow.stuckBody" }
    ],
    relatedSlugs: ["workflows-overview", "run-workflow", "workflow-instances"]
  },
  {
    slug: "manage-access",
    category: "documents",
    icon: "KeyRound",
    titleKey: "help.articles.manageAccess.title",
    summaryKey: "help.articles.manageAccess.summary",
    contextualRoute: "/documents",
    keywords: ["acesso", "access", "permissões", "permissions", "pedido", "request", "herança", "inheritance"],
    sections: [
      { heading: "help.articles.manageAccess.panel", body: "help.articles.manageAccess.panelBody" },
      { heading: "help.articles.manageAccess.inheritance", body: "help.articles.manageAccess.inheritanceBody" },
      { heading: "help.articles.manageAccess.request", body: "help.articles.manageAccess.requestBody" },
      { heading: "help.articles.manageAccess.decide", body: "help.articles.manageAccess.decideBody" }
    ],
    relatedSlugs: ["document-permissions", "share-document", "notifications-overview"]
  },
  {
    slug: "governance",
    category: "documents",
    icon: "Shield",
    titleKey: "help.articles.governance.title",
    summaryKey: "help.articles.governance.summary",
    contextualRoute: "/documents",
    keywords: ["governança", "governance", "retenção", "retention", "sensibilidade", "sensitivity", "confidencial"],
    sections: [
      { heading: "help.articles.governance.sensitivity", body: "help.articles.governance.sensitivityBody" },
      { heading: "help.articles.governance.retention", body: "help.articles.governance.retentionBody" },
      { heading: "help.articles.governance.inheritance", body: "help.articles.governance.inheritanceBody" },
      { heading: "help.articles.governance.manage", body: "help.articles.governance.manageBody" }
    ],
    relatedSlugs: ["document-permissions", "manage-folders", "recycle-bin", "manage-access"]
  },
  {
    slug: "pin-recent-favorites",
    category: "documents",
    icon: "Pin",
    titleKey: "help.articles.pinRecentFavorites.title",
    summaryKey: "help.articles.pinRecentFavorites.summary",
    contextualRoute: "/documents",
    keywords: ["fixar", "pin", "recentes", "recent", "favoritos", "favorites", "atalhos"],
    sections: [
      { heading: "help.articles.pinRecentFavorites.pin", body: "help.articles.pinRecentFavorites.pinBody" },
      { heading: "help.articles.pinRecentFavorites.recent", body: "help.articles.pinRecentFavorites.recentBody" },
      { heading: "help.articles.pinRecentFavorites.favorites", body: "help.articles.pinRecentFavorites.favoritesBody" },
      { heading: "help.articles.pinRecentFavorites.quickViews", body: "help.articles.pinRecentFavorites.quickViewsBody" }
    ],
    relatedSlugs: ["documents-overview", "saved-views", "manage-folders"]
  },
  {
    slug: "ai-metadata",
    category: "documents",
    icon: "Sparkles",
    titleKey: "help.articles.aiMetadata.title",
    summaryKey: "help.articles.aiMetadata.summary",
    contextualRoute: "/documents",
    keywords: ["ia", "ai", "metadados", "metadata", "sugestões", "automático"],
    sections: [
      { heading: "help.articles.aiMetadata.whatIs", body: "help.articles.aiMetadata.whatIsBody" },
      { heading: "help.articles.aiMetadata.suggest", body: "help.articles.aiMetadata.suggestBody" },
      { heading: "help.articles.aiMetadata.badge", body: "help.articles.aiMetadata.badgeBody" }
    ],
    relatedSlugs: ["document-metadata", "ai-overview", "ai-document-operations"]
  },
  {
    slug: "webhooks",
    category: "admin",
    icon: "Webhook",
    titleKey: "help.articles.webhooks.title",
    summaryKey: "help.articles.webhooks.summary",
    contextualRoute: "/admin/webhooks",
    keywords: ["webhook", "webhooks", "integração", "eventos", "api", "assinatura"],
    sections: [
      { heading: "help.articles.webhooks.whatIs", body: "help.articles.webhooks.whatIsBody" },
      { heading: "help.articles.webhooks.create", body: "help.articles.webhooks.createBody" },
      { heading: "help.articles.webhooks.secret", body: "help.articles.webhooks.secretBody" },
      { heading: "help.articles.webhooks.events", body: "help.articles.webhooks.eventsBody" },
      { heading: "help.articles.webhooks.deliveries", body: "help.articles.webhooks.deliveriesBody" }
    ],
    relatedSlugs: ["admin-overview", "audit-logs", "organization-settings"]
  }
];

// --- Helper functions ---

export function getArticleBySlug(slug: string): HelpArticle | undefined {
  return HELP_ARTICLES.find((a) => a.slug === slug);
}

export function getArticlesByCategory(categoryId: string): HelpArticle[] {
  return HELP_ARTICLES.filter((a) => a.category === categoryId);
}

export function getArticleForRoute(route: string): HelpArticle | undefined {
  // Find the best matching article for a given route
  const sorted = [...HELP_ARTICLES].filter((a) => a.contextualRoute).sort((a, b) => (b.contextualRoute!.length - a.contextualRoute!.length));
  for (const article of sorted) {
    if (route === article.contextualRoute || route.startsWith(article.contextualRoute! + "/")) {
      return article;
    }
  }
  return undefined;
}

export function searchArticles(query: string): Array<{ article: HelpArticle; score: number }> {
  const lower = query.toLowerCase().trim();
  if (!lower) return [];
  const results: Array<{ article: HelpArticle; score: number }> = [];
  for (const article of HELP_ARTICLES) {
    let score = 0;
    // Check keywords
    for (const keyword of article.keywords) {
      if (keyword.toLowerCase().includes(lower) || lower.includes(keyword.toLowerCase())) {
        score += 10;
      }
    }
    // Check slug
    if (article.slug.toLowerCase().includes(lower)) score += 5;
    // Check category
    if (article.category.toLowerCase().includes(lower)) score += 3;
    if (score > 0) results.push({ article, score });
  }
  return results.sort((a, b) => b.score - a.score);
}
