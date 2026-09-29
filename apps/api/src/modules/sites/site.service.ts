import type {
  CreateSiteInput,
  PageWidget,
  SiteContentItem,
  SiteDetailResponse,
  SiteDto,
  SiteMemberDto,
  SitePageDto,
  SiteRole,
  SitesResponse,
  UpdateSiteInput,
  UpsertSitePageInput
} from "@nexora/contracts";
import type { Site, SiteMember, SitePage } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { notify } from "../notifications/notification.service.js";

export interface ActorContext {
  organizationId: string;
  userId: string;
  membershipId: string;
  isSuperAdmin: boolean;
  capabilities: Set<string>;
}

export async function getActor(organizationId: string, userId: string, isSuperAdmin: boolean): Promise<ActorContext> {
  const membership = await prisma.organizationMember.findFirst({
    where: { tenantId: organizationId, userId, status: "ACTIVE", tenant: { status: "ACTIVE" } },
    include: { membershipRoles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } }
  });
  if (!membership) throw new AppError(403, "FORBIDDEN", "You cannot access this organization.");
  const capabilities = new Set<string>();
  for (const memberRole of membership.membershipRoles) {
    for (const rolePermission of memberRole.role.permissions) capabilities.add(rolePermission.permission.key);
  }
  return { organizationId, userId, membershipId: membership.id, isSuperAdmin, capabilities };
}

async function audit(actor: ActorContext, action: string, resourceId: string, context?: Record<string, unknown>) {
  await prisma.auditLog.create({
    data: {
      tenantId: actor.organizationId,
      actorId: actor.membershipId,
      action,
      resourceType: "Site",
      resourceId,
      contextJson: JSON.stringify(context ?? {})
    }
  });
}

// --- Site role resolution ---

const ROLE_RANK: Record<SiteRole, number> = { VIEWER: 1, CONTRIBUTOR: 2, EDITOR: 3, MANAGER: 4, ADMIN: 5 };

export async function getSiteRole(actor: ActorContext, site: Pick<Site, "id" | "visibility">): Promise<SiteRole | null> {
  if (actor.isSuperAdmin || actor.capabilities.has("sites.manage")) return "ADMIN";
  const membership = await prisma.siteMember.findUnique({
    where: { siteId_membershipId: { siteId: site.id, membershipId: actor.membershipId } }
  });
  if (membership) return membership.role as SiteRole;
  if (site.visibility === "ORG" && actor.capabilities.has("sites.view")) return "VIEWER";
  return null;
}

async function requireSiteRole(actor: ActorContext, siteId: string, minRole: SiteRole): Promise<Site> {
  const site = await prisma.site.findFirst({ where: { id: siteId, tenantId: actor.organizationId } });
  if (!site) throw new AppError(404, "SITE_NOT_FOUND", "The site was not found.");
  const role = await getSiteRole(actor, site);
  if (!role || ROLE_RANK[role] < ROLE_RANK[minRole]) {
    throw new AppError(403, "FORBIDDEN", "You do not have access to this site.");
  }
  return site;
}

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "site";
}

// --- DTO mappers ---

type SiteWithCounts = Site & { _count?: { members: number; children: number } };

function toSiteDto(site: SiteWithCounts, myRole: SiteRole | null): SiteDto {
  return {
    id: site.id,
    parentId: site.parentId,
    name: site.name,
    slug: site.slug,
    description: site.description,
    type: site.type as SiteDto["type"],
    icon: site.icon,
    color: site.color,
    visibility: site.visibility as SiteDto["visibility"],
    myRole,
    memberCount: site._count?.members ?? 0,
    childrenCount: site._count?.children ?? 0,
    createdAt: site.createdAt.toISOString()
  };
}

function toMemberDto(member: SiteMember & { membership: { id: string; user: { id: string; name: string; email: string; avatar: string | null } } }): SiteMemberDto {
  return {
    membershipId: member.membershipId,
    role: member.role as SiteRole,
    user: { id: member.membership.user.id, name: member.membership.user.name, email: member.membership.user.email, avatar: member.membership.user.avatar }
  };
}

