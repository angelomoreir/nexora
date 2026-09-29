import type { FormFieldType, ListFieldType, WorkflowStepType } from "@nexora/contracts";
import type { FormFieldInput, ListFieldInput } from "./api";

type Lang = "pt-PT" | "en" | "es" | "fr" | "de";
type Localized = Record<Lang, string>;

function l(en: string, pt: string, es: string, fr: string, de: string): Localized {
  return { en, "pt-PT": pt, es, fr, de };
}

function pick(text: Localized, lang: string): string {
  return text[lang as Lang] ?? text.en;
}

interface LocalizedOption {
  value: string;
  label: Localized;
}

interface ListTemplateFieldDef {
  name: Localized;
  slug: string;
  type: ListFieldType;
  required?: boolean;
  options?: LocalizedOption[];
}

interface ListTemplateDef {
  id: string;
  name: Localized;
  description: Localized;
  fields: ListTemplateFieldDef[];
}

interface FormTemplateFieldDef {
  type: FormFieldType;
  label: Localized;
  required?: boolean;
  options?: LocalizedOption[];
}

interface FormTemplateDef {
  id: string;
  name: Localized;
  description: Localized;
  fields: FormTemplateFieldDef[];
}

export interface ListTemplate {
  id: string;
  name: string;
  description: string;
  fields: ListFieldInput[];
}

export interface FormTemplate {
  id: string;
  name: string;
  description: string;
  fields: FormFieldInput[];
}

