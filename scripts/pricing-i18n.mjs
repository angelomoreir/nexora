// Injects the new pricing-page i18n keys into all 5 locale files (UTF-8 safe).
import { readFileSync, writeFileSync } from "node:fs";

const L = {
  "pt-PT": {
    heroTitle: "Planos simples para uma gestão empresarial mais inteligente",
    heroSub: "Escolha o plano Nexora que melhor se adapta à dimensão e às necessidades da sua organização.",
    billingCycle: "Ciclo de faturação",
    monthly: "Mensal", annual: "Anual",
    annualSave: "Poupe até 2 meses",
    trustNote: "Sem custos ocultos. Faça upgrade ou downgrade quando quiser.",
    perOrganization: "Por organização",
    billedAnnually: "{{total}} faturados por ano",
    freeForever: "Grátis para começar",
    usersUpTo: "Até {{count}} utilizadores",
    usersUnlimited: "Utilizadores ilimitados",
    storageIncluded: "{{size}} de armazenamento",
    storageUnlimited: "Armazenamento ilimitado",
    mostPopular: "Mais popular",
    included: "Incluído", notIncluded: "Não incluído",
    ctaFree: "Começar gratuitamente", ctaContact: "Falar com a Nexora", ctaPlan: "Escolher {{plan}}",
    cardFeatures: {
      free: ["Documentos", "Listas", "Formulários", "Tarefas", "Pesquisa", "Notificações", "Workflows básicos"],
      basic: ["Documentos", "Listas", "Formulários", "Tarefas", "Fluxos de trabalho", "Aprovações", "Notificações", "Pesquisa", "Assistente de IA", "Auditoria básica"],
      professional: ["Tudo do Basic", "Workflows avançados", "Funções personalizadas", "Exportação de auditoria", "Dashboards", "Relatórios", "IA avançada", "API", "Automações"],
      business: ["Tudo do Professional", "SSO", "Análise avançada", "Permissões avançadas", "Automação avançada", "API avançada", "Integrações", "Auditoria completa", "Gestão avançada de equipas"],
      enterprise: ["Tudo do Business", "Suporte dedicado", "SLA garantido", "Integrações personalizadas", "SSO empresarial", "Segurança avançada", "API empresarial", "Onboarding", "Migração de dados", "Gestor de conta"]
    },
    compareTitle: "Compare os planos",
    compareSub: "Todas as funcionalidades, lado a lado.",
    compareFeature: "Funcionalidade",
    compareCategories: { platform: "Plataforma", ai: "IA", admin: "Administração", integrations: "Integrações", support: "Suporte" },
    compareRows: {
      documents: "Documentos", lists: "Listas", forms: "Formulários", tasks: "Tarefas", workflows: "Workflows",
      approvals: "Aprovações", notifications: "Notificações", search: "Pesquisa",
      aiAssistant: "Assistente de IA", aiAdvanced: "IA avançada", automations: "Automações",
      customRoles: "Funções personalizadas", audit: "Auditoria", auditExport: "Exportação de auditoria",
      sso: "SSO", teamManagement: "Gestão de equipas", api: "API", customIntegrations: "Integrações personalizadas",
      standardSupport: "Suporte standard", dedicatedSupport: "Suporte dedicado", sla: "SLA garantido"
    },
    compareValues: { basic: "Básicos", basicAudit: "Básica", fullAudit: "Completa", unlimited: "Ilimitado" },
    pickerTitle: "Qual é o plano certo para a sua empresa?",
    picker: {
      free: "Estou a experimentar o Nexora", basic: "Tenho uma pequena empresa",
      professional: "A minha empresa está a crescer", business: "Preciso de gestão empresarial avançada",
      enterprise: "Preciso de requisitos empresariais específicos"
    },
    viewPlan: "Ver plano",
    extraUsersTitle: "Precisa de mais utilizadores?",
    extraUsersText: "Os planos Nexora foram concebidos para acompanhar o crescimento da sua organização. Pode adicionar utilizadores conforme necessário.",
    extraUserPrice: "{{price}} € por utilizador adicional/mês",
    extraUserCustom: "Preço personalizado",
    faqTitle: "Perguntas frequentes",
    faq: [
      { q: "Os preços são por utilizador?", a: "Não. Os planos Nexora são apresentados por organização e incluem um número definido de utilizadores." },
      { q: "Posso mudar de plano?", a: "Sim. A organização pode fazer upgrade ou downgrade conforme as suas necessidades." },
      { q: "O que acontece se ultrapassar o número de utilizadores incluído?", a: "Pode adicionar utilizadores adicionais de acordo com as condições do seu plano." },
      { q: "Existe faturação anual?", a: "Sim. A faturação anual oferece uma vantagem face à subscrição mensal — equivale a poupar até dois meses por ano." },
      { q: "Existe período experimental?", a: "O plano Free permite experimentar o Nexora sem custo e sem cartão de crédito. Pode começar gratuitamente e fazer upgrade quando precisar de mais capacidade." },
      { q: "Posso cancelar?", a: "Pode cancelar a qualquer momento em Planos e Faturação. O acesso permanece ativo até ao fim do período pago." }
    ],
    finalTitle: "Pronto para simplificar a gestão da sua empresa?",
    finalSub: "Documentos, processos, equipas e inteligência artificial numa única plataforma.",
    taglines: {
      free: "Para experimentar o Nexora", basic: "Para pequenas empresas",
      professional: "Para empresas em crescimento", business: "Para organizações estabelecidas",
      enterprise: "Para grandes organizações"
    }
  },
  en: {
    heroTitle: "Simple plans for smarter business management",
    heroSub: "Choose the Nexora plan that best fits your organization's size and needs.",
    billingCycle: "Billing cycle",
    monthly: "Monthly", annual: "Annual",
    annualSave: "Save up to 2 months",
    trustNote: "No hidden costs. Upgrade or downgrade whenever you want.",
    perOrganization: "Per organization",
    billedAnnually: "{{total}} billed per year",
    freeForever: "Free to get started",
    usersUpTo: "Up to {{count}} users",
    usersUnlimited: "Unlimited users",
    storageIncluded: "{{size}} of storage",
    storageUnlimited: "Unlimited storage",
    mostPopular: "Most popular",
    included: "Included", notIncluded: "Not included",
    ctaFree: "Start for free", ctaContact: "Talk to Nexora", ctaPlan: "Choose {{plan}}",
    cardFeatures: {
      free: ["Documents", "Lists", "Forms", "Tasks", "Search", "Notifications", "Basic workflows"],
      basic: ["Documents", "Lists", "Forms", "Tasks", "Workflows", "Approvals", "Notifications", "Search", "AI assistant", "Basic audit"],
      professional: ["Everything in Basic", "Advanced workflows", "Custom roles", "Audit export", "Dashboards", "Reports", "Advanced AI", "API", "Automations"],
      business: ["Everything in Professional", "SSO", "Advanced analytics", "Advanced permissions", "Advanced automation", "Advanced API", "Integrations", "Full audit", "Advanced team management"],
      enterprise: ["Everything in Business", "Dedicated support", "Guaranteed SLA", "Custom integrations", "Enterprise SSO", "Advanced security", "Enterprise API", "Onboarding", "Data migration", "Account manager"]
    },
    compareTitle: "Compare plans",
    compareSub: "Every feature, side by side.",
    compareFeature: "Feature",
    compareCategories: { platform: "Platform", ai: "AI", admin: "Administration", integrations: "Integrations", support: "Support" },
    compareRows: {
      documents: "Documents", lists: "Lists", forms: "Forms", tasks: "Tasks", workflows: "Workflows",
      approvals: "Approvals", notifications: "Notifications", search: "Search",
      aiAssistant: "AI assistant", aiAdvanced: "Advanced AI", automations: "Automations",
      customRoles: "Custom roles", audit: "Audit", auditExport: "Audit export",
      sso: "SSO", teamManagement: "Team management", api: "API", customIntegrations: "Custom integrations",
      standardSupport: "Standard support", dedicatedSupport: "Dedicated support", sla: "Guaranteed SLA"
    },
    compareValues: { basic: "Basic", basicAudit: "Basic", fullAudit: "Full", unlimited: "Unlimited" },
    pickerTitle: "Which plan is right for your company?",
    picker: {
      free: "I'm trying out Nexora", basic: "I run a small business",
      professional: "My company is growing", business: "I need advanced enterprise management",
      enterprise: "I need specific enterprise requirements"
    },
    viewPlan: "View plan",
    extraUsersTitle: "Need more users?",
    extraUsersText: "Nexora plans are designed to grow with your organization. You can add users as needed.",
    extraUserPrice: "€{{price}} per additional user/month",
    extraUserCustom: "Custom pricing",
    faqTitle: "Frequently asked questions",
    faq: [
      { q: "Are prices per user?", a: "No. Nexora plans are priced per organization and include a defined number of users." },
      { q: "Can I change plans?", a: "Yes. Your organization can upgrade or downgrade as needed." },
      { q: "What happens if I exceed the included users?", a: "You can add additional users according to your plan's terms." },
      { q: "Is annual billing available?", a: "Yes. Annual billing offers an advantage over monthly subscription — equivalent to saving up to two months per year." },
      { q: "Is there a trial period?", a: "The Free plan lets you try Nexora at no cost and with no credit card. Start for free and upgrade when you need more capacity." },
      { q: "Can I cancel?", a: "You can cancel at any time in Plans & Billing. Access stays active until the end of the paid period." }
    ],
    finalTitle: "Ready to simplify your company's management?",
    finalSub: "Documents, processes, teams and artificial intelligence in a single platform.",
    taglines: {
      free: "To try Nexora", basic: "For small businesses",
      professional: "For growing companies", business: "For established organizations",
      enterprise: "For large organizations"
    }
  },
  es: {
    heroTitle: "Planes simples para una gestión empresarial más inteligente",
    heroSub: "Elija el plan Nexora que mejor se adapte al tamaño y a las necesidades de su organización.",
    billingCycle: "Ciclo de facturación",
    monthly: "Mensual", annual: "Anual",
    annualSave: "Ahorre hasta 2 meses",
    trustNote: "Sin costes ocultos. Cambie de plan cuando quiera.",
    perOrganization: "Por organización",
    billedAnnually: "{{total}} facturados al año",
    freeForever: "Gratis para empezar",
    usersUpTo: "Hasta {{count}} usuarios",
    usersUnlimited: "Usuarios ilimitados",
    storageIncluded: "{{size}} de almacenamiento",
    storageUnlimited: "Almacenamiento ilimitado",
    mostPopular: "Más popular",
    included: "Incluido", notIncluded: "No incluido",
    ctaFree: "Empezar gratis", ctaContact: "Hablar con Nexora", ctaPlan: "Elegir {{plan}}",
    cardFeatures: {
      free: ["Documentos", "Listas", "Formularios", "Tareas", "Búsqueda", "Notificaciones", "Flujos básicos"],
      basic: ["Documentos", "Listas", "Formularios", "Tareas", "Flujos de trabajo", "Aprobaciones", "Notificaciones", "Búsqueda", "Asistente de IA", "Auditoría básica"],
      professional: ["Todo lo de Basic", "Flujos avanzados", "Funciones personalizadas", "Exportación de auditoría", "Dashboards", "Informes", "IA avanzada", "API", "Automatizaciones"],
      business: ["Todo lo de Professional", "SSO", "Análisis avanzado", "Permisos avanzados", "Automatización avanzada", "API avanzada", "Integraciones", "Auditoría completa", "Gestión avanzada de equipos"],
      enterprise: ["Todo lo de Business", "Soporte dedicado", "SLA garantizado", "Integraciones personalizadas", "SSO empresarial", "Seguridad avanzada", "API empresarial", "Onboarding", "Migración de datos", "Gestor de cuenta"]
    },
    compareTitle: "Compare los planes",
    compareSub: "Todas las funcionalidades, una al lado de la otra.",
    compareFeature: "Funcionalidad",
    compareCategories: { platform: "Plataforma", ai: "IA", admin: "Administración", integrations: "Integraciones", support: "Soporte" },
    compareRows: {
      documents: "Documentos", lists: "Listas", forms: "Formularios", tasks: "Tareas", workflows: "Flujos de trabajo",
      approvals: "Aprobaciones", notifications: "Notificaciones", search: "Búsqueda",
      aiAssistant: "Asistente de IA", aiAdvanced: "IA avanzada", automations: "Automatizaciones",
      customRoles: "Funciones personalizadas", audit: "Auditoría", auditExport: "Exportación de auditoría",
      sso: "SSO", teamManagement: "Gestión de equipos", api: "API", customIntegrations: "Integraciones personalizadas",
      standardSupport: "Soporte estándar", dedicatedSupport: "Soporte dedicado", sla: "SLA garantizado"
    },
    compareValues: { basic: "Básicos", basicAudit: "Básica", fullAudit: "Completa", unlimited: "Ilimitado" },
    pickerTitle: "¿Cuál es el plan adecuado para su empresa?",
    picker: {
      free: "Estoy probando Nexora", basic: "Tengo una pequeña empresa",
      professional: "Mi empresa está creciendo", business: "Necesito gestión empresarial avanzada",
      enterprise: "Necesito requisitos empresariales específicos"
    },
    viewPlan: "Ver plan",
    extraUsersTitle: "¿Necesita más usuarios?",
    extraUsersText: "Los planes Nexora están diseñados para acompañar el crecimiento de su organización. Puede añadir usuarios según lo necesite.",
    extraUserPrice: "{{price}} € por usuario adicional/mes",
    extraUserCustom: "Precio personalizado",
    faqTitle: "Preguntas frecuentes",
    faq: [
      { q: "¿Los precios son por usuario?", a: "No. Los planes Nexora se presentan por organización e incluyen un número definido de usuarios." },
      { q: "¿Puedo cambiar de plan?", a: "Sí. La organización puede subir o bajar de plan según sus necesidades." },
      { q: "¿Qué pasa si supero el número de usuarios incluido?", a: "Puede añadir usuarios adicionales según las condiciones de su plan." },
      { q: "¿Existe facturación anual?", a: "Sí. La facturación anual ofrece una ventaja frente a la suscripción mensual — equivale a ahorrar hasta dos meses al año." },
      { q: "¿Existe período de prueba?", a: "El plan Free permite probar Nexora sin coste y sin tarjeta de crédito. Empiece gratis y mejore el plan cuando necesite más capacidad." },
      { q: "¿Puedo cancelar?", a: "Puede cancelar en cualquier momento en Planes y Facturación. El acceso permanece activo hasta el final del período pagado." }
    ],
    finalTitle: "¿Listo para simplificar la gestión de su empresa?",
    finalSub: "Documentos, procesos, equipos e inteligencia artificial en una única plataforma.",
    taglines: {
      free: "Para probar Nexora", basic: "Para pequeñas empresas",
      professional: "Para empresas en crecimiento", business: "Para organizaciones establecidas",
      enterprise: "Para grandes organizaciones"
    }
  },
  fr: {
    heroTitle: "Des plans simples pour une gestion d'entreprise plus intelligente",
    heroSub: "Choisissez le plan Nexora qui correspond le mieux à la taille et aux besoins de votre organisation.",
    billingCycle: "Cycle de facturation",
    monthly: "Mensuel", annual: "Annuel",
    annualSave: "Économisez jusqu'à 2 mois",
    trustNote: "Sans coûts cachés. Changez de plan quand vous voulez.",
    perOrganization: "Par organisation",
    billedAnnually: "{{total}} facturés par an",
    freeForever: "Gratuit pour commencer",
    usersUpTo: "Jusqu'à {{count}} utilisateurs",
    usersUnlimited: "Utilisateurs illimités",
    storageIncluded: "{{size}} de stockage",
    storageUnlimited: "Stockage illimité",
    mostPopular: "Le plus populaire",
    included: "Inclus", notIncluded: "Non inclus",
    ctaFree: "Commencer gratuitement", ctaContact: "Parler à Nexora", ctaPlan: "Choisir {{plan}}",
    cardFeatures: {
      free: ["Documents", "Listes", "Formulaires", "Tâches", "Recherche", "Notifications", "Workflows de base"],
      basic: ["Documents", "Listes", "Formulaires", "Tâches", "Workflows", "Approbations", "Notifications", "Recherche", "Assistant IA", "Audit de base"],
      professional: ["Tout de Basic", "Workflows avancés", "Rôles personnalisés", "Export d'audit", "Tableaux de bord", "Rapports", "IA avancée", "API", "Automatisations"],
      business: ["Tout de Professional", "SSO", "Analytique avancée", "Permissions avancées", "Automatisation avancée", "API avancée", "Intégrations", "Audit complet", "Gestion avancée des équipes"],
      enterprise: ["Tout de Business", "Support dédié", "SLA garanti", "Intégrations personnalisées", "SSO entreprise", "Sécurité avancée", "API entreprise", "Onboarding", "Migration de données", "Gestionnaire de compte"]
    },
    compareTitle: "Comparez les plans",
    compareSub: "Toutes les fonctionnalités, côte à côte.",
    compareFeature: "Fonctionnalité",
    compareCategories: { platform: "Plateforme", ai: "IA", admin: "Administration", integrations: "Intégrations", support: "Support" },
    compareRows: {
      documents: "Documents", lists: "Listes", forms: "Formulaires", tasks: "Tâches", workflows: "Workflows",
      approvals: "Approbations", notifications: "Notifications", search: "Recherche",
      aiAssistant: "Assistant IA", aiAdvanced: "IA avancée", automations: "Automatisations",
      customRoles: "Rôles personnalisés", audit: "Audit", auditExport: "Export d'audit",
      sso: "SSO", teamManagement: "Gestion des équipes", api: "API", customIntegrations: "Intégrations personnalisées",
      standardSupport: "Support standard", dedicatedSupport: "Support dédié", sla: "SLA garanti"
    },
    compareValues: { basic: "De base", basicAudit: "De base", fullAudit: "Complète", unlimited: "Illimité" },
    pickerTitle: "Quel plan convient à votre entreprise ?",
    picker: {
      free: "J'essaie Nexora", basic: "J'ai une petite entreprise",
      professional: "Mon entreprise grandit", business: "J'ai besoin d'une gestion d'entreprise avancée",
      enterprise: "J'ai des exigences d'entreprise spécifiques"
    },
    viewPlan: "Voir le plan",
    extraUsersTitle: "Besoin de plus d'utilisateurs ?",
    extraUsersText: "Les plans Nexora sont conçus pour accompagner la croissance de votre organisation. Vous pouvez ajouter des utilisateurs selon vos besoins.",
    extraUserPrice: "{{price}} € par utilisateur supplémentaire/mois",
    extraUserCustom: "Prix personnalisé",
    faqTitle: "Questions fréquentes",
    faq: [
      { q: "Les prix sont-ils par utilisateur ?", a: "Non. Les plans Nexora sont présentés par organisation et incluent un nombre défini d'utilisateurs." },
      { q: "Puis-je changer de plan ?", a: "Oui. L'organisation peut passer à un plan supérieur ou inférieur selon ses besoins." },
      { q: "Que se passe-t-il si je dépasse le nombre d'utilisateurs inclus ?", a: "Vous pouvez ajouter des utilisateurs supplémentaires selon les conditions de votre plan." },
      { q: "Existe-t-il une facturation annuelle ?", a: "Oui. La facturation annuelle offre un avantage par rapport à l'abonnement mensuel — jusqu'à deux mois économisés par an." },
      { q: "Existe-t-il une période d'essai ?", a: "Le plan Free permet d'essayer Nexora gratuitement et sans carte bancaire. Commencez gratuitement et passez au plan supérieur quand vous avez besoin de plus." },
      { q: "Puis-je annuler ?", a: "Vous pouvez annuler à tout moment dans Plans et Facturation. L'accès reste actif jusqu'à la fin de la période payée." }
    ],
    finalTitle: "Prêt à simplifier la gestion de votre entreprise ?",
    finalSub: "Documents, processus, équipes et intelligence artificielle dans une seule plateforme.",
    taglines: {
      free: "Pour essayer Nexora", basic: "Pour les petites entreprises",
      professional: "Pour les entreprises en croissance", business: "Pour les organisations établies",
      enterprise: "Pour les grandes organisations"
    }
  },
  de: {
    heroTitle: "Einfache Pläne für intelligentere Unternehmensführung",
    heroSub: "Wählen Sie den Nexora-Plan, der am besten zur Größe und den Anforderungen Ihrer Organisation passt.",
    billingCycle: "Abrechnungszyklus",
    monthly: "Monatlich", annual: "Jährlich",
    annualSave: "Sparen Sie bis zu 2 Monate",
    trustNote: "Keine versteckten Kosten. Up- oder Downgrade jederzeit möglich.",
    perOrganization: "Pro Organisation",
    billedAnnually: "{{total}} jährlich abgerechnet",
    freeForever: "Kostenlos starten",
    usersUpTo: "Bis zu {{count}} Benutzer",
    usersUnlimited: "Unbegrenzte Benutzer",
    storageIncluded: "{{size}} Speicher",
    storageUnlimited: "Unbegrenzter Speicher",
    mostPopular: "Am beliebtesten",
    included: "Enthalten", notIncluded: "Nicht enthalten",
    ctaFree: "Kostenlos starten", ctaContact: "Mit Nexora sprechen", ctaPlan: "{{plan}} wählen",
    cardFeatures: {
      free: ["Dokumente", "Listen", "Formulare", "Aufgaben", "Suche", "Benachrichtigungen", "Basis-Workflows"],
      basic: ["Dokumente", "Listen", "Formulare", "Aufgaben", "Workflows", "Genehmigungen", "Benachrichtigungen", "Suche", "KI-Assistent", "Basis-Audit"],
      professional: ["Alles aus Basic", "Erweiterte Workflows", "Benutzerdefinierte Rollen", "Audit-Export", "Dashboards", "Berichte", "Erweiterte KI", "API", "Automatisierungen"],
      business: ["Alles aus Professional", "SSO", "Erweiterte Analysen", "Erweiterte Berechtigungen", "Erweiterte Automatisierung", "Erweiterte API", "Integrationen", "Vollständiges Audit", "Erweitertes Teammanagement"],
      enterprise: ["Alles aus Business", "Dedizierter Support", "Garantiertes SLA", "Individuelle Integrationen", "Enterprise-SSO", "Erweiterte Sicherheit", "Enterprise-API", "Onboarding", "Datenmigration", "Account-Manager"]
    },
    compareTitle: "Pläne vergleichen",
    compareSub: "Alle Funktionen im direkten Vergleich.",
    compareFeature: "Funktion",
    compareCategories: { platform: "Plattform", ai: "KI", admin: "Verwaltung", integrations: "Integrationen", support: "Support" },
    compareRows: {
      documents: "Dokumente", lists: "Listen", forms: "Formulare", tasks: "Aufgaben", workflows: "Workflows",
      approvals: "Genehmigungen", notifications: "Benachrichtigungen", search: "Suche",
      aiAssistant: "KI-Assistent", aiAdvanced: "Erweiterte KI", automations: "Automatisierungen",
      customRoles: "Benutzerdefinierte Rollen", audit: "Audit", auditExport: "Audit-Export",
      sso: "SSO", teamManagement: "Teamverwaltung", api: "API", customIntegrations: "Individuelle Integrationen",
      standardSupport: "Standard-Support", dedicatedSupport: "Dedizierter Support", sla: "Garantiertes SLA"
    },
    compareValues: { basic: "Basis", basicAudit: "Basis", fullAudit: "Vollständig", unlimited: "Unbegrenzt" },
    pickerTitle: "Welcher Plan passt zu Ihrem Unternehmen?",
    picker: {
      free: "Ich teste Nexora", basic: "Ich habe ein kleines Unternehmen",
      professional: "Mein Unternehmen wächst", business: "Ich brauche erweitertes Enterprise-Management",
      enterprise: "Ich habe spezifische Unternehmensanforderungen"
    },
    viewPlan: "Plan ansehen",
    extraUsersTitle: "Benötigen Sie mehr Benutzer?",
    extraUsersText: "Nexora-Pläne sind darauf ausgelegt, mit Ihrer Organisation zu wachsen. Sie können Benutzer nach Bedarf hinzufügen.",
    extraUserPrice: "{{price}} € pro zusätzlichem Benutzer/Monat",
    extraUserCustom: "Individueller Preis",
    faqTitle: "Häufige Fragen",
    faq: [
      { q: "Sind die Preise pro Benutzer?", a: "Nein. Nexora-Pläne werden pro Organisation angeboten und enthalten eine festgelegte Anzahl von Benutzern." },
      { q: "Kann ich den Plan wechseln?", a: "Ja. Ihre Organisation kann je nach Bedarf upgraden oder downgraden." },
      { q: "Was passiert, wenn ich die enthaltenen Benutzer überschreite?", a: "Sie können gemäß den Bedingungen Ihres Plans zusätzliche Benutzer hinzufügen." },
      { q: "Gibt es jährliche Abrechnung?", a: "Ja. Die jährliche Abrechnung bietet einen Vorteil gegenüber dem monatlichen Abonnement — entspricht einer Ersparnis von bis zu zwei Monaten pro Jahr." },
      { q: "Gibt es eine Testphase?", a: "Der Free-Plan ermöglicht es, Nexora kostenlos und ohne Kreditkarte zu testen. Starten Sie gratis und upgraden Sie, wenn Sie mehr Kapazität brauchen." },
      { q: "Kann ich kündigen?", a: "Sie können jederzeit unter Pläne & Abrechnung kündigen. Der Zugriff bleibt bis zum Ende des bezahlten Zeitraums aktiv." }
    ],
    finalTitle: "Bereit, die Verwaltung Ihres Unternehmens zu vereinfachen?",
    finalSub: "Dokumente, Prozesse, Teams und künstliche Intelligenz in einer einzigen Plattform.",
    taglines: {
      free: "Um Nexora zu testen", basic: "Für kleine Unternehmen",
      professional: "Für wachsende Unternehmen", business: "Für etablierte Organisationen",
      enterprise: "Für große Organisationen"
    }
  }
};

