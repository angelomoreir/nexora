import type {
  NewsCommentDto,
  NewsDetailResponse,
  NewsListResponse,
  NewsPostDto,
  NewsStatus,
  SiteRole,
  UpsertNewsInput
} from "@nexora/contracts";
import type { NewsComment, NewsPost } from "@prisma/client";
import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { notify } from "../notifications/notification.service.js";
import { publishResourceEvent } from "../collaboration/realtime.service.js";
import { getActor, getSiteRole, type ActorContext } from "../sites/site.service.js";

export { getActor };
export type { ActorContext };

const SITE_ROLE_RANK: Record<SiteRole, number> = { VIEWER: 1, CONTRIBUTOR: 2, EDITOR: 3, MANAGER: 4, ADMIN: 5 };

async function audit(actor: ActorContext, action: string, resourceId: string, context?: Record<string, unknown>) {
  await prisma.auditLog.create({
    data: {
      tenantId: actor.organizationId,
      actorId: actor.membershipId,
      action,
      resourceType: "NewsPost",
      resourceId,
      contextJson: JSON.stringify(context ?? {})
    }
  });
}

function canManage(actor: ActorContext): boolean {
  return actor.isSuperAdmin || actor.capabilities.has("news.manage");
}

async function siteRoleRank(actor: ActorContext, siteId: string | null): Promise<number> {
  if (!siteId) return 0;
  const site = await prisma.site.findFirst({ where: { id: siteId, tenantId: actor.organizationId } });
  if (!site) throw new AppError(404, "SITE_NOT_FOUND", "The site was not found.");
  const role = await getSiteRole(actor, site);
  return role ? SITE_ROLE_RANK[role] ?? 0 : 0;
}

async function canPublish(actor: ActorContext, siteId: string | null): Promise<boolean> {
  if (canManage(actor)) return true;
  // Site contributors and above can publish site news
  return (await siteRoleRank(actor, siteId)) >= SITE_ROLE_RANK.CONTRIBUTOR;
}

type PostWithAuthor = NewsPost & {
  author: { id: string; user: { id: string; name: string; avatar: string | null } } | null;
  site: { id: string; name: string } | null;
  _count?: { comments: number };
};

const postInclude = {
  author: { include: { user: { select: { id: true, name: true, avatar: true } } } },
  site: { select: { id: true, name: true } },
  _count: { select: { comments: true } }
} as const;