const listTemplateDefs: ListTemplateDef[] = [
  {
    id: "clients",
    name: l("Clients", "Clientes", "Clientes", "Clients", "Kunden"),
    description: l(
      "Customer database with contact details and status.",
      "Base de dados de clientes com contactos e estado.",
      "Base de datos de clientes con contactos y estado.",
      "Base de données clients avec coordonnées et statut.",
      "Kundendatenbank mit Kontaktdaten und Status."
    ),
    fields: [
      { name: l("Name", "Nome", "Nombre", "Nom", "Name"), slug: "nome", type: "text", required: true },
      { name: l("Company", "Empresa", "Empresa", "Société", "Firma"), slug: "empresa", type: "text" },
      { name: l("Email", "Email", "Email", "Email", "E-Mail"), slug: "email", type: "email" },
      { name: l("Phone", "Telefone", "Teléfono", "Téléphone", "Telefon"), slug: "telefone", type: "text" },
      {
        name: l("Status", "Estado", "Estado", "Statut", "Status"), slug: "estado", type: "choice", options: [
          { value: "ativo", label: l("Active", "Ativo", "Activo", "Actif", "Aktiv") },
          { value: "inativo", label: l("Inactive", "Inativo", "Inactivo", "Inactif", "Inaktiv") },
          { value: "potencial", label: l("Prospect", "Potencial", "Potencial", "Prospect", "Interessent") }
        ]
      }
    ]
  },
  {
    id: "inventory",
    name: l("Inventory", "Inventário", "Inventario", "Inventaire", "Inventar"),
    description: l(
      "Track products, stock quantities and suppliers.",
      "Gerir produtos, quantidades em stock e fornecedores.",
      "Gestionar productos, cantidades en stock y proveedores.",
      "Suivre les produits, les stocks et les fournisseurs.",
      "Produkte, Lagerbestände und Lieferanten verwalten."
    ),
    fields: [
      { name: l("Product", "Produto", "Producto", "Produit", "Produkt"), slug: "produto", type: "text", required: true },
      { name: l("SKU", "Referência", "Referencia", "Référence", "Artikelnummer"), slug: "referencia", type: "text" },
      { name: l("Quantity", "Quantidade", "Cantidad", "Quantité", "Menge"), slug: "quantidade", type: "number" },
      { name: l("Unit price", "Preço unitário", "Precio unitario", "Prix unitaire", "Stückpreis"), slug: "preco-unitario", type: "currency" },
      { name: l("Supplier", "Fornecedor", "Proveedor", "Fournisseur", "Lieferant"), slug: "fornecedor", type: "text" }
    ]
  },
  {
    id: "contacts",
    name: l("Contacts", "Contactos", "Contactos", "Contacts", "Kontakte"),
    description: l(
      "Shared address book for the organization.",
      "Livro de contactos partilhado da organização.",
      "Libreta de contactos compartida de la organización.",
      "Carnet d'adresses partagé de l'organisation.",
      "Gemeinsames Adressbuch der Organisation."
    ),
    fields: [
      { name: l("Name", "Nome", "Nombre", "Nom", "Name"), slug: "nome", type: "text", required: true },
      { name: l("Company", "Empresa", "Empresa", "Société", "Firma"), slug: "empresa", type: "text" },
      { name: l("Job title", "Cargo", "Cargo", "Fonction", "Position"), slug: "cargo", type: "text" },
      { name: l("Email", "Email", "Email", "Email", "E-Mail"), slug: "email", type: "email" },
      { name: l("Phone", "Telefone", "Teléfono", "Téléphone", "Telefon"), slug: "telefone", type: "text" }
    ]
  },
  {
    id: "suppliers",
    name: l("Suppliers", "Fornecedores", "Proveedores", "Fournisseurs", "Lieferanten"),
    description: l(
      "Supplier registry with tax ID, contacts and status.",
      "Registo de fornecedores com NIF, contactos e estado.",
      "Registro de proveedores con NIF, contactos y estado.",
      "Registre des fournisseurs avec identifiants et statut.",
      "Lieferantenregister mit Steuernummer, Kontakten und Status."
    ),
    fields: [
      { name: l("Company", "Empresa", "Empresa", "Société", "Firma"), slug: "empresa", type: "text", required: true },
      { name: l("Tax ID", "NIF", "NIF", "N° fiscal", "Steuernummer"), slug: "nif", type: "text" },
      { name: l("Email", "Email", "Email", "Email", "E-Mail"), slug: "email", type: "email" },
      { name: l("Website", "Website", "Sitio web", "Site web", "Webseite"), slug: "website", type: "url" },
      {
        name: l("Status", "Estado", "Estado", "Statut", "Status"), slug: "estado", type: "choice", options: [
          { value: "ativo", label: l("Active", "Ativo", "Activo", "Actif", "Aktiv") },
          { value: "suspenso", label: l("Suspended", "Suspenso", "Suspendido", "Suspendu", "Gesperrt") },
          { value: "inativo", label: l("Inactive", "Inativo", "Inactivo", "Inactif", "Inaktiv") }
        ]
      }
    ]
  },
  {
    id: "requisitions",
    name: l("Requisitions", "Requisições", "Requisiciones", "Réquisitions", "Anforderungen"),
    description: l(
      "Internal purchase and material requests.",
      "Pedidos internos de compra e material.",
      "Solicitudes internas de compra y material.",
      "Demandes internes d'achat et de matériel.",
      "Interne Kauf- und Materialanforderungen."
    ),
    fields: [
      { name: l("Item", "Artigo", "Artículo", "Article", "Artikel"), slug: "artigo", type: "text", required: true },
      { name: l("Quantity", "Quantidade", "Cantidad", "Quantité", "Menge"), slug: "quantidade", type: "number" },
      { name: l("Urgent", "Urgente", "Urgente", "Urgent", "Dringend"), slug: "urgente", type: "boolean" },
      { name: l("Needed by", "Data limite", "Fecha límite", "Date limite", "Frist"), slug: "data-limite", type: "date" },
      {
        name: l("Status", "Estado", "Estado", "Statut", "Status"), slug: "estado", type: "choice", options: [
          { value: "pendente", label: l("Pending", "Pendente", "Pendiente", "En attente", "Ausstehend") },
          { value: "aprovado", label: l("Approved", "Aprovado", "Aprobado", "Approuvé", "Genehmigt") },
          { value: "entregue", label: l("Delivered", "Entregue", "Entregado", "Livré", "Geliefert") }
        ]
      }
    ]
  }
];