export function parseWidgets(json: string): PageWidget[] {
  try {
    const parsed = JSON.parse(json) as PageWidget[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function toPageDto(page: SitePage): SitePageDto {
  return {
    id: page.id,
    siteId: page.siteId,
    title: page.title,
    slug: page.slug,
    widgets: parseWidgets(page.widgetsJson),
    status: page.status as SitePageDto["status"],
    isHome: page.isHome,
    createdAt: page.createdAt.toISOString(),
    updatedAt: page.updatedAt.toISOString()
  };
}

// --- Sites ---

export async function listSites(actor: ActorContext): Promise<SitesResponse> {
  const sites = await prisma.site.findMany({
    where: { tenantId: actor.organizationId },
    include: { _count: { select: { members: true, children: true } } },
    orderBy: { name: "asc" }
  });
  const myMemberships = await prisma.siteMember.findMany({
    where: { membershipId: actor.membershipId },
    select: { siteId: true, role: true }
  });
  const memberMap = new Map(myMemberships.map((m) => [m.siteId, m.role as SiteRole]));
  const elevated = actor.isSuperAdmin || actor.capabilities.has("sites.manage");
  const canView = actor.capabilities.has("sites.view");

  const visible = sites.filter((site) => {
    if (elevated) return true;
    const role = memberMap.get(site.id);
    if (role) return true;
    return site.visibility === "ORG" && canView;
  });

  return {
    sites: visible.map((site) => {
      const role: SiteRole | null = elevated ? "ADMIN" : memberMap.get(site.id) ?? (site.visibility === "ORG" ? "VIEWER" : null);
      return toSiteDto(site, role);
    })
  };
}

export async function createSite(actor: ActorContext, input: CreateSiteInput): Promise<SiteDto> {
  let slug = slugify(input.name);
  const taken = await prisma.site.findFirst({ where: { tenantId: actor.organizationId, slug }, select: { id: true } });
  if (taken) slug = `${slug}-${randomBytes(3).toString("hex")}`;

  if (input.parentId) {
    const parent = await prisma.site.findFirst({ where: { id: input.parentId, tenantId: actor.organizationId } });
    if (!parent) throw new AppError(404, "SITE_NOT_FOUND", "The parent site was not found.");
  }

  const site = await prisma.$transaction(async (tx) => {
    const created = await tx.site.create({
      data: {
        tenantId: actor.organizationId,
        parentId: input.parentId ?? null,
        name: input.name,
        slug,
        description: input.description ?? null,
        type: input.type ?? "TEAM",
        icon: input.icon ?? "folder",
        color: input.color ?? "#6366f1",
        visibility: input.visibility ?? "ORG",
        createdById: actor.userId,
        members: { create: { tenantId: actor.organizationId, membershipId: actor.membershipId, role: "ADMIN" } }
      }
    });
    // Default document folder + home page, SharePoint-style
    await tx.folder.create({
      data: { tenantId: actor.organizationId, siteId: created.id, name: "Documentos", createdById: actor.userId }
    });
    await tx.sitePage.create({
      data: {
        tenantId: actor.organizationId,
        siteId: created.id,
        title: "Início",
        slug: "inicio",
        isHome: true,
        status: "PUBLISHED",
        createdById: actor.userId,
        widgetsJson: JSON.stringify([
          { id: "w1", type: "hero", props: { title: created.name, subtitle: created.description ?? "Espaço de trabalho" } },
          { id: "w2", type: "recent-docs", props: {} },
          { id: "w3", type: "news", props: {} }
        ])
      }
    });
    return created;
  });

  await audit(actor, "site.created", site.id, { name: site.name, type: site.type });
  return toSiteDto({ ...site, _count: { members: 1, children: 0 } }, "ADMIN");
}

export async function getSite(actor: ActorContext, siteId: string): Promise<SiteDetailResponse> {
  const site = await prisma.site.findFirst({
    where: { id: siteId, tenantId: actor.organizationId },
    include: { _count: { select: { members: true, children: true } } }
  });
  if (!site) throw new AppError(404, "SITE_NOT_FOUND", "The site was not found.");
  const role = await getSiteRole(actor, site);
  if (!role) throw new AppError(403, "FORBIDDEN", "You do not have access to this site.");

  const [children, members, pages, folders, lists, forms, workflows, tasks, newsCount] = await Promise.all([
    prisma.site.findMany({
      where: { tenantId: actor.organizationId, parentId: site.id },
      include: { _count: { select: { members: true, children: true } } },
      orderBy: { name: "asc" }
    }),
    prisma.siteMember.findMany({
      where: { siteId: site.id },
      include: { membership: { include: { user: { select: { id: true, name: true, email: true, avatar: true } } } } },
      orderBy: { createdAt: "asc" }
    }),
    prisma.sitePage.findMany({ where: { siteId: site.id }, orderBy: { updatedAt: "desc" } }),
    prisma.folder.findMany({ where: { tenantId: actor.organizationId, siteId: site.id, status: "ACTIVE" }, take: 20 }),
    prisma.listDefinition.findMany({ where: { tenantId: actor.organizationId, siteId: site.id }, take: 20 }),
    prisma.formDefinition.findMany({ where: { tenantId: actor.organizationId, siteId: site.id }, take: 20 }),
    prisma.workflowDefinition.findMany({ where: { tenantId: actor.organizationId, siteId: site.id }, take: 20 }),
    prisma.task.findMany({ where: { tenantId: actor.organizationId, siteId: site.id }, take: 20 }),
    prisma.newsPost.count({ where: { tenantId: actor.organizationId, siteId: site.id } })
  ]);

  const content: SiteContentItem[] = [
    ...folders.map((f) => ({ id: f.id, name: f.name, kind: "folder" as const, status: null, href: `/documents?folder=${f.id}` })),
    ...lists.map((l) => ({ id: l.id, name: l.name, kind: "list" as const, status: null, href: `/lists/${l.id}` })),
    ...forms.map((f) => ({ id: f.id, name: f.name, kind: "form" as const, status: f.status, href: `/forms/${f.id}` })),
    ...workflows.map((w) => ({ id: w.id, name: w.name, kind: "workflow" as const, status: w.status, href: `/workflows/${w.id}` })),
    ...tasks.map((t) => ({ id: t.id, name: t.title, kind: "task" as const, status: t.status, href: `/tasks/${t.id}` }))
  ];

  const myMemberships = await prisma.siteMember.findMany({ where: { membershipId: actor.membershipId }, select: { siteId: true, role: true } });
  const memberMap = new Map(myMemberships.map((m) => [m.siteId, m.role as SiteRole]));
  const elevated = actor.isSuperAdmin || actor.capabilities.has("sites.manage");

  const homePage = pages.find((p) => p.isHome) ?? null;
  const documents = await prisma.document.count({
    where: { tenantId: actor.organizationId, status: "ACTIVE", folder: { siteId: site.id } }
  });

  return {
    site: toSiteDto(site, role),
    children: children.map((child) => {
      const childRole: SiteRole | null = elevated ? "ADMIN" : memberMap.get(child.id) ?? (child.visibility === "ORG" ? "VIEWER" : null);
      return toSiteDto(child, childRole);
    }),
    members: members.map(toMemberDto),
    pages: pages.map(toPageDto),
    homePage: homePage ? toPageDto(homePage) : null,
    content,
    stats: {
      documents,
      lists: lists.length,
      tasks: tasks.length,
      workflows: workflows.length,
      members: members.length,
      pages: pages.length,
      news: newsCount
    }
  };
}

export async function updateSite(actor: ActorContext, siteId: string, input: UpdateSiteInput): Promise<SiteDto> {
  const site = await requireSiteRole(actor, siteId, "MANAGER");
  const updated = await prisma.site.update({
    where: { id: site.id },
    data: {
      name: input.name,
      description: input.description === null ? null : input.description,
      icon: input.icon,
      color: input.color,
      visibility: input.visibility
    },
    include: { _count: { select: { members: true, children: true } } }
  });
  await audit(actor, "site.updated", site.id, { name: updated.name });
  const role = await getSiteRole(actor, updated);
  return toSiteDto(updated, role);
}

export async function deleteSite(actor: ActorContext, siteId: string) {
  const site = await requireSiteRole(actor, siteId, "ADMIN");
  await prisma.site.delete({ where: { id: site.id } });
  await audit(actor, "site.deleted", site.id, { name: site.name });
}

// --- Members ---

export async function addSiteMember(actor: ActorContext, siteId: string, input: { membershipId: string; role: SiteRole }) {
  const site = await requireSiteRole(actor, siteId, "MANAGER");
  const membership = await prisma.organizationMember.findFirst({
    where: { id: input.membershipId, tenantId: actor.organizationId, status: "ACTIVE" }
  });
  if (!membership) throw new AppError(404, "MEMBER_NOT_FOUND", "The user is not an active member of this organization.");
  const existing = await prisma.siteMember.findUnique({ where: { siteId_membershipId: { siteId: site.id, membershipId: membership.id } } });
  if (existing) throw new AppError(409, "RESOURCE_ALREADY_EXISTS", "The user is already a member of this site.");
  const member = await prisma.siteMember.create({
    data: { tenantId: actor.organizationId, siteId: site.id, membershipId: membership.id, role: input.role },
    include: { membership: { include: { user: { select: { id: true, name: true, email: true, avatar: true } } } } }
  });
  await notify({
    tenantId: actor.organizationId,
    recipientId: membership.id,
    type: "site.member_added",
    title: `Foi adicionado ao site "${site.name}"`,
    body: `Tem agora a função ${input.role} no site ${site.name}.`,
    data: { siteId: site.id }
  });
  await audit(actor, "site.member_added", site.id, { member: membership.id, role: input.role });
  return toMemberDto(member);
}

export async function updateSiteMember(actor: ActorContext, siteId: string, membershipId: string, role: SiteRole) {
  const site = await requireSiteRole(actor, siteId, "MANAGER");
  const existing = await prisma.siteMember.findUnique({ where: { siteId_membershipId: { siteId: site.id, membershipId } } });
  if (!existing) throw new AppError(404, "MEMBER_NOT_FOUND", "The site member was not found.");
  const member = await prisma.siteMember.update({
    where: { id: existing.id },
    data: { role },
    include: { membership: { include: { user: { select: { id: true, name: true, email: true, avatar: true } } } } }
  });
  return toMemberDto(member);
}

export async function removeSiteMember(actor: ActorContext, siteId: string, membershipId: string) {
  const site = await requireSiteRole(actor, siteId, "MANAGER");
  const existing = await prisma.siteMember.findUnique({ where: { siteId_membershipId: { siteId: site.id, membershipId } } });
  if (!existing) throw new AppError(404, "MEMBER_NOT_FOUND", "The site member was not found.");
  await prisma.siteMember.delete({ where: { id: existing.id } });
  await audit(actor, "site.member_removed", site.id, { member: membershipId });
}

// --- Pages ---

export async function listPages(actor: ActorContext, siteId: string): Promise<{ pages: SitePageDto[] }> {
  const site = await requireSiteRole(actor, siteId, "VIEWER");
  const pages = await prisma.sitePage.findMany({ where: { siteId: site.id }, orderBy: { updatedAt: "desc" } });
  return { pages: pages.map(toPageDto) };
}

export async function createPage(actor: ActorContext, siteId: string, input: UpsertSitePageInput): Promise<SitePageDto> {
  const site = await requireSiteRole(actor, siteId, "EDITOR");
  const slug = input.slug ? slugify(input.slug) : slugify(input.title);
  const existing = await prisma.sitePage.findFirst({ where: { siteId: site.id, slug } });
  const finalSlug = existing ? `${slug}-${randomBytes(3).toString("hex")}` : slug;
  const page = await prisma.sitePage.create({
    data: {
      tenantId: actor.organizationId,
      siteId: site.id,
      title: input.title,
      slug: finalSlug,
      widgetsJson: JSON.stringify(input.widgets ?? []),
      status: input.status ?? "DRAFT",
      createdById: actor.userId
    }
  });
  await audit(actor, "page.created", page.id, { title: page.title, siteId: site.id });
  return toPageDto(page);
}

export async function getPage(actor: ActorContext, pageId: string): Promise<SitePageDto> {
  const page = await prisma.sitePage.findFirst({ where: { id: pageId, tenantId: actor.organizationId } });
  if (!page) throw new AppError(404, "PAGE_NOT_FOUND", "The page was not found.");
  await requireSiteRole(actor, page.siteId, "VIEWER");
  return toPageDto(page);
}

export async function updatePage(actor: ActorContext, pageId: string, input: Partial<UpsertSitePageInput>): Promise<SitePageDto> {
  const page = await prisma.sitePage.findFirst({ where: { id: pageId, tenantId: actor.organizationId } });
  if (!page) throw new AppError(404, "PAGE_NOT_FOUND", "The page was not found.");
  await requireSiteRole(actor, page.siteId, "EDITOR");
  if (input.isHome) {
    await prisma.sitePage.updateMany({ where: { siteId: page.siteId, isHome: true }, data: { isHome: false } });
  }
  const updated = await prisma.sitePage.update({
    where: { id: page.id },
    data: {
      title: input.title,
      widgetsJson: input.widgets ? JSON.stringify(input.widgets) : undefined,
      status: input.status,
      isHome: input.isHome
    }
  });
  await audit(actor, "page.updated", page.id, { title: updated.title });
  return toPageDto(updated);
}

export async function deletePage(actor: ActorContext, pageId: string) {
  const page = await prisma.sitePage.findFirst({ where: { id: pageId, tenantId: actor.organizationId } });
  if (!page) throw new AppError(404, "PAGE_NOT_FOUND", "The page was not found.");
  await requireSiteRole(actor, page.siteId, "MANAGER");
  await prisma.sitePage.delete({ where: { id: page.id } });
  await audit(actor, "page.deleted", page.id, { title: page.title });
}
