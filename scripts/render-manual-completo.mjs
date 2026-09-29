// Builds docs/NEXORA-manual-completo.html by assembling all NEXORA-guia-*.html
// guides into one master document (cover + TOC + part/chapter dividers), then
// renders it to NEXORA-manual-completo.pdf via headless Edge.
// Two passes: pass 1 finds the page each chapter lands on, pass 2 writes the
// real page numbers into the TOC (Chromium does not support CSS target-counter).
// Usage: node scripts/render-manual-completo.mjs
import puppeteer from "puppeteer-core";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");

const docsDir = fileURLToPath(new URL("../docs/", import.meta.url));

const PARTS = [
  {
    title: "Começar",
    desc: "Leitura obrigatória antes de tudo o resto: o que é o NEXORA, conceitos, entrada na plataforma e navegação.",
    chapters: [
      { slug: "introducao", title: "Introdução e navegação", route: null, desc: "Conceitos, registo e convites, anatomia da interface, glossário e FAQ." }
    ]
  },
  {
    title: "O seu dia a dia",
    desc: "As ferramentas pessoais: o que fazer hoje, o estado da operação, encontrar qualquer item e gerir alertas.",
    chapters: [
      { slug: "meu-dia", title: "O meu dia", route: "/my-day", desc: "Painel pessoal de foco: as suas tarefas, aprovações pendentes e notificações." },
      { slug: "dashboard", title: "Dashboard", route: "/dashboard", desc: "Métricas e atividade da organização, com dashboards personalizados." },
      { slug: "pesquisa", title: "Pesquisa", route: "/search", desc: "Busca global em todos os módulos e a paleta de comandos (Ctrl+K)." },
      { slug: "notificacoes", title: "Notificações", route: "/notifications", desc: "Alertas in-app, ciclo lida/não lida e subscrição de recursos." }
    ]
  },
  {
    title: "Conteúdo",
    desc: "Os dados e a apresentação: ficheiros, dados estruturados, recolha de informação, portais internos e comunicação.",
    chapters: [
      { slug: "documentos", title: "Documentos", route: "/documents", desc: "Pastas, upload, versões, partilha, links públicos e governação." },
      { slug: "listas", title: "Listas", route: "/lists", desc: "Tabelas de dados com 13 tipos de campo, relações, vistas e CSV." },
      { slug: "formularios", title: "Formulários", route: "/forms", desc: "Recolha de dados com construtor visual, publicação e exportação." },
      { slug: "sites", title: "Sites", route: "/sites", desc: "Portais internos com páginas de widgets, hierarquia e papéis locais." },
      { slug: "noticias", title: "Notícias", route: "/news", desc: "Comunicação interna com estados editoriais, agendamento e comentários." }
    ]
  },
  {
    title: "Trabalho e automação",
    desc: "Execução e automação: tarefas do dia a dia, decisões humanas e processos que correm sozinhos.",
    chapters: [
      { slug: "tarefas", title: "Tarefas", route: "/tasks", desc: "Gestão de trabalho: estados, prioridades, responsáveis e prazos." },
      { slug: "aprovacoes", title: "Aprovações", route: "/approvals", desc: "A fila de decisões dos processos: aprovar, rejeitar e delegar." },
      { slug: "processos", title: "Processos (Workflows)", route: "/workflows", desc: "Automação: construtor de passos, publicação, execuções e instâncias." },
      { slug: "ia", title: "IA (Copilot)", route: "/ai", desc: "Assistente conversacional que cria listas, processos e aplicações." }
    ]
  },
  {
    title: "Organização",
    desc: "Gestão e configuração: métricas, administração, faturação, utilizadores e a sua conta.",
    chapters: [
      { slug: "analise", title: "Análise", route: "/analytics", desc: "Métricas operacionais e tendências — KPIs, gráficos e adoção." },
      { slug: "administracao", title: "Administração", route: "/admin", desc: "Utilizadores, papéis, auditoria, segurança, webhooks e definições." },
      { slug: "planos", title: "Planos (Faturação)", route: "/billing", desc: "Subscrição atual, limites de utilização e mudança de plano." },
      { slug: "configuracoes", title: "Configurações", route: "/settings", desc: "Gestão rápida de utilizadores da organização." },
      { slug: "perfil", title: "Perfil", route: "/profile", desc: "A sua identidade, palavra-passe e sessões ativas." },
      { slug: "ajuda", title: "Ajuda", route: "/help", desc: "Centro de documentação, pesquisa de artigos e assistente." }
    ]
  },
  {
    title: "Apêndice",
    desc: "A narrativa da empresa fictícia que dá contexto a todos os exemplos do manual.",
    chapters: [
      { slug: "caso-xpto", title: "Caso de Estudo: a empresa XPTO", route: null, desc: "Os 5 utilizadores, a matriz de funções e cinco cenários completos de colaboração." }
    ]
  }
];

const ROMAN = ["I", "II", "III", "IV", "V", "VI"];