const formTemplateDefs: FormTemplateDef[] = [
  {
    id: "leave-request",
    name: l("Leave request", "Pedido de férias", "Solicitud de vacaciones", "Demande de congés", "Urlaubsantrag"),
    description: l(
      "Employees request vacation or leave days.",
      "Colaboradores pedem dias de férias ou licença.",
      "Los empleados solicitan días de vacaciones o permiso.",
      "Les employés demandent des jours de congé.",
      "Mitarbeiter beantragen Urlaubs- oder freie Tage."
    ),
    fields: [
      { type: "text", label: l("Employee name", "Nome do colaborador", "Nombre del empleado", "Nom de l'employé", "Name des Mitarbeiters"), required: true },
      { type: "date", label: l("Start date", "Data de início", "Fecha de inicio", "Date de début", "Startdatum"), required: true },
      { type: "date", label: l("End date", "Data de fim", "Fecha de fin", "Date de fin", "Enddatum"), required: true },
      {
        type: "select", label: l("Type", "Tipo", "Tipo", "Type", "Art"), options: [
          { value: "ferias", label: l("Vacation", "Férias", "Vacaciones", "Congés", "Urlaub") },
          { value: "licenca", label: l("Leave", "Licença", "Permiso", "Absence", "Freistellung") },
          { value: "outro", label: l("Other", "Outro", "Otro", "Autre", "Sonstiges") }
        ]
      },
      { type: "longtext", label: l("Notes", "Observações", "Observaciones", "Remarques", "Anmerkungen") }
    ]
  },
  {
    id: "satisfaction-survey",
    name: l("Satisfaction survey", "Questionário de satisfação", "Encuesta de satisfacción", "Enquête de satisfaction", "Zufriedenheitsumfrage"),
    description: l(
      "Collect feedback and satisfaction ratings.",
      "Recolher feedback e avaliações de satisfação.",
      "Recoger opiniones y valoraciones de satisfacción.",
      "Recueillir des avis et des notes de satisfaction.",
      "Feedback und Zufriedenheitsbewertungen sammeln."
    ),
    fields: [
      { type: "text", label: l("Name", "Nome", "Nombre", "Nom", "Name") },
      {
        type: "radio", label: l("Overall satisfaction", "Satisfação geral", "Satisfacción general", "Satisfaction générale", "Gesamtzufriedenheit"), required: true, options: [
          { value: "5", label: l("Very satisfied", "Muito satisfeito", "Muy satisfecho", "Très satisfait", "Sehr zufrieden") },
          { value: "4", label: l("Satisfied", "Satisfeito", "Satisfecho", "Satisfait", "Zufrieden") },
          { value: "3", label: l("Neutral", "Neutro", "Neutral", "Neutre", "Neutral") },
          { value: "2", label: l("Dissatisfied", "Insatisfeito", "Insatisfecho", "Insatisfait", "Unzufrieden") },
          { value: "1", label: l("Very dissatisfied", "Muito insatisfeito", "Muy insatisfecho", "Très insatisfait", "Sehr unzufrieden") }
        ]
      },
      { type: "text", label: l("What did you like most?", "O que mais gostou?", "¿Qué le gustó más?", "Qu'avez-vous le plus apprécié ?", "Was hat Ihnen am besten gefallen?") },
      { type: "longtext", label: l("Suggestions for improvement", "Sugestões de melhoria", "Sugerencias de mejora", "Suggestions d'amélioration", "Verbesserungsvorschläge") }
    ]
  },
  {
    id: "incident-report",
    name: l("Incident report", "Registo de ocorrência", "Registro de incidencias", "Rapport d'incident", "Vorfallmeldung"),
    description: l(
      "Report problems, incidents or anomalies.",
      "Reportar problemas, incidentes ou anomalias.",
      "Reportar problemas, incidencias o anomalías.",
      "Signaler des problèmes, incidents ou anomalies.",
      "Probleme, Vorfälle oder Anomalien melden."
    ),
    fields: [
      { type: "text", label: l("Title", "Título", "Título", "Titre", "Titel"), required: true },
      { type: "date", label: l("Date", "Data", "Fecha", "Date", "Datum"), required: true },
      {
        type: "select", label: l("Severity", "Gravidade", "Gravedad", "Gravité", "Schweregrad"), required: true, options: [
          { value: "baixa", label: l("Low", "Baixa", "Baja", "Faible", "Niedrig") },
          { value: "media", label: l("Medium", "Média", "Media", "Moyenne", "Mittel") },
          { value: "alta", label: l("High", "Alta", "Alta", "Élevée", "Hoch") },
          { value: "critica", label: l("Critical", "Crítica", "Crítica", "Critique", "Kritisch") }
        ]
      },
      { type: "longtext", label: l("Description", "Descrição", "Descripción", "Description", "Beschreibung"), required: true },
      { type: "upload", label: l("Attachment", "Anexo", "Adjunto", "Pièce jointe", "Anhang") }
    ]
  },
  {
    id: "event-registration",
    name: l("Event registration", "Inscrição em evento", "Inscripción a evento", "Inscription à un événement", "Veranstaltungsanmeldung"),
    description: l(
      "Register participants for internal events.",
      "Inscrever participantes em eventos internos.",
      "Inscribir participantes en eventos internos.",
      "Inscrire les participants aux événements internes.",
      "Teilnehmer für interne Veranstaltungen anmelden."
    ),
    fields: [
      { type: "text", label: l("Name", "Nome", "Nombre", "Nom", "Name"), required: true },
      { type: "email", label: l("Email", "Email", "Email", "Email", "E-Mail"), required: true },
      {
        type: "select", label: l("Session", "Sessão", "Sesión", "Session", "Sitzung"), options: [
          { value: "manha", label: l("Morning", "Manhã", "Mañana", "Matin", "Vormittag") },
          { value: "tarde", label: l("Afternoon", "Tarde", "Tarde", "Après-midi", "Nachmittag") },
          { value: "dia-inteiro", label: l("Full day", "Dia inteiro", "Día completo", "Journée entière", "Ganzer Tag") }
        ]
      },
      { type: "longtext", label: l("Dietary requirements", "Restrições alimentares", "Restricciones alimentarias", "Restrictions alimentaires", "Essensbeschränkungen") }
    ]
  },
  {
    id: "contact-request",
    name: l("Contact request", "Pedido de contacto", "Solicitud de contacto", "Demande de contact", "Kontaktanfrage"),
    description: l(
      "Collect contact requests with message.",
      "Recolher pedidos de contacto com mensagem.",
      "Recoger solicitudes de contacto con mensaje.",
      "Recueillir des demandes de contact avec message.",
      "Kontaktanfragen mit Nachricht sammeln."
    ),
    fields: [
      { type: "text", label: l("Name", "Nome", "Nombre", "Nom", "Name"), required: true },
      { type: "email", label: l("Email", "Email", "Email", "Email", "E-Mail"), required: true },
      { type: "phone", label: l("Phone", "Telefone", "Teléfono", "Téléphone", "Telefon") },
      { type: "longtext", label: l("Message", "Mensagem", "Mensaje", "Message", "Nachricht"), required: true }
    ]
  }
];