function serialize(value, indent) {
  const pad = "  ".repeat(indent);
  if (Array.isArray(value)) {
    if (value.every(v => typeof v === "string")) return `[${value.map(v => JSON.stringify(v)).join(", ")}]`;
    return `[\n${value.map(v => pad + "  " + serialize(v, indent + 1)).join(",\n")}\n${pad}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value).map(([k, v]) => `${pad}  ${k}: ${serialize(v, indent + 1)}`);
    return `{\n${entries.join(",\n")}\n${pad}}`;
  }
  return JSON.stringify(value);
}

for (const [locale, d] of Object.entries(L)) {
  const path = `apps/web/src/i18n/locales/${locale}.ts`;
  let src = readFileSync(path, "utf8");

  // 1) Extend public.pricing — insert new keys right after "pricing: {"
  const anchor = /pricing: \{\n/;
  const m = anchor.exec(src.slice(src.indexOf("public: {")));
  if (!m) { console.log(`!! pricing block not found in ${locale}`); continue; }
  const at = src.indexOf("public: {") + m.index + m[0].length;
  const { taglines, ...pricing } = d;
  const body = Object.entries(pricing).map(([k, v]) => `      ${k}: ${serialize(v, 3)},`).join("\n");
  src = src.slice(0, at) + body + "\n" + src.slice(at);

  // 2) Add tagline to each plan entry: code: { name: "X", description: "Y" } → + tagline
  for (const [code, tagline] of Object.entries(taglines)) {
    const re = new RegExp(`(${code}: \\{ name: "[^"]*", description: "[^"]*") \\}`);
    if (!re.test(src)) { console.log(`!! plan ${code} not found in ${locale}`); continue; }
    src = src.replace(re, `$1, tagline: ${JSON.stringify(tagline)} }`);
  }

  writeFileSync(path, src, "utf8");
  console.log(`${locale} updated`);
}
