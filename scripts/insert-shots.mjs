// Inserts <figure> screenshots at the end of each manual chapter, then rebuilds nexora-manual.html.
import { readFileSync, writeFileSync } from "node:fs";

const DIR = "docs/manual";

const CSS = `  figure.shot { margin: 14px 0; page-break-inside: avoid; }
  figure.shot img { width: 100%; border: 1px solid #cbd5e1; border-radius: 6px; }
  figure.shot figcaption { font-size: 8.5pt; color: #64748b; margin-top: 5px; font-style: italic; }
  .shotgrid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .shotgrid figure.shot { margin: 6px 0; }
`;

const fig = (file, cap) =>
  `<figure class="shot"><img src="shots/${file}.png" alt="${cap}"><figcaption>${cap}</figcaption></figure>\n`;

// chapter h1 id -> figures appended at end of that chapter
const inserts = {
  "part1.html": {
    intro: [fig("02-landing", "Página pública da NEXORA — o primeiro contacto de um cliente com a plataforma.")]
  },
  "part2.html": {
    onboarding: [
      fig("01-register", "Passo 1 — a Ana regista a empresa XPTO, Lda. na página de registo."),
      fig("00-login", "Página de login — cada utilizador entra com o seu próprio email e palavra-passe.")
    ],
    navegacao: [fig("28-help", "Central de Ajuda — artigos organizados por categorias, pesquisa integrada.")],
    dashboard: [
      fig("10-dashboard-ana", "Dashboard — perspetiva da Ana (Admin): ações rápidas, primeiros passos e métricas."),
      fig("40-dashboard-carla", "Dashboard — perspetiva da Carla (Member): a sua tarefa atribuída em destaque.")
    ]
  },
  "part3.html": {
    documentos: [fig("11-documents", "Documentos — vista da Ana: pastas «Clientes» e «Documentos», filtros e ações.")],
    listas: [
      fig("31-lists", "Listas — vista do Bruno (Manager): a lista «Clientes» criada para a carteira comercial."),
      fig("32-list-detail", "Detalhe da lista «Clientes» — campos personalizados e registos da carteira XPTO.")
    ],
    formularios: [fig("33-forms", "Formulários — vista do Bruno (Manager).")]
  },
  "part4.html": {
    tarefas: [fig("41-tasks-carla", "Tarefas — vista da Carla (Member): «Rever proposta ABC» atribuída a ela, com prioridade Alta.")],
    workflows: [
      fig("34-workflows", "Workflows — vista do Bruno: o processo «Aprovação de Despesas» publicado."),
      fig("35-workflow-detail", "Detalhe do workflow — os 4 passos: submissão, aprovação do gestor, notificação e fecho.")
    ],
    aprovacoes: [fig("36-approvals", "Aprovações — caixa de entrada de aprovações do Bruno (Manager).")],
    sites: [fig("37-sites", "Sites — gestão de sites/portais internos da organização.")],
    noticias: [
      fig("38-news", "Notícias — o post «Bem-vindos à NEXORA» publicado pelo Bruno."),
      fig("39-news-detail", "Artigo de notícia — conteúdo completo com categoria e etiquetas.")
    ],
    pesquisa: [fig("12-search", "Pesquisa global — resultados de todos os módulos num único ecrã.")]
  },
  "part5.html": {
    notificacoes: [fig("14-notifications", "Notificações — a Ana vê a atividade recente da organização.")],
    ia: [fig("13-ai", "Assistente IA — chat contextual que opera sobre o conteúdo da organização.")],
    admin: [
      fig("20-admin-hub", "Administração — o hub com as 9 áreas de gestão, visível apenas para a Ana (Admin)."),
      fig("21-admin-users", "Utilizadores — os 3 membros da XPTO e o convite pendente para o Duarte."),
      fig("22-admin-roles", "Funções — os roles do sistema e personalizados com as respetivas permissões."),
      fig("23-admin-teams", "Equipas — a equipa «Consultores» criada pela Ana."),
      fig("24-admin-audit", "Auditoria — registo completo de todas as ações na organização."),
      fig("25-admin-settings", "Definições da organização — branding, idioma e opções gerais."),
      fig("26-admin-governance", "Governação — políticas de retenção e sensibilidade documental.")
    ],
    faturacao: [fig("27-billing", "Planos e Faturação — gestão da subscrição e métodos de pagamento.")]
  }
};

let rebuilt = "";
for (let p = 1; p <= 6; p++) {
  const file = `part${p}.html`;
  let html = readFileSync(`${DIR}/${file}`, "utf8");
  const map = inserts[file] ?? {};
  for (const [chapterId, figs] of Object.entries(map)) {
    const h1re = new RegExp(`<h1[^>]*id="${chapterId}"[^>]*>`);
    const m = h1re.exec(html);
    if (!m) { console.log(`!! chapter ${chapterId} not found in ${file}`); continue; }
    const next = html.indexOf("<h1", m.index + m[0].length);
    const at = next === -1 ? html.length : next;
    html = html.slice(0, at) + figs.join("") + html.slice(at);
    console.log(`+ ${file} [${chapterId}] ${figs.length} fig(s)`);
  }
  rebuilt += html + "\n";
}

// figure CSS into the assembled <style>
rebuilt = rebuilt.replace("</style>", CSS + "</style>");
writeFileSync(`${DIR}/nexora-manual.html`, rebuilt, "utf8");
console.log("manual rebuilt:", rebuilt.length, "bytes");