export function getListTemplates(lang: string): ListTemplate[] {
  return listTemplateDefs.map((template) => ({
    id: template.id,
    name: pick(template.name, lang),
    description: pick(template.description, lang),
    fields: template.fields.map((field, index) => ({
      name: pick(field.name, lang),
      slug: field.slug,
      type: field.type,
      required: field.required ?? false,
      options: field.options ? field.options.map((option) => ({ value: option.value, label: pick(option.label, lang) })) : null,
      relationListId: null,
      order: index
    }))
  }));
}

export function getFormTemplates(lang: string): FormTemplate[] {
  return formTemplateDefs.map((template) => ({
    id: template.id,
    name: pick(template.name, lang),
    description: pick(template.description, lang),
    fields: template.fields.map((field, index) => ({
      id: `${template.id}-${index}`,
      type: field.type,
      label: pick(field.label, lang),
      required: field.required ?? false,
      options: field.options ? field.options.map((option) => ({ value: option.value, label: pick(option.label, lang) })) : null,
      order: index
    }))
  }));
}

// ---------------------------------------------------------------------------
// Workflow templates

type ConfigValue = string | number | boolean | Localized;

interface WorkflowStepTemplateDef {
  type: WorkflowStepType;
  name: Localized;
  config?: Record<string, ConfigValue>;
}

