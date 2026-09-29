import type { SearchFacetDto, SearchFilters, SearchGroupDto, SearchResponse } from "@nexora/contracts";
import { prisma } from "../../lib/prisma.js";

// --- Search Provider Abstraction ---
// This interface allows swapping the Prisma-based search for OpenSearch/Elasticsearch
// or an AI semantic search backend in the future without changing the route layer.

export interface SearchProvider {
  search(actor: SearchActor, query: string, filters: SearchFilters): Promise<SearchResponse>;
}

export interface SearchActor {
  organizationId: string;
  userId: string;
  membershipId: string;
  isSuperAdmin: boolean;
  capabilities: Set<string>;
}

// --- Prisma Search Provider ---
// Current implementation using SQL LIKE queries (SQLite is case-insensitive for ASCII).
// Respects organization isolation and per-entity permissions.

const GROUP_LABELS = {
  document: "Documentos",
  folder: "Pastas",
  list: "Listas",
  list_item: "Registos",
  task: "Tarefas",
  workflow: "Processos",
  user: "Utilizadores",
  site: "Sites",
  news: "Notícias"
} as const;

const MAX_PER_GROUP = 10;

type DocumentHit = {
  id: string;
  name: string;
  extension: string;
  mimeType: string;
  sensitivity: string | null;
  publishStatus: string;
  metadataJson: string;
  createdById: string;
  tenantId: string;
  folderId: string | null;
  updatedAt: Date;
  createdAt: Date;
  owner: { id: string; name: string } | null;
  folder: { id: string; name: string } | null;
  content: { text: string } | null;
};

