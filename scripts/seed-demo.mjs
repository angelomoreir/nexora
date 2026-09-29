// Seeds the demo company "XPTO, Lda." with 3 users + sample data for manual screenshots.
const API = "http://127.0.0.1:3000/api/v1";
const PASSWORD = "XPTOdemo2024!";

const cookies = new Map();
function cookieHeader() {
  return [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}
function storeCookies(res) {
  const set = res.headers.getSetCookie?.() ?? [];
  for (const c of set) {
    const [pair] = c.split(";");
    const i = pair.indexOf("=");
    cookies.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function api(path, { method = "GET", body, form } = {}, attempt = 0) {
  const headers = { Accept: "application/json", Cookie: cookieHeader() };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: form ?? (body !== undefined ? JSON.stringify(body) : undefined)
  });
  storeCookies(res);
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (res.status === 429 && attempt < 8) {
    await sleep(20_000);
    return api(path, { method, body, form }, attempt + 1);
  }
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${typeof data === "string" ? data : JSON.stringify(data)}`);
  return data;
}

function login(email) {
  cookies.clear();
  return api("/auth/login", { method: "POST", body: { email, password: PASSWORD } });
}

const session = () => api("/auth/me");
const orgsOf = (s) => s.organizations ?? s.user?.organizations ?? [];

async function ensureUser(name, email, jobTitle, orgId, role) {
  // If already exists, just log in.
  try {
    await login(email);
    const user = await session();
    console.log(`exists  ${email}`);
    return user;
  } catch {
    await login(ana.email); // restore admin session before creating
    await api(`/organizations/${orgId}/users`, {
      method: "POST",
      body: { name, email, password: PASSWORD, role, jobTitle }
    });
    console.log(`created ${email} (${role})`);
    await login(email);
    return session();
  }
}

const ana = { name: "Ana Silva", email: "ana@xpto.pt" };

// 1) Ana registers the company (or logs in if it exists)
let anaUser;
try {
  await api("/auth/register", { method: "POST", body: { ...ana, password: PASSWORD, organizationName: "XPTO, Lda." } });
  console.log("registered ana@xpto.pt + org XPTO, Lda.");
  anaUser = await session();
} catch {
  await login(ana.email);
  anaUser = await session();
  console.log("ana already existed");
}
const org = orgsOf(anaUser).find(o => /xpto/i.test(o.name));
if (!org) throw new Error("XPTO org not found on Ana");
console.log(`org: ${org.name} (${org.id})`);

// Back as Ana for the rest
await login(ana.email);

// 2) Create colleagues — one per role
await ensureUser("Bruno Costa", "bruno@xpto.pt", "Gestor de Operações", org.id, "Manager");
await ensureUser("Carla Mendes", "carla@xpto.pt", "Consultora", org.id, "Member");
await ensureUser("Diana Rocha", "diana@xpto.pt", "Gestora de Conteúdos", org.id, "Editor");
await ensureUser("Eduardo Santos", "eduardo@xpto.pt", "Diretor Financeiro", org.id, "Viewer");

// membership ids (for task assignment / workflow config)
await login(ana.email);
const users = await api(`/organizations/${org.id}/users`);
const member = (email) => users.find(u => u.email === email);
const carla = member("carla@xpto.pt"), bruno = member("bruno@xpto.pt");
const mid = (u) => u.memberId ?? u.membershipId ?? u.id;

// 3) Folders + a document
const res0 = await api(`/organizations/${org.id}/documents`);
const folders = res0.folders ?? [];
let clientes = folders.find(f => f.name === "Clientes");
if (!clientes) clientes = await api(`/organizations/${org.id}/folders`, { method: "POST", body: { name: "Clientes", parentId: null } });
const sub = await api(`/organizations/${org.id}/documents?folderId=${clientes.id}`);
let propostas = (sub.folders ?? []).find(f => f.name === "Propostas");
if (!propostas) propostas = await api(`/organizations/${org.id}/folders`, { method: "POST", body: { name: "Propostas", parentId: clientes.id } });
const subP = await api(`/organizations/${org.id}/documents?folderId=${propostas.id}`);
let proposta = (subP.documents ?? []).find(d => d.name.startsWith("Proposta-ABC"));
if (!proposta) {
  const form = new FormData();
  form.append("file", new Blob([`PROPOSTA COMERCIAL — ABC, S.A.\n\nCliente: ABC, S.A.\nValor: 18.500 EUR\nValidade: 30 dias\n\n1. Âmbito\nImplementação da plataforma NEXORA para gestão documental e processos.\n\n2. Fases\n- Levantamento de requisitos (2 semanas)\n- Configuração e migração (4 semanas)\n- Formação e go-live (1 semana)\n\n3. Investimento\nLicenciamento anual: 12.000 EUR\nServiços de implementação: 6.500 EUR\n\nXPTO, Lda. — Departamento Comercial`], { type: "text/plain" }), "Proposta-ABC-v1.txt");
  proposta = (await api(`/organizations/${org.id}/documents?folderId=${propostas.id}`, { method: "POST", form }));
}
console.log("documents ready");

// 4) List "Clientes" + items
const resL = await api(`/organizations/${org.id}/lists`); let lists = resL.lists ?? (Array.isArray(resL) ? resL : []);
let lista = lists.find(l => l.name === "Clientes");
if (!lista) {
  lista = (await api(`/organizations/${org.id}/lists`, {
    method: "POST",
    body: {
      name: "Clientes",
      description: "Carteira de clientes e estado das contas",
      icon: "users",
      fields: [
        { name: "Nome", slug: "nome", type: "text", required: true, order: 0 },
        { name: "Setor", slug: "setor", type: "choice", required: false, order: 1, options: [
          { value: "industria", label: "Indústria" }, { value: "retalho", label: "Retalho" }, { value: "servicos", label: "Serviços" }] },
        { name: "Estado", slug: "estado", type: "choice", required: true, order: 2, options: [
          { value: "ativo", label: "Ativo" }, { value: "prospeccao", label: "Prospeção" }, { value: "inativo", label: "Inativo" }] },
        { name: "Valor anual", slug: "valor-anual", type: "number", required: false, order: 3 },
        { name: "Contacto", slug: "contacto", type: "text", required: false, order: 4 }
      ]
    }
  }));
  for (const values of [
    { nome: "ABC, S.A.", setor: "industria", estado: "ativo", "valor-anual": 18500, contacto: "geral@abc.pt" },
    { nome: "Retail Prime", setor: "retalho", estado: "prospeccao", "valor-anual": 9200, contacto: "compras@retailprime.pt" },
    { nome: "ConsultLis", setor: "servicos", estado: "ativo", "valor-anual": 12400, contacto: "info@consullis.pt" }
  ]) {
    await api(`/organizations/${org.id}/lists/${lista.id}/items`, { method: "POST", body: { values } });
  }
}
console.log("list ready");

// 5) Project + tasks
const resP = await api(`/organizations/${org.id}/projects`); let projects = resP.projects ?? (Array.isArray(resP) ? resP : []);
let proj = projects.find(p => p.name === "Onboarding ABC");
if (!proj) proj = (await api(`/organizations/${org.id}/projects`, { method: "POST", body: { name: "Onboarding ABC", description: "Implementação NEXORA no cliente ABC, S.A.", color: "#0ea5e9" } }));
const resT = await api(`/organizations/${org.id}/tasks`); const tasks = resT.tasks ?? (Array.isArray(resT) ? resT : []);
if (!tasks.length) {
  await api(`/organizations/${org.id}/tasks`, { method: "POST", body: { title: "Rever proposta ABC e enviar ao cliente", description: "Validar valores e condições da proposta antes do envio.", priority: "HIGH", projectId: proj.id, assignedMembershipId: mid(carla), tags: ["comercial"], dueAt: new Date(Date.now() + 3 * 864e5).toISOString() } });
  await api(`/organizations/${org.id}/tasks`, { method: "POST", body: { title: "Preparar ambiente de demonstração", status: "IN_PROGRESS", priority: "NORMAL", projectId: proj.id, tags: ["implementação"], dueAt: new Date(Date.now() + 7 * 864e5).toISOString() } });
  await api(`/organizations/${org.id}/tasks`, { method: "POST", body: { title: "Sessão de formação — equipa ABC", priority: "NORMAL", projectId: proj.id, assignedMembershipId: mid(bruno), tags: ["formação"], dueAt: new Date(Date.now() + 14 * 864e5).toISOString() } });
}
console.log("tasks ready");

// 6) Workflow "Aprovação de Despesas" + instance
const resW = await api(`/organizations/${org.id}/workflows`); let wfs = resW.workflows ?? (Array.isArray(resW) ? resW : []);
let wf = wfs.find(w => w.name === "Aprovação de Despesas");
if (!wf) {
  wf = (await api(`/organizations/${org.id}/workflows`, {
    method: "POST",
    body: {
      name: "Aprovação de Despesas",
      description: "Despesas até 500 EUR aprovadas pelo gestor; acima disso sobem à direção.",
      steps: [
        { order: 0, type: "START", name: "Submissão da despesa", config: {} },
        { order: 1, type: "APPROVAL", name: "Aprovação do gestor", config: { approverMembershipIds: [mid(bruno)], instructions: "Aprovar despesas operacionais até 500 EUR." } },
        { order: 2, type: "SEND_NOTIFICATION", name: "Notificar resultado", config: {} },
        { order: 3, type: "END", name: "Fecho", config: {} }
      ]
    }
  }));
}
if (wf.status !== "PUBLISHED") {
  try { await api(`/organizations/${org.id}/workflows/${wf.id}/publish`, { method: "POST" }); } catch (e) { console.log("publish:", e.message); }
}
console.log("workflow ready");

// 7) Team + member
const resTm = await api(`/organizations/${org.id}/teams`); let teams = resTm.teams ?? (Array.isArray(resTm) ? resTm : []);
let team = teams.find(t => t.name === "Consultores");
if (!team) team = (await api(`/organizations/${org.id}/teams`, { method: "POST", body: { name: "Consultores", description: "Equipa de consultoria e implementação" } }));
try { await api(`/organizations/${org.id}/teams/${team.id}/members`, { method: "POST", body: { membershipId: mid(carla) } }); } catch {}
console.log("team ready");

// 8) News post (Bruno publishes)
await login("bruno@xpto.pt");
const resN = await api(`/organizations/${org.id}/news`); let news = resN.posts ?? resN.news ?? (Array.isArray(resN) ? resN : []);
if (!news.some(n => n.title === "Bem-vindos à NEXORA")) {
  await api(`/organizations/${org.id}/news`, { method: "POST", body: {
    title: "Bem-vindos à NEXORA",
    excerpt: "A XPTO passa a gerir documentos, processos e tarefas na nova plataforma.",
    body: "A partir de hoje, todos os documentos, processos e tarefas da XPTO passam a ser geridos na NEXORA.\n\nO que muda:\n- Documentos centralizados com controlo de versões\n- Aprovações digitais (sem papel)\n- Tarefas e projetos visíveis para toda a equipa\n\nQualquer dúvida, consultem a Central de Ajuda ou falem com a Ana.",
    category: "Comunicação interna",
    tags: ["onboarding", "nexora"],
    coverColor: "#6366f1",
    status: "PUBLISHED",
    featured: true
  } });
}
console.log("news ready");

// 9) Pending invitation for a 4th user (shows in admin/users)
await login(ana.email);
try {
  await api(`/organizations/${org.id}/invitations`, { method: "POST", body: { email: "duarte@xpto.pt", role: "Viewer" } });
  console.log("invitation sent");
} catch (e) { console.log("invitation:", e.message.slice(0, 120)); }

console.log("\nSEED DONE — ana@xpto.pt / bruno@xpto.pt / carla@xpto.pt  (pw: " + PASSWORD + ")");
