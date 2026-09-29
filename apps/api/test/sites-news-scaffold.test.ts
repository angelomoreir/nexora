import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { LocalAIProvider } from "../src/modules/ai/local-provider.js";
import { setAIProvider } from "../src/modules/ai/ai.service.js";

const app = buildApp();
const marker = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const adminEmail = `sites-admin-${marker}@example.com`;
const memberEmail = `sites-member-${marker}@example.com`;
const otherEmail = `sites-other-${marker}@example.com`;
const newsAdminEmail = `news-admin-${marker}@example.com`;
const scaffoldEmail = `scaffold-admin-${marker}@example.com`;
const organizationIds: string[] = [];

function cookies(response: { headers: Record<string, string | string[] | number | undefined> }) {
  const values = response.headers["set-cookie"];
  return (Array.isArray(values) ? values : typeof values === "string" ? [values] : []).map((value) => value.split(";", 1)[0]).join("; ");
}

before(async () => {
  setAIProvider(new LocalAIProvider());
  await app.ready();
});
after(async () => {
  await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  await prisma.user.deleteMany({ where: { email: { in: [adminEmail, memberEmail, otherEmail, newsAdminEmail, scaffoldEmail] } } });
  await app.close();
  await prisma.$disconnect();
});

test("sites support CRUD, hierarchy, members, pages and tenant isolation", async () => {
  const registration = await app.inject({ method: "POST", url: "/api/v1/auth/register", payload: { name: "Site Admin", email: adminEmail, password: "SitesPassword123", organizationName: "Sites Organization" } });
  assert.equal(registration.statusCode, 201);
  const organizationId = registration.json().organizations[0].id as string;
  organizationIds.push(organizationId);
  const adminCookies = cookies(registration);

  const addMember = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/users`, headers: { cookie: adminCookies }, payload: { name: "Site Member", email: memberEmail, password: "SitesPassword123", role: "Editor" } });
  assert.equal(addMember.statusCode, 201, addMember.body);
  const membershipId = addMember.json().memberId;
  assert.ok(membershipId, "member response should expose a membership id");

  const memberLogin = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: memberEmail, password: "SitesPassword123" } });
  assert.equal(memberLogin.statusCode, 200);
  const memberCookies = cookies(memberLogin);

  // --- Create a site and a child site ---
  const createSite = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/sites`, headers: { cookie: adminCookies }, payload: { name: "Recursos Humanos", type: "DEPARTMENT", description: "Site do departamento de RH" } });
  assert.equal(createSite.statusCode, 201, createSite.body);
  const site = createSite.json().site ?? createSite.json();
  assert.equal(site.name, "Recursos Humanos");

  const createChild = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/sites`, headers: { cookie: adminCookies }, payload: { name: "Recrutamento", type: "TEAM", parentId: site.id } });
  assert.equal(createChild.statusCode, 201, createChild.body);
  const child = createChild.json().site ?? createChild.json();
  assert.equal(child.parentId, site.id);

  // --- List sites ---
  const listSites = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/sites`, headers: { cookie: adminCookies } });
  assert.equal(listSites.statusCode, 200);
  const sites = listSites.json().sites ?? listSites.json();
  assert.ok(Array.isArray(sites) && sites.length >= 2);

  // --- Update the site ---
  const patchSite = await app.inject({ method: "PATCH", url: `/api/v1/organizations/${organizationId}/sites/${site.id}`, headers: { cookie: adminCookies }, payload: { description: "Portal de Recursos Humanos" } });
  assert.equal(patchSite.statusCode, 200, patchSite.body);
  const patchedSite = patchSite.json().site ?? patchSite.json();
  assert.equal(patchedSite.description, "Portal de Recursos Humanos");

  // --- Add a site member and change the role ---
  const addSiteMember = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/sites/${site.id}/members`, headers: { cookie: adminCookies }, payload: { membershipId, role: "CONTRIBUTOR" } });
  assert.equal(addSiteMember.statusCode, 201, addSiteMember.body);

  const patchMember = await app.inject({ method: "PATCH", url: `/api/v1/organizations/${organizationId}/sites/${site.id}/members/${membershipId}`, headers: { cookie: adminCookies }, payload: { role: "EDITOR" } });
  assert.equal(patchMember.statusCode, 200, patchMember.body);
  const patchedMember = patchMember.json().member ?? patchMember.json();
  assert.equal(patchedMember.role, "EDITOR");

  const getSite = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/sites/${site.id}`, headers: { cookie: adminCookies } });
  assert.equal(getSite.statusCode, 200);
  const detail = getSite.json();
  assert.ok(detail.site ?? detail.id);
  const members = detail.members ?? detail.site?.members ?? [];
  assert.ok(members.some((member: { role: string }) => member.role === "EDITOR"));

  // --- Pages ---
  const createPage = await app.inject({
    method: "POST",
    url: `/api/v1/organizations/${organizationId}/sites/${site.id}/pages`,
    headers: { cookie: adminCookies },
    payload: { title: "Início", widgets: [{ id: "w1", type: "hero", props: { title: "Bem-vindo" } }], status: "PUBLISHED", isHome: true }
  });
  assert.equal(createPage.statusCode, 201, createPage.body);
  const page = createPage.json().page ?? createPage.json();
  assert.equal(page.siteId, site.id);
  assert.equal(page.status, "PUBLISHED");

  const listPages = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/sites/${site.id}/pages`, headers: { cookie: adminCookies } });
  assert.equal(listPages.statusCode, 200);
  const pages = listPages.json().pages ?? listPages.json();
  assert.ok(pages.some((candidate: { id: string }) => candidate.id === page.id));

  const getPage = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/pages/${page.id}`, headers: { cookie: memberCookies } });
  assert.equal(getPage.statusCode, 200, getPage.body);
  const fetchedPage = getPage.json().page ?? getPage.json();
  assert.equal(fetchedPage.title, "Início");

  const patchPage = await app.inject({ method: "PATCH", url: `/api/v1/organizations/${organizationId}/pages/${page.id}`, headers: { cookie: adminCookies }, payload: { title: "Página Inicial" } });
  assert.equal(patchPage.statusCode, 200);
  assert.equal((patchPage.json().page ?? patchPage.json()).title, "Página Inicial");

  // --- Tenant isolation: a user from another org cannot see the site ---
  const otherRegistration = await app.inject({ method: "POST", url: "/api/v1/auth/register", payload: { name: "Other Admin", email: otherEmail, password: "SitesPassword123", organizationName: "Other Organization" } });
  assert.equal(otherRegistration.statusCode, 201);
  organizationIds.push(otherRegistration.json().organizations[0].id);
  const otherCookies = cookies(otherRegistration);

  const foreignGet = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/sites/${site.id}`, headers: { cookie: otherCookies } });
  assert.ok([403, 404].includes(foreignGet.statusCode), `expected 403/404, got ${foreignGet.statusCode}`);

  const foreignList = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/sites`, headers: { cookie: otherCookies } });
  assert.ok([403, 404].includes(foreignList.statusCode), `expected 403/404, got ${foreignList.statusCode}`);

  // --- Delete page and site ---
  const deletePage = await app.inject({ method: "DELETE", url: `/api/v1/organizations/${organizationId}/pages/${page.id}`, headers: { cookie: adminCookies } });
  assert.equal(deletePage.statusCode, 204);
  const deleteSite = await app.inject({ method: "DELETE", url: `/api/v1/organizations/${organizationId}/sites/${child.id}`, headers: { cookie: adminCookies } });
  assert.equal(deleteSite.statusCode, 204);
});