function readGuide(slug) {
  const html = readFileSync(`${docsDir}NEXORA-guia-${slug}.html`, "utf8");
  const start = html.indexOf("<h2");
  const end = html.lastIndexOf("</body>");
  if (start === -1 || end === -1) throw new Error(`Estrutura inesperada em NEXORA-guia-${slug}.html`);
  return html.slice(start, end);
}

function buildHtml(pageMap) {
  let chapterNo = 0;
  const tocParts = [];
  const bodySections = [];

  PARTS.forEach((part, partIdx) => {
    const isAppendix = part.title === "Apêndice";
    const partLabel = isAppendix ? "Apêndice" : `Parte ${ROMAN[partIdx]}`;

    const items = part.chapters.map((ch) => {
      chapterNo += 1;
      ch.num = isAppendix ? "A" : String(chapterNo);
      ch.marker = ch.desc; // unique text on the divider page, used for page lookup
      const pg = pageMap?.get(ch.slug);
      return `<li><a href="#cap-${ch.slug}"><span class="cap-label">${ch.num} · ${ch.title}</span><span class="fill"></span><span class="pg">${pg ?? ""}</span></a></li>`;
    }).join("\n");

    tocParts.push(`<p class="toc-part">${isAppendix ? "Apêndice" : `${partLabel} — ${part.title}`}</p><ol class="toc-list">${items}</ol>`);

    bodySections.push(`
<section class="part-divider">
  <div class="part-num">${partLabel}</div>
  <h1>${part.title}</h1>
  <p class="part-desc">${part.desc}</p>
  <ul class="part-toc">${part.chapters.map((c) => `<li>${c.title}</li>`).join("")}</ul>
</section>`);

    for (const ch of part.chapters) {
      bodySections.push(`
<section class="chapter-divider" id="cap-${ch.slug}">
  <div class="cap-part">${isAppendix ? "Apêndice" : `${partLabel} — ${part.title}`}</div>
  <div class="cap-num">${ch.num}</div>
  <h1>${ch.title}</h1>
  <p class="cap-desc">${ch.desc}</p>
  ${ch.route ? `<p class="cap-route">Menu lateral → ${ch.title.replace(/ \(.*\)/, "")} · <code>${ch.route}</code></p>` : `<p class="cap-route">Documento de referência · <code>docs/NEXORA-guia-${ch.slug}.html</code></p>`}
</section>
<section class="chapter-content">
${readGuide(ch.slug)}
</section>`);
    }
  });

  return `<!DOCTYPE html>
<html lang="pt-PT">
<head>
<meta charset="utf-8">
<title>NEXORA — Manual Completo</title>
<style>
  @page { size: A4; margin: 18mm 15mm 18mm 15mm; }
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", Arial, sans-serif; font-size: 9.5pt; color: #1c2430; line-height: 1.45; margin: 0; }
  h1 { font-size: 22pt; margin: 0 0 4mm; color: #0f172a; }
  h2 { font-size: 13.5pt; color: #0f172a; border-bottom: 2.5px solid #4f46e5; padding-bottom: 1.5mm; margin: 8mm 0 3mm; page-break-after: avoid; }
  h3 { font-size: 11pt; color: #3730a3; margin: 5mm 0 2mm; page-break-after: avoid; }
  h4 { font-size: 10pt; color: #0f172a; margin: 3.5mm 0 1.5mm; page-break-after: avoid; }
  p { margin: 1.5mm 0; }
  table { border-collapse: collapse; width: 100%; margin: 2mm 0 4mm; }
  th { background: #eef2ff; color: #312e81; text-align: left; font-size: 8.5pt; }
  th, td { border: 1px solid #cbd5e1; padding: 1.4mm 2mm; vertical-align: top; }
  tr { page-break-inside: avoid; }
  thead { display: table-header-group; }
  code { background: #f1f5f9; padding: 0 3px; border-radius: 3px; font-family: Consolas, monospace; font-size: 8.5pt; }
  ol.steps { margin: 1mm 0 3mm; padding-left: 6mm; }
  ol.steps > li { margin: 1.1mm 0; padding-left: 1mm; }
  .exp { color: #166534; }
  .exp::before { content: "→ Esperado: "; font-weight: 600; color: #15803d; }
  .deny { color: #b91c1c; }
  .deny::before { content: "→ Esperado (negado): "; font-weight: 600; color: #b91c1c; }
  .note { background: #fffbeb; border: 1px solid #f59e0b; border-left-width: 4px; padding: 2mm 3mm; border-radius: 2px; margin: 2mm 0; }
  .tip { background: #eff6ff; border: 1px solid #3b82f6; border-left-width: 4px; padding: 2mm 3mm; border-radius: 2px; margin: 2mm 0; }
  .example { background: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #4f46e5; padding: 2.5mm 3mm; border-radius: 2px; margin: 2mm 0; }
  .example .ex-title { font-weight: 700; color: #3730a3; margin-bottom: 1mm; }
  ul { margin: 1mm 0 2mm; padding-left: 5.5mm; }
  li { margin: 0.8mm 0; }
  .small { font-size: 8.5pt; color: #475569; }
  .no-break { page-break-inside: avoid; }

  .cover { text-align: center; padding-top: 65mm; page-break-after: always; }
  .cover .brand { font-size: 34pt; font-weight: 800; letter-spacing: 7px; color: #4f46e5; }
  .cover .sub { font-size: 15pt; color: #475569; margin-top: 5mm; }
  .cover .meta { margin-top: 24mm; font-size: 10pt; color: #64748b; }

  .toc { page-break-after: always; }
  .toc h1 { font-size: 20pt; border-bottom: 3px solid #4f46e5; padding-bottom: 2mm; }
  .toc-part { font-weight: 700; color: #3730a3; font-size: 11pt; margin: 6mm 0 1.5mm; }
  .toc-list { list-style: none; margin: 0 0 2mm; padding: 0; }
  .toc-list li { margin: 1.2mm 0; }
  .toc-list a { display: flex; align-items: baseline; text-decoration: none; color: #1c2430; }
  .toc-list .cap-label { font-weight: 500; }
  .toc-list .fill { flex: 1; margin: 0 2mm; border-bottom: 1px dotted #94a3b8; }
  .toc-list .pg { color: #475569; font-variant-numeric: tabular-nums; min-width: 6mm; text-align: right; }

  .part-divider, .chapter-divider { page-break-before: always; page-break-after: always; text-align: center; padding-top: 90mm; }
  .part-divider .part-num, .chapter-divider .cap-part { font-size: 11pt; font-weight: 700; letter-spacing: 3px; color: #4f46e5; text-transform: uppercase; }
  .part-divider h1, .chapter-divider h1 { font-size: 26pt; margin-top: 6mm; }
  .part-divider .part-desc, .chapter-divider .cap-desc { font-size: 11pt; color: #475569; margin-top: 5mm; }
  .part-divider .part-toc { list-style: none; margin-top: 10mm; padding: 0; }
  .part-divider .part-toc li { font-size: 11pt; color: #334155; margin: 2mm 0; }
  .chapter-divider .cap-num { font-size: 60pt; font-weight: 800; color: #e0e7ff; line-height: 1; margin-top: 10mm; }
  .chapter-divider .cap-route { margin-top: 12mm; font-size: 9.5pt; color: #64748b; }
</style>
</head>
<body>

<div class="cover">
  <div class="brand">NEXORA</div>
  <div class="sub">Manual Completo — Todos os módulos</div>
  <div class="meta">
    <p>20 capítulos · um por opção do menu lateral + introdução · apêndice com o caso de estudo XPTO</p>
    <p>Ambiente: desenvolvimento local · Web http://localhost:5173</p>
    <p>Versão: 1.0 · Data: ____________</p>
  </div>
</div>

<nav class="toc">
  <h1>Índice</h1>
  ${tocParts.join("\n")}
</nav>

${bodySections.join("\n")}

</body>
</html>
`;
}