function parseMetadataField(json: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

// Relevance: full-name match wins, then metadata, then extracted content.
// Each matched term adds weight; recency breaks ties.
function scoreDocument(doc: DocumentHit, terms: string[]): number {
  let score = 0;
  const name = doc.name.toLowerCase();
  const metadata = doc.metadataJson.toLowerCase();
  const content = doc.content?.text.toLowerCase() ?? "";
  for (const term of terms) {
    const t = term.toLowerCase();
    if (name.includes(t)) score += 10;
    if (metadata.includes(t)) score += 6;
    if (content.includes(t)) score += 3;
  }
  if (name === terms.join(" ").toLowerCase()) score += 20;
  const ageDays = (Date.now() - doc.updatedAt.getTime()) / 86_400_000;
  score += Math.max(0, 2 - ageDays / 30);
  return score;
}

// Refiners over the permission-filtered hit set (SharePoint-style facets).
function buildFacets(hits: DocumentHit[]): SearchFacetDto[] {
  const facet = (field: string, values: (hit: DocumentHit) => string | null): SearchFacetDto => {
    const counts = new Map<string, number>();
    for (const hit of hits) {
      const value = values(hit);
      if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    return { field, values: [...counts.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count) };
  };
  return [
    facet("extension", (hit) => hit.extension || null),
    facet("sensitivity", (hit) => hit.sensitivity),
    facet("publishStatus", (hit) => hit.publishStatus)
  ].filter((entry) => entry.values.length > 0);
}

export class PrismaSearchProvider implements SearchProvider {
  async search(actor: SearchActor, query: string, filters: SearchFilters): Promise<SearchResponse> {
    const q = query.trim();
    if (q.length < 2) return { query, groups: [], total: 0 };

    const types = filters.types ?? ["document", "folder", "list", "list_item", "task", "workflow", "user", "site", "news"];
    const dateFilter = this.buildDateFilter(filters);

    const tasks: Promise<SearchGroupDto>[] = [];
    let documentHits: DocumentHit[] | null = null;

    const documentTask = types.includes("document") ? this.searchDocuments(actor, q, filters, dateFilter) : null;
    if (types.includes("folder")) tasks.push(this.searchFolders(actor, q, filters, dateFilter));
    if (types.includes("list")) tasks.push(this.searchLists(actor, q, filters, dateFilter));
    if (types.includes("list_item")) tasks.push(this.searchListItems(actor, q, filters, dateFilter));
    if (types.includes("task")) tasks.push(this.searchTasks(actor, q, filters, dateFilter));
    if (types.includes("workflow")) tasks.push(this.searchWorkflows(actor, q, filters, dateFilter));
    if (types.includes("user")) tasks.push(this.searchUsers(actor, q, filters, dateFilter));
    if (types.includes("site")) tasks.push(this.searchSites(actor, q));
    if (types.includes("news")) tasks.push(this.searchNews(actor, q, filters, dateFilter));

    const documentResult = documentTask ? await documentTask : null;
    if (documentResult) {
      documentHits = documentResult.hits;
      tasks.unshift(Promise.resolve(documentResult.group));
    }

    const groups = (await Promise.all(tasks)).filter((g) => g.results.length > 0);
    const total = groups.reduce((sum, g) => sum + g.total, 0);
    const facets = documentHits ? buildFacets(documentHits) : undefined;
    return { query, groups, total, ...(facets ? { facets } : {}) };
  }

  private buildDateFilter(filters: SearchFilters): { gte?: Date; lte?: Date } {
    const result: { gte?: Date; lte?: Date } = {};
    if (filters.createdAfter) result.gte = new Date(filters.createdAfter);
    if (filters.createdBefore) result.lte = new Date(filters.createdBefore);
    return result;
  }

  private buildCreatedByFilter(filters: SearchFilters): { createdById?: string } {
    return filters.createdBy ? { createdById: filters.createdBy } : {};
  }

  private async searchDocuments(actor: SearchActor, q: string, filters: SearchFilters, date: { gte?: Date; lte?: Date }): Promise<{ group: SearchGroupDto; hits: DocumentHit[] }> {
    const empty = { group: { type: "document" as const, label: GROUP_LABELS.document, results: [], total: 0 }, hits: [] };
    if (!actor.isSuperAdmin && !actor.capabilities.has("documents.view")) return empty;

    const teamIds = actor.isSuperAdmin ? [] : await prisma.teamMember.findMany({ where: { membershipId: actor.membershipId }, select: { teamId: true } });

    // Multi-term search: every term is matched against name, metadata and the
    // extracted content; documents are scored by term coverage and match source.
    const terms = q.split(/\s+/).filter((term) => term.length >= 2);
    const termConditions = terms.map((term) => ({
      OR: [
        { name: { contains: term, mode: "insensitive" as const } },
        { metadataJson: { contains: term, mode: "insensitive" as const } },
        { content: { is: { text: { contains: term, mode: "insensitive" as const } } } }
      ]
    }));

    const documents = await prisma.document.findMany({
      where: {
        tenantId: actor.organizationId,
        status: "ACTIVE",
        AND: termConditions,
        ...(filters.mimeType ? { mimeType: { contains: filters.mimeType, mode: "insensitive" as const } } : {}),
        ...(filters.sensitivity ? { sensitivity: filters.sensitivity } : {}),
        ...(filters.publishStatus ? { publishStatus: filters.publishStatus } : {}),
        createdAt: { gte: date.gte, lte: date.lte },
        ...this.buildCreatedByFilter(filters)
      },
      include: { owner: { select: { id: true, name: true } }, folder: { select: { id: true, name: true } } },
      orderBy: { updatedAt: "desc" },
      take: 100
    });

    let accessible = await this.filterAccessibleDocuments(actor, documents, teamIds);

    // Metadata refiner (meta=slug:value) applied post-permission check.
    if (filters.meta?.includes(":")) {
      const parts = filters.meta.split(":");
      const [slug, expected] = [(parts[0] ?? "").trim(), parts.slice(1).join(":").trim()];
      accessible = accessible.filter((doc) => String(parseMetadataField(doc.metadataJson)[slug] ?? "") === expected);
    }

    // Extracted content is only loaded for documents the actor can actually
    // see — one batched query instead of embedding the full text per row.
    const contentRows = accessible.length
      ? await prisma.documentContent.findMany({
          where: { documentId: { in: accessible.map((doc) => doc.id) } },
          select: { documentId: true, text: true }
        })
      : [];
    const contentByDocument = new Map(contentRows.map((row) => [row.documentId, row.text]));
    const hits: DocumentHit[] = accessible.map((doc) => ({ ...doc, content: contentByDocument.has(doc.id) ? { text: contentByDocument.get(doc.id)! } : null }));

    const scored = hits
      .map((doc) => ({ doc, score: scoreDocument(doc, terms) }))
      .sort((a, b) => b.score - a.score);

    return {
      group: {
        type: "document",
        label: GROUP_LABELS.document,
        results: scored.slice(0, MAX_PER_GROUP).map(({ doc: d }) => ({
          id: d.id,
          type: "document" as const,
          title: d.name,
          subtitle: d.folder?.name ?? null,
          href: `/documents?selected=${d.id}`,
          createdAt: d.createdAt.toISOString(),
          createdBy: d.owner ? { id: d.owner.id, name: d.owner.name } : null,
          status: d.extension || null,
          snippet: this.buildSnippet(d.content?.text ?? null, q)
        })),
        total: scored.length
      },
      hits
    };
  }

  private buildSnippet(text: string | null, q: string): string | null {
    if (!text) return null;
    const index = text.toLowerCase().indexOf(q.toLowerCase());
    if (index < 0) return null;
    const start = Math.max(0, index - 60);
    const end = Math.min(text.length, index + q.length + 100);
    return `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
  }

  // Batch ACL: three queries for the entire candidate set instead of five
  // queries per document (previously up to ~500 round-trips per search).
  private async filterAccessibleDocuments<T extends { id: string; createdById: string }>(actor: SearchActor, documents: T[], teamIds: { teamId: string }[]): Promise<T[]> {
    if (actor.isSuperAdmin || documents.length === 0) return documents;
    const ids = documents.map((doc) => doc.id);
    const [directGrants, teamGrants, orgGrants] = await Promise.all([
      prisma.documentPermission.findMany({ where: { documentId: { in: ids } }, select: { documentId: true, membershipId: true, canView: true } }),
      prisma.documentTeamPermission.findMany({ where: { documentId: { in: ids } }, select: { documentId: true, teamId: true, canRead: true } }),
      prisma.documentOrganizationPermission.findMany({ where: { documentId: { in: ids } }, select: { documentId: true } })
    ]);
    const memberTeamIds = new Set(teamIds.map((t) => t.teamId));
    const restricted = new Set([...directGrants.map((g) => g.documentId), ...teamGrants.map((g) => g.documentId), ...orgGrants.map((g) => g.documentId)]);
    const viewerGranted = new Set(directGrants.filter((g) => g.membershipId === actor.membershipId && g.canView).map((g) => g.documentId));
    const teamGranted = new Set(teamGrants.filter((g) => g.canRead && memberTeamIds.has(g.teamId)).map((g) => g.documentId));
    // Documents without any sharing rules are open access to all org members.
    return documents.filter((doc) => doc.createdById === actor.userId || !restricted.has(doc.id) || viewerGranted.has(doc.id) || teamGranted.has(doc.id));
  }

  private async searchFolders(actor: SearchActor, q: string, filters: SearchFilters, date: { gte?: Date; lte?: Date }): Promise<SearchGroupDto> {
    if (!actor.isSuperAdmin && !actor.capabilities.has("documents.view")) {
      return { type: "folder", label: GROUP_LABELS.folder, results: [], total: 0 };
    }

    const folders = await prisma.folder.findMany({
      where: {
        tenantId: actor.organizationId,
        status: "ACTIVE",
        name: { contains: q, mode: "insensitive" as const },
        createdAt: { gte: date.gte, lte: date.lte },
        ...this.buildCreatedByFilter(filters)
      },
      include: { owner: { select: { id: true, name: true } }, parent: { select: { id: true, name: true } } },
      orderBy: { updatedAt: "desc" },
      take: MAX_PER_GROUP
    });

    return {
      type: "folder",
      label: GROUP_LABELS.folder,
      results: folders.map((f) => ({
        id: f.id,
        type: "folder" as const,
        title: f.name,
        subtitle: f.parent?.name ?? null,
        href: `/documents?folder=${f.id}`,
        createdAt: f.createdAt.toISOString(),
        createdBy: f.owner ? { id: f.owner.id, name: f.owner.name } : null,
        status: null
      })),
      total: folders.length
    };
  }

  private async searchLists(actor: SearchActor, q: string, filters: SearchFilters, date: { gte?: Date; lte?: Date }): Promise<SearchGroupDto> {
    if (!actor.isSuperAdmin && !actor.capabilities.has("lists.view")) {
      return { type: "list", label: GROUP_LABELS.list, results: [], total: 0 };
    }

    const lists = await prisma.listDefinition.findMany({
      where: {
        tenantId: actor.organizationId,
        name: { contains: q, mode: "insensitive" as const },
        createdAt: { gte: date.gte, lte: date.lte },
        ...this.buildCreatedByFilter(filters)
      },
      include: { creator: { select: { id: true, name: true } } },
      orderBy: { updatedAt: "desc" },
      take: MAX_PER_GROUP
    });

    return {
      type: "list",
      label: GROUP_LABELS.list,
      results: lists.map((l) => ({
        id: l.id,
        type: "list" as const,
        title: l.name,
        subtitle: l.description ?? null,
        href: `/lists/${l.id}`,
        createdAt: l.createdAt.toISOString(),
        createdBy: l.creator ? { id: l.creator.id, name: l.creator.name } : null,
        status: null
      })),
      total: lists.length
    };
  }

  private async searchListItems(actor: SearchActor, q: string, filters: SearchFilters, date: { gte?: Date; lte?: Date }): Promise<SearchGroupDto> {
    if (!actor.isSuperAdmin && !actor.capabilities.has("lists.view")) {
      return { type: "list_item", label: GROUP_LABELS.list_item, results: [], total: 0 };
    }

    const items = await prisma.listItem.findMany({
      where: {
        tenantId: actor.organizationId,
        valuesJson: { contains: q, mode: "insensitive" as const },
        createdAt: { gte: date.gte, lte: date.lte },
        ...this.buildCreatedByFilter(filters)
      },
      include: { listDefinition: { select: { id: true, name: true } }, creator: { select: { id: true, name: true } } },
      orderBy: { updatedAt: "desc" },
      take: MAX_PER_GROUP
    });

    return {
      type: "list_item",
      label: GROUP_LABELS.list_item,
      results: items.map((i) => {
        let title = "";
        try { const values = JSON.parse(i.valuesJson); const firstVal = Object.values(values)[0]; if (typeof firstVal === "string") title = firstVal; } catch { /* ignore */ }
        return {
          id: i.id,
          type: "list_item" as const,
          title,
          subtitle: i.listDefinition.name,
          href: `/lists/${i.listDefinitionId}`,
          createdAt: i.createdAt.toISOString(),
          createdBy: i.creator ? { id: i.creator.id, name: i.creator.name } : null,
          status: null
        };
      }),
      total: items.length
    };
  }

  private async searchTasks(actor: SearchActor, q: string, filters: SearchFilters, date: { gte?: Date; lte?: Date }): Promise<SearchGroupDto> {
    if (!actor.isSuperAdmin && !actor.capabilities.has("tasks.view")) {
      return { type: "task", label: GROUP_LABELS.task, results: [], total: 0 };
    }

    const tasks = await prisma.task.findMany({
      where: {
        tenantId: actor.organizationId,
        OR: [{ title: { contains: q, mode: "insensitive" as const } }, { description: { contains: q, mode: "insensitive" as const } }],
        createdAt: { gte: date.gte, lte: date.lte },
        ...this.buildCreatedByFilter(filters),
        ...(filters.teamId ? { assignedTeamId: filters.teamId } : {}),
        ...(filters.status ? { status: filters.status } : {})
      },
      include: { creator: { select: { id: true, name: true } }, assignedMembership: { include: { user: { select: { name: true } } } } },
      orderBy: { updatedAt: "desc" },
      take: MAX_PER_GROUP
    });

    return {
      type: "task",
      label: GROUP_LABELS.task,
      results: tasks.map((t) => ({
        id: t.id,
        type: "task" as const,
        title: t.title,
        subtitle: t.assignedMembership?.user.name ?? null,
        href: `/tasks/${t.id}`,
        createdAt: t.createdAt.toISOString(),
        createdBy: t.creator ? { id: t.creator.id, name: t.creator.name } : null,
        status: t.status
      })),
      total: tasks.length
    };
  }

  private async searchWorkflows(actor: SearchActor, q: string, _filters: SearchFilters, _date: { gte?: Date; lte?: Date }): Promise<SearchGroupDto> {
    if (!actor.isSuperAdmin && !actor.capabilities.has("workflows.view")) {
      return { type: "workflow", label: GROUP_LABELS.workflow, results: [], total: 0 };
    }

    const definitions = await prisma.workflowDefinition.findMany({
      where: {
        tenantId: actor.organizationId,
        name: { contains: q, mode: "insensitive" as const }
      },
      orderBy: { updatedAt: "desc" },
      take: MAX_PER_GROUP
    });

    return {
      type: "workflow",
      label: GROUP_LABELS.workflow,
      results: definitions.map((w) => ({
        id: w.id,
        type: "workflow" as const,
        title: w.name,
        subtitle: w.description ?? null,
        href: `/workflows/${w.id}`,
        createdAt: w.createdAt.toISOString(),
        createdBy: w.createdById ? { id: w.createdById, name: "" } : null,
        status: w.status
      })),
      total: definitions.length
    };
  }

  private async searchUsers(actor: SearchActor, q: string, _filters: SearchFilters, _date: { gte?: Date; lte?: Date }): Promise<SearchGroupDto> {
    if (!actor.isSuperAdmin && !actor.capabilities.has("users.read")) {
      return { type: "user", label: GROUP_LABELS.user, results: [], total: 0 };
    }

    const members = await prisma.organizationMember.findMany({
      where: {
        tenantId: actor.organizationId,
        status: "ACTIVE",
        user: { name: { contains: q, mode: "insensitive" as const } }
      },
      include: { user: { select: { id: true, name: true, email: true } } },
      take: MAX_PER_GROUP
    });

    return {
      type: "user",
      label: GROUP_LABELS.user,
      results: members.map((m) => ({
        id: m.id,
        type: "user" as const,
        title: m.user.name,
        subtitle: m.user.email,
        href: `/settings`,
        createdAt: m.createdAt.toISOString(),
        createdBy: null,
        status: m.status
      })),
      total: members.length
    };
  }

  private async searchSites(actor: SearchActor, q: string): Promise<SearchGroupDto> {
    if (!actor.isSuperAdmin && !actor.capabilities.has("sites.view")) {
      return { type: "site", label: GROUP_LABELS.site, results: [], total: 0 };
    }

    const sites = await prisma.site.findMany({
      where: { tenantId: actor.organizationId, name: { contains: q, mode: "insensitive" as const } },
      orderBy: { updatedAt: "desc" },
      take: 50
    });

    let accessible = sites;
    if (!actor.isSuperAdmin && !actor.capabilities.has("sites.manage")) {
      const memberships = await prisma.siteMember.findMany({
        where: { membershipId: actor.membershipId, siteId: { in: sites.map((s) => s.id) } },
        select: { siteId: true }
      });
      const memberSiteIds = new Set(memberships.map((m) => m.siteId));
      accessible = sites.filter((s) => s.visibility === "ORG" || memberSiteIds.has(s.id));
    }

    return {
      type: "site",
      label: GROUP_LABELS.site,
      results: accessible.slice(0, MAX_PER_GROUP).map((s) => ({
        id: s.id,
        type: "site" as const,
        title: s.name,
        subtitle: s.description ?? s.type,
        href: `/sites/${s.id}`,
        createdAt: s.createdAt.toISOString(),
        createdBy: null,
        status: s.visibility
      })),
      total: accessible.length
    };
  }

  private async searchNews(actor: SearchActor, q: string, filters: SearchFilters, date: { gte?: Date; lte?: Date }): Promise<SearchGroupDto> {
    if (!actor.isSuperAdmin && !actor.capabilities.has("news.view")) {
      return { type: "news", label: GROUP_LABELS.news, results: [], total: 0 };
    }

    const now = new Date();
    const posts = await prisma.newsPost.findMany({
      where: {
        tenantId: actor.organizationId,
        OR: [{ title: { contains: q, mode: "insensitive" as const } }, { excerpt: { contains: q, mode: "insensitive" as const } }, { body: { contains: q, mode: "insensitive" as const } }],
        createdAt: { gte: date.gte, lte: date.lte }
      },
      include: { author: { include: { user: { select: { id: true, name: true } } } }, site: { select: { name: true } } },
      orderBy: { publishedAt: "desc" },
      take: 50
    });

    const canManage = actor.isSuperAdmin || actor.capabilities.has("news.manage");
    const visible = posts.filter((post) => {
      if (canManage || post.authorMembershipId === actor.membershipId) return true;
      if (post.status === "PUBLISHED") return true;
      return post.status === "SCHEDULED" && post.publishedAt !== null && post.publishedAt <= now;
    });

    return {
      type: "news",
      label: GROUP_LABELS.news,
      results: visible.slice(0, MAX_PER_GROUP).map((post) => ({
        id: post.id,
        type: "news" as const,
        title: post.title,
        subtitle: post.site?.name ?? post.category ?? null,
        href: `/news/${post.id}`,
        createdAt: post.createdAt.toISOString(),
        createdBy: post.author ? { id: post.author.user.id, name: post.author.user.name } : null,
        status: post.status,
        snippet: this.buildSnippet(post.body, q)
      })),
      total: visible.length
    };
  }
}

// --- Singleton provider (future: swap with OpenSearch/AI provider) ---

let provider: SearchProvider = new PrismaSearchProvider();

export function setSearchProvider(p: SearchProvider): void {
  provider = p;
}

export function getSearchProvider(): SearchProvider {
  return provider;
}

// --- Service function used by the route ---

export async function search(actor: SearchActor, query: string, filters: SearchFilters): Promise<SearchResponse> {
  return provider.search(actor, query, filters);
}
