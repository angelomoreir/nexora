import { readFileSync, writeFileSync } from "node:fs";

const MAP = {
  "pt-PT": {
    document: "Documento", folder: "Pasta", user: "Utilizador", task: "Tarefa", workflow: "Workflow",
    form: "Formulário", list: "Lista", listItem: "Item de lista", listDefinition: "Definição de lista",
    site: "Site", newsPost: "Notícia", team: "Equipa", role: "Função", invitation: "Convite",
    webhook: "Webhook", dashboard: "Dashboard", approval: "Aprovação", project: "Projeto",
    organization: "Organização", organizationSettings: "Definições da organização",
    organizationSubscription: "Subscrição", ssoConfiguration: "Configuração SSO",
    savedView: "Vista guardada", announcement: "Anúncio"
  },
  en: {
    document: "Document", folder: "Folder", user: "User", task: "Task", workflow: "Workflow",
    form: "Form", list: "List", listItem: "List item", listDefinition: "List definition",
    site: "Site", newsPost: "News post", team: "Team", role: "Role", invitation: "Invitation",
    webhook: "Webhook", dashboard: "Dashboard", approval: "Approval", project: "Project",
    organization: "Organization", organizationSettings: "Organization settings",
    organizationSubscription: "Subscription", ssoConfiguration: "SSO configuration",
    savedView: "Saved view", announcement: "Announcement"
  },
  es: {
    document: "Documento", folder: "Carpeta", user: "Usuario", task: "Tarea", workflow: "Flujo de trabajo",
    form: "Formulario", list: "Lista", listItem: "Elemento de lista", listDefinition: "Definición de lista",
    site: "Sitio", newsPost: "Noticia", team: "Equipo", role: "Rol", invitation: "Invitación",
    webhook: "Webhook", dashboard: "Panel", approval: "Aprobación", project: "Proyecto",
    organization: "Organización", organizationSettings: "Configuración de la organización",
    organizationSubscription: "Suscripción", ssoConfiguration: "Configuración SSO",
    savedView: "Vista guardada", announcement: "Anuncio"
  },
  fr: {
    document: "Document", folder: "Dossier", user: "Utilisateur", task: "Tâche", workflow: "Workflow",
    form: "Formulaire", list: "Liste", listItem: "Élément de liste", listDefinition: "Définition de liste",
    site: "Site", newsPost: "Actualité", team: "Équipe", role: "Rôle", invitation: "Invitation",
    webhook: "Webhook", dashboard: "Tableau de bord", approval: "Approbation", project: "Projet",
    organization: "Organisation", organizationSettings: "Paramètres de l'organisation",
    organizationSubscription: "Abonnement", ssoConfiguration: "Configuration SSO",
    savedView: "Vue enregistrée", announcement: "Annonce"
  },
  de: {
    document: "Dokument", folder: "Ordner", user: "Benutzer", task: "Aufgabe", workflow: "Workflow",
    form: "Formular", list: "Liste", listItem: "Listenelement", listDefinition: "Listendefinition",
    site: "Website", newsPost: "News", team: "Team", role: "Rolle", invitation: "Einladung",
    webhook: "Webhook", dashboard: "Dashboard", approval: "Genehmigung", project: "Projekt",
    organization: "Organisation", organizationSettings: "Organisationseinstellungen",
    organizationSubscription: "Abonnement", ssoConfiguration: "SSO-Konfiguration",
    savedView: "Gespeicherte Ansicht", announcement: "Ankündigung"
  }
};

for (const [locale, types] of Object.entries(MAP)) {
  const path = `apps/web/src/i18n/locales/${locale}.ts`;
  let src = readFileSync(path, "utf8");
  const anchor = /(    adoptionEmpty: "[^"]*")/;
  const match = src.match(anchor);
  if (!match) { console.error(`${locale}: adoptionEmpty not found`); process.exit(1); }
  const block = `\n    resourceTypes: {\n${Object.entries(types).map(([k, v]) => `      ${k}: "${v}"`).join(",\n")}\n    }`;
  src = src.replace(anchor, `$1,${block}`);
  writeFileSync(path, src, "utf8");
  console.log(`${locale}: added ${Object.keys(types).length} resource type labels`);
}