async function renderPdf(page, htmlPath, pdfPath) {
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "networkidle0" });
  await page.pdf({
    path: pdfPath,
    format: "A4",
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: `<div style="font-size:7px;width:100%;text-align:right;color:#94a3b8;padding-right:15mm">NEXORA · Manual Completo</div>`,
    footerTemplate: `<div style="font-size:8px;width:100%;text-align:center;color:#64748b"><span class="pageNumber"></span> / <span class="totalPages"></span></div>`,
    margin: { top: "18mm", bottom: "18mm", left: "15mm", right: "15mm" }
  });
}

const htmlPath = `${docsDir}NEXORA-manual-completo.html`;
const pdfPath = htmlPath.replace(/\.html$/, ".pdf");
const tmpPdf = `${docsDir}.manual-pass1.pdf`;

const browser = await puppeteer.launch({
  executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  headless: true
});
const page = await browser.newPage();

// Pass 1 — render without TOC numbers and locate each chapter divider page
writeFileSync(htmlPath, buildHtml(null), "utf8");
await renderPdf(page, htmlPath, tmpPdf);

const pageTexts = [];
await pdfParse(readFileSync(tmpPdf), {
  pagerender: (pageData) =>
    pageData.getTextContent().then((tc) => {
      const text = tc.items.map((i) => i.str).join(" ").replace(/\s+/g, " ");
      pageTexts.push(text);
      return text;
    })
});

const pageMap = new Map();
for (const part of PARTS) {
  for (const ch of part.chapters) {
    const marker = ch.marker.replace(/\s+/g, " ");
    const idx = pageTexts.findIndex((t) => t.includes(marker));
    if (idx === -1) throw new Error(`Capítulo não localizado no PDF: ${ch.slug}`);
    pageMap.set(ch.slug, idx + 1);
  }
}

// Pass 2 — final render with real page numbers in the TOC
writeFileSync(htmlPath, buildHtml(pageMap), "utf8");
await renderPdf(page, htmlPath, pdfPath);
await browser.close();

const { unlinkSync } = await import("node:fs");
unlinkSync(tmpPdf);
console.log("HTML gerado:", htmlPath);
console.log("PDF gerado:", pdfPath);
console.log("Capítulos:", [...pageMap.entries()].map(([s, p]) => `${s}→p.${p}`).join(", "));