test("news supports CRUD, comments, site scoping and publishing", async () => {
  const registration = await app.inject({ method: "POST", url: "/api/v1/auth/register", payload: { name: "News Admin", email: newsAdminEmail, password: "NewsPassword123", organizationName: "News Organization" } });
  assert.equal(registration.statusCode, 201);
  const organizationId = registration.json().organizations[0].id as string;
  organizationIds.push(organizationId);
  const adminCookies = cookies(registration);

  const createSite = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/sites`, headers: { cookie: adminCookies }, payload: { name: "Comunicação" } });
  assert.equal(createSite.statusCode, 201);
  const site = createSite.json().site ?? createSite.json();

  const createNews = await app.inject({
    method: "POST",
    url: `/api/v1/organizations/${organizationId}/news`,
    headers: { cookie: adminCookies },
    payload: { title: "Novo escritório aberto", body: "Abrimos um novo escritório em Lisboa.", siteId: site.id, category: "Empresa", tags: ["expansão"], status: "PUBLISHED", featured: true }
  });
  assert.equal(createNews.statusCode, 201, createNews.body);
  const post = createNews.json().post ?? createNews.json();
  assert.equal(post.status, "PUBLISHED");
  assert.equal(post.siteId, site.id);

  const listNews = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/news`, headers: { cookie: adminCookies } });
  assert.equal(listNews.statusCode, 200);
  const news = listNews.json().posts ?? listNews.json().news ?? listNews.json();
  assert.ok(news.some((candidate: { id: string }) => candidate.id === post.id));

  const filteredNews = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/news?siteId=${site.id}`, headers: { cookie: adminCookies } });
  assert.equal(filteredNews.statusCode, 200);

  const getNews = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/news/${post.id}`, headers: { cookie: adminCookies } });
  assert.equal(getNews.statusCode, 200);
  assert.equal((getNews.json().post ?? getNews.json()).title, "Novo escritório aberto");

  const addComment = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/news/${post.id}/comments`, headers: { cookie: adminCookies }, payload: { body: "Excelente notícia!" } });
  assert.equal(addComment.statusCode, 201, addComment.body);

  const patchNews = await app.inject({ method: "PATCH", url: `/api/v1/organizations/${organizationId}/news/${post.id}`, headers: { cookie: adminCookies }, payload: { featured: false } });
  assert.equal(patchNews.statusCode, 200);
  assert.equal((patchNews.json().post ?? patchNews.json()).featured, false);

  const deleteNews = await app.inject({ method: "DELETE", url: `/api/v1/organizations/${organizationId}/news/${post.id}`, headers: { cookie: adminCookies } });
  assert.equal(deleteNews.statusCode, 204);
});

test("AI scaffold proposes and materializes list, form, workflow and page", async () => {
  const registration = await app.inject({ method: "POST", url: "/api/v1/auth/register", payload: { name: "Scaffold Admin", email: scaffoldEmail, password: "ScaffoldPassword123", organizationName: "Scaffold Organization" } });
  assert.equal(registration.statusCode, 201);
  const organizationId = registration.json().organizations[0].id as string;
  organizationIds.push(organizationId);
  const adminCookies = cookies(registration);

  const createSite = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/sites`, headers: { cookie: adminCookies }, payload: { name: "Operações" } });
  assert.equal(createSite.statusCode, 201);
  const site = createSite.json().site ?? createSite.json();

  const propose = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/ai/propose-app`, headers: { cookie: adminCookies }, payload: { description: "Quero criar um sistema para gerir pedidos de férias dos funcionários" } });
  assert.equal(propose.statusCode, 200, propose.body);
  const proposal = propose.json();
  const spec = proposal.spec ?? proposal.proposal?.spec ?? proposal;
  assert.ok(spec.list?.name, "proposal should include a list spec");
  assert.ok(spec.workflow?.name, "proposal should include a workflow spec");

  const apply = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/ai/scaffold/apply`, headers: { cookie: adminCookies }, payload: { siteId: site.id, spec } });
  assert.equal(apply.statusCode, 201, apply.body);
  const created = apply.json();
  assert.ok(created.list?.id ?? created.listId, "apply should return the created list");
  assert.ok(created.form?.id ?? created.formId, "apply should return the created form");
  assert.ok(created.workflow?.id ?? created.workflowId, "apply should return the created workflow");

  // Verify the created list actually exists and is queryable.
  const listId = created.list?.id ?? created.listId;
  const getList = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/lists/${listId}`, headers: { cookie: adminCookies } });
  assert.equal(getList.statusCode, 200, getList.body);
});

test("public endpoints expose plans and accept contact requests", async () => {
  const plans = await app.inject({ method: "GET", url: "/api/v1/plans" });
  assert.equal(plans.statusCode, 200);
  const planList = plans.json().plans ?? plans.json();
  assert.ok(Array.isArray(planList) && planList.length >= 3);

  const contact = await app.inject({ method: "POST", url: "/api/v1/public/contact", payload: { name: "Joana Silva", email: "joana@example.com", company: "Empresa Lda", message: "Quero uma demonstração da plataforma." } });
  assert.equal(contact.statusCode, 201, contact.body);

  const invalid = await app.inject({ method: "POST", url: "/api/v1/public/contact", payload: { name: "X", email: "not-an-email", message: "hi" } });
  assert.equal(invalid.statusCode, 400);
});