interface WorkflowTemplateDef {
  id: string;
  name: Localized;
  description: Localized;
  steps: WorkflowStepTemplateDef[];
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  steps: { order: number; type: WorkflowStepType; name: string; config: Record<string, unknown> }[];
}

const stepStart: WorkflowStepTemplateDef = { type: "START", name: l("Start", "Início", "Inicio", "Début", "Start") };
const stepEnd: WorkflowStepTemplateDef = { type: "END", name: l("End", "Fim", "Fin", "Fin", "Ende") };

const workflowTemplateDefs: WorkflowTemplateDef[] = [
  {
    id: "task-approval",
    name: l("Task approval", "Aprovação de tarefa", "Aprobación de tarea", "Approbation de tâche", "Aufgabengenehmigung"),
    description: l(
      "Create a task and pause until someone approves it.",
      "Cria uma tarefa e aguarda aprovação antes de continuar.",
      "Crea una tarea y espera aprobación antes de continuar.",
      "Crée une tâche et attend une approbation avant de continuer.",
      "Erstellt eine Aufgabe und wartet auf eine Genehmigung."
    ),
    steps: [
      stepStart,
      { type: "CREATE_TASK", name: l("Create task", "Criar tarefa", "Crear tarea", "Créer la tâche", "Aufgabe erstellen"), config: { title: l("Task pending approval", "Tarefa para aprovação", "Tarea para aprobación", "Tâche à approuver", "Aufgabe zur Genehmigung"), priority: "NORMAL" } },
      { type: "APPROVAL", name: l("Manager approval", "Aprovação do gestor", "Aprobación del gestor", "Approbation du responsable", "Genehmigung des Managers"), config: { approverId: "", title: l("Approval required", "Aprovação necessária", "Aprobación necesaria", "Approbation requise", "Genehmigung erforderlich"), onRejectJumpToOrder: 4 } },
      { type: "SEND_NOTIFICATION", name: l("Notify approval", "Notificar aprovação", "Notificar aprobación", "Notifier l'approbation", "Genehmigung melden"), config: { recipientId: "", title: l("Approved", "Aprovado", "Aprobado", "Approuvé", "Genehmigt"), body: l("The task was approved.", "A tarefa foi aprovada.", "La tarea fue aprobada.", "La tâche a été approuvée.", "Die Aufgabe wurde genehmigt.") } },
      stepEnd
    ]
  },
  {
    id: "purchase-approval",
    name: l("Purchase request", "Pedido de compra", "Solicitud de compra", "Demande d'achat", "Kaufanfrage"),
    description: l(
      "Manager approval plus an extra approval when the amount is high (set the 'valorAlto' variable when starting).",
      "Aprovação do gestor mais uma aprovação extra para valores altos (defina a variável 'valorAlto' ao iniciar).",
      "Aprobación del gestor más una aprobación extra para importes altos (defina la variable 'valorAlto' al iniciar).",
      "Approbation du responsable plus une approbation supplémentaire pour les montants élevés (variable 'valorAlto' au démarrage).",
      "Manager-Genehmigung plus zusätzliche Genehmigung bei hohen Beträgen (Variable 'valorAlto' beim Start setzen)."
    ),
    steps: [
      stepStart,
      { type: "CREATE_TASK", name: l("Review request", "Analisar pedido", "Analizar solicitud", "Analyser la demande", "Anfrage prüfen"), config: { title: l("Review purchase request", "Analisar pedido de compra", "Analizar solicitud de compra", "Analyser la demande d'achat", "Kaufanfrage prüfen"), priority: "NORMAL" } },
      { type: "APPROVAL", name: l("Manager approval", "Aprovação do gestor", "Aprobación del gestor", "Approbation du responsable", "Genehmigung des Managers"), config: { approverId: "", title: l("Approval required", "Aprovação necessária", "Aprobación necesaria", "Approbation requise", "Genehmigung erforderlich"), onRejectJumpToOrder: 7 } },
      { type: "CONDITION", name: l("High amount?", "Valor alto?", "¿Importe alto?", "Montant élevé ?", "Hoher Betrag?"), config: { variable: "valorAlto", operator: "not_equals", value: "true", jumpToOrder: 5 } },
      { type: "APPROVAL", name: l("Board approval", "Aprovação da direção", "Aprobación de la dirección", "Approbation de la direction", "Genehmigung der Leitung"), config: { approverId: "", title: l("High-value approval", "Aprovação de valor alto", "Aprobación de importe alto", "Approbation de montant élevé", "Genehmigung hoher Betrag"), onRejectJumpToOrder: 7 } },
      { type: "SEND_NOTIFICATION", name: l("Notify result", "Notificar resultado", "Notificar resultado", "Notifier le résultat", "Ergebnis melden"), config: { recipientId: "", title: l("Request approved", "Pedido aprovado", "Solicitud aprobada", "Demande approuvée", "Anfrage genehmigt"), body: l("The purchase request was approved.", "O pedido de compra foi aprovado.", "La solicitud de compra fue aprobada.", "La demande d'achat a été approuvée.", "Die Kaufanfrage wurde genehmigt.") } },
      { type: "CHANGE_STATUS", name: l("Close task", "Fechar tarefa", "Cerrar tarea", "Clôturer la tâche", "Aufgabe schließen"), config: { status: "DONE" } },
      stepEnd
    ]
  },
  {
    id: "onboarding",
    name: l("Member onboarding", "Onboarding de membro", "Incorporación de miembro", "Intégration de membre", "Mitglieder-Onboarding"),
    description: l(
      "Prepare access, send a welcome email and notify the team.",
      "Prepara acessos, envia email de boas-vindas e notifica a equipa.",
      "Prepara accesos, envía email de bienvenida y notifica al equipo.",
      "Prépare les accès, envoie un email de bienvenue et notifie l'équipe.",
      "Bereitet Zugänge vor, sendet eine Willkommens-E-Mail und benachrichtigt das Team."
    ),
    steps: [
      stepStart,
      { type: "CREATE_TASK", name: l("Prepare access", "Preparar acessos", "Preparar accesos", "Préparer les accès", "Zugänge vorbereiten"), config: { title: l("Prepare access for the new member", "Preparar acessos do novo membro", "Preparar accesos del nuevo miembro", "Préparer les accès du nouveau membre", "Zugänge für das neue Mitglied vorbereiten"), priority: "HIGH" } },
      { type: "SEND_EMAIL", name: l("Welcome email", "Email de boas-vindas", "Email de bienvenida", "Email de bienvenue", "Willkommens-E-Mail"), config: { to: "", subject: l("Welcome to the team", "Bem-vindo à equipa", "Bienvenido al equipo", "Bienvenue dans l'équipe", "Willkommen im Team"), body: l("Welcome! Your access is being prepared.", "Bem-vindo! Os seus acessos estão a ser preparados.", "¡Bienvenido! Sus accesos están siendo preparados.", "Bienvenue ! Vos accès sont en préparation.", "Willkommen! Ihre Zugänge werden vorbereitet.") } },
      { type: "SEND_NOTIFICATION", name: l("Notify team", "Notificar equipa", "Notificar al equipo", "Notifier l'équipe", "Team benachrichtigen"), config: { recipientId: "", title: l("New member", "Novo membro", "Nuevo miembro", "Nouveau membre", "Neues Mitglied"), body: l("A new member onboarding has started.", "Começou o onboarding de um novo membro.", "Ha comenzado la incorporación de un nuevo miembro.", "L'intégration d'un nouveau membre a commencé.", "Das Onboarding eines neuen Mitglieds hat begonnen.") } },
      stepEnd
    ]
  },
  {
    id: "document-approval",
    name: l("Document approval", "Aprovação de documento", "Aprobación de documento", "Approbation de document", "Dokumentengenehmigung"),
    description: l(
      "Approve a document, move it to the destination folder and notify.",
      "Aprova um documento, move-o para a pasta de destino e notifica.",
      "Aprueba un documento, lo mueve a la carpeta de destino y notifica.",
      "Approuve un document, le déplace vers le dossier de destination et notifie.",
      "Genehmigt ein Dokument, verschiebt es in den Zielordner und benachrichtigt."
    ),
    steps: [
      stepStart,
      { type: "APPROVAL", name: l("Approve document", "Aprovar documento", "Aprobar documento", "Approuver le document", "Dokument genehmigen"), config: { approverId: "", title: l("Document approval", "Aprovação de documento", "Aprobación de documento", "Approbation de document", "Dokumentengenehmigung"), onRejectJumpToOrder: 4 } },
      { type: "MOVE_DOCUMENT", name: l("Move to approved", "Mover para aprovados", "Mover a aprobados", "Déplacer vers approuvés", "In Genehmigt verschieben"), config: { documentId: "", folderId: "" } },
      { type: "SEND_NOTIFICATION", name: l("Notify approval", "Notificar aprovação", "Notificar aprobación", "Notifier l'approbation", "Genehmigung melden"), config: { recipientId: "", title: l("Document approved", "Documento aprovado", "Documento aprobado", "Document approuvé", "Dokument genehmigt"), body: l("The document was approved and moved.", "O documento foi aprovado e movido.", "El documento fue aprobado y movido.", "Le document a été approuvé et déplacé.", "Das Dokument wurde genehmigt und verschoben.") } },
      stepEnd
    ]
  },
  {
    id: "incident-response",
    name: l("Incident response", "Resposta a incidente", "Respuesta a incidencia", "Réponse à un incident", "Vorfallreaktion"),
    description: l(
      "Alert the owner, create a resolution task and confirm the fix.",
      "Alerta o responsável, cria tarefa de resolução e confirma a correção.",
      "Alerta al responsable, crea tarea de resolución y confirma la corrección.",
      "Alerte le responsable, crée une tâche de résolution et confirme la correction.",
      "Benachrichtigt den Verantwortlichen, erstellt eine Lösungsaufgabe und bestätigt die Behebung."
    ),
    steps: [
      stepStart,
      { type: "SEND_NOTIFICATION", name: l("Alert owner", "Alertar responsável", "Alertar al responsable", "Alerter le responsable", "Verantwortlichen alarmieren"), config: { recipientId: "", title: l("New incident reported", "Novo incidente reportado", "Nueva incidencia reportada", "Nouvel incident signalé", "Neuer Vorfall gemeldet"), body: l("An incident requires attention.", "Um incidente requer atenção.", "Una incidencia requiere atención.", "Un incident requiert une attention.", "Ein Vorfall erfordert Aufmerksamkeit.") } },
      { type: "CREATE_TASK", name: l("Resolution task", "Tarefa de resolução", "Tarea de resolución", "Tâche de résolution", "Lösungsaufgabe"), config: { title: l("Resolve incident", "Resolver incidente", "Resolver incidencia", "Résoudre l'incident", "Vorfall beheben"), priority: "URGENT" } },
      { type: "APPROVAL", name: l("Confirm resolution", "Confirmar resolução", "Confirmar resolución", "Confirmer la résolution", "Behebung bestätigen"), config: { approverId: "", title: l("Confirm the resolution", "Confirmar a resolução", "Confirmar la resolución", "Confirmer la résolution", "Behebung bestätigen"), onRejectJumpToOrder: 5 } },
      { type: "CHANGE_STATUS", name: l("Close task", "Fechar tarefa", "Cerrar tarea", "Clôturer la tâche", "Aufgabe schließen"), config: { status: "DONE" } },
      stepEnd
    ]
  }
];

function isLocalized(value: unknown): value is Localized {
  return typeof value === "object" && value !== null && "en" in value && "pt-PT" in value;
}

export function getWorkflowTemplates(lang: string): WorkflowTemplate[] {
  return workflowTemplateDefs.map((template) => ({
    id: template.id,
    name: pick(template.name, lang),
    description: pick(template.description, lang),
    steps: template.steps.map((step, index) => ({
      order: index,
      type: step.type,
      name: pick(step.name, lang),
      config: Object.fromEntries(Object.entries(step.config ?? {}).map(([key, value]) => [key, isLocalized(value) ? pick(value, lang) : value]))
    }))
  }));
}