function parseTags(json: string): string[] {
  try {
    const parsed = JSON.parse(json) as string[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function toDto(post: PostWithAuthor): NewsPostDto {
  return {
    id: post.id,
    siteId: post.siteId,
    siteName: post.site?.name ?? null,
    title: post.title,
    excerpt: post.excerpt,
    body: post.body,
    coverColor: post.coverColor,
    category: post.category,
    tags: parseTags(post.tagsJson),
    status: post.status as NewsStatus,
    featured: post.featured,
    publishedAt: post.publishedAt?.toISOString() ?? null,
    author: post.author ? { id: post.author.user.id, name: post.author.user.name, avatar: post.author.user.avatar } : null,
    commentCount: post._count?.comments ?? 0,
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString()
  };
}

function toCommentDto(comment: NewsComment & { author: { user: { id: string; name: string; avatar: string | null } } | null }): NewsCommentDto {
  return {
    id: comment.id,
    body: comment.body,
    author: comment.author ? { id: comment.author.user.id, name: comment.author.user.name, avatar: comment.author.user.avatar } : null,
    createdAt: comment.createdAt.toISOString()
  };
}

function isVisibleTo(actor: ActorContext, post: NewsPost): boolean {
  if (canManage(actor) || post.authorMembershipId === actor.membershipId) return true;
  if (post.status === "PUBLISHED") return true;
  if (post.status === "SCHEDULED" && post.publishedAt && post.publishedAt <= new Date()) return true;
  return false;
}

export async function listNews(actor: ActorContext, input: { siteId?: string; status?: NewsStatus }): Promise<NewsListResponse> {
  const posts = await prisma.newsPost.findMany({
    where: { tenantId: actor.organizationId, siteId: input.siteId, status: input.status },
    include: postInclude,
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    take: 100
  });
  return { news: posts.filter((post) => isVisibleTo(actor, post)).map(toDto) };
}

export async function createNews(actor: ActorContext, input: UpsertNewsInput): Promise<NewsPostDto> {
  const siteId = input.siteId ?? null;
  if (!(await canPublish(actor, siteId))) {
    throw new AppError(403, "FORBIDDEN", "You do not have permission to publish news.");
  }
  const status = input.status ?? "DRAFT";
  const post = await prisma.newsPost.create({
    data: {
      tenantId: actor.organizationId,
      siteId,
      title: input.title,
      excerpt: input.excerpt ?? null,
      body: input.body ?? "",
      coverColor: input.coverColor ?? "#6366f1",
      category: input.category ?? null,
      tagsJson: JSON.stringify(input.tags ?? []),
      authorMembershipId: actor.membershipId,
      status,
      featured: input.featured ?? false,
      publishedAt: status === "PUBLISHED" ? new Date() : input.publishedAt ? new Date(input.publishedAt) : null
    },
    include: postInclude
  });
  await audit(actor, "news.created", post.id, { title: post.title, status });
  return toDto(post);
}

export async function getNews(actor: ActorContext, newsId: string): Promise<NewsDetailResponse> {
  const post = await prisma.newsPost.findFirst({
    where: { id: newsId, tenantId: actor.organizationId },
    include: postInclude
  });
  if (!post || !isVisibleTo(actor, post)) throw new AppError(404, "NEWS_NOT_FOUND", "The news post was not found.");
  const comments = await prisma.newsComment.findMany({
    where: { newsId: post.id },
    include: { author: { include: { user: { select: { id: true, name: true, avatar: true } } } } },
    orderBy: { createdAt: "asc" }
  });
  return { post: toDto(post), comments: comments.map(toCommentDto) };
}

export async function updateNews(actor: ActorContext, newsId: string, input: Partial<UpsertNewsInput>): Promise<NewsPostDto> {
  const post = await prisma.newsPost.findFirst({ where: { id: newsId, tenantId: actor.organizationId } });
  if (!post) throw new AppError(404, "NEWS_NOT_FOUND", "The news post was not found.");
  const own = post.authorMembershipId === actor.membershipId;
  if (!own && !canManage(actor) && (await siteRoleRank(actor, post.siteId)) < SITE_ROLE_RANK.EDITOR) {
    throw new AppError(403, "FORBIDDEN", "You do not have permission to edit this news post.");
  }

  const updates: Record<string, unknown> = {
    title: input.title,
    excerpt: input.excerpt === null ? null : input.excerpt,
    body: input.body,
    category: input.category === null ? null : input.category,
    coverColor: input.coverColor,
    featured: input.featured,
    status: input.status
  };
  if (input.tags) updates.tagsJson = JSON.stringify(input.tags);
  if (input.siteId !== undefined) updates.siteId = input.siteId;
  if (input.status === "PUBLISHED" && post.status !== "PUBLISHED") updates.publishedAt = new Date();
  if (input.publishedAt) updates.publishedAt = new Date(input.publishedAt);

  const updated = await prisma.newsPost.update({ where: { id: post.id }, data: updates, include: postInclude });
  await audit(actor, "news.updated", post.id, { title: updated.title, status: updated.status });
  publishResourceEvent(actor.organizationId, "news", post.id, "resource.updated");
  return toDto(updated);
}

export async function deleteNews(actor: ActorContext, newsId: string) {
  const post = await prisma.newsPost.findFirst({ where: { id: newsId, tenantId: actor.organizationId } });
  if (!post) throw new AppError(404, "NEWS_NOT_FOUND", "The news post was not found.");
  const own = post.authorMembershipId === actor.membershipId;
  if (!own && !canManage(actor) && (await siteRoleRank(actor, post.siteId)) < SITE_ROLE_RANK.MANAGER) {
    throw new AppError(403, "FORBIDDEN", "You do not have permission to delete this news post.");
  }
  await prisma.newsPost.delete({ where: { id: post.id } });
  await audit(actor, "news.deleted", post.id, { title: post.title });
}

export async function addNewsComment(actor: ActorContext, newsId: string, body: string): Promise<NewsCommentDto> {
  const post = await prisma.newsPost.findFirst({ where: { id: newsId, tenantId: actor.organizationId } });
  if (!post || !isVisibleTo(actor, post)) throw new AppError(404, "NEWS_NOT_FOUND", "The news post was not found.");
  const comment = await prisma.newsComment.create({
    data: { tenantId: actor.organizationId, newsId: post.id, authorMembershipId: actor.membershipId, body },
    include: { author: { include: { user: { select: { id: true, name: true, avatar: true } } } } }
  });
  if (post.authorMembershipId !== actor.membershipId) {
    await notify({
      tenantId: actor.organizationId,
      recipientId: post.authorMembershipId,
      type: "news.commented",
      title: `Novo comentário em "${post.title}"`,
      body: body.slice(0, 140),
      data: { newsId: post.id }
    });
  }
  publishResourceEvent(actor.organizationId, "news", post.id, "comment.created", { userId: comment.author.user.id, name: comment.author.user.name, avatar: comment.author.user.avatar });
  return toCommentDto(comment);
}

export async function removeNewsComment(actor: ActorContext, newsId: string, commentId: string) {
  const comment = await prisma.newsComment.findFirst({ where: { id: commentId, newsId, tenantId: actor.organizationId } });
  if (!comment) throw new AppError(404, "COMMENT_NOT_FOUND", "The comment was not found.");
  const own = comment.authorMembershipId === actor.membershipId;
  if (!own && !canManage(actor)) {
    const post = await prisma.newsPost.findUnique({ where: { id: newsId }, select: { siteId: true } });
    if ((await siteRoleRank(actor, post?.siteId ?? null)) < SITE_ROLE_RANK.MANAGER) {
      throw new AppError(403, "FORBIDDEN", "You do not have permission to delete this comment.");
    }
  }
  await prisma.newsComment.delete({ where: { id: comment.id } });
  await audit(actor, "news.comment_deleted", newsId, { commentId });
  publishResourceEvent(actor.organizationId, "news", newsId, "comment.deleted");
}
