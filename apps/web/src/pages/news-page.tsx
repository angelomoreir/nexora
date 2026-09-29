import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NewsPostDto, NewsStatus } from "@nexora/contracts";
import { Clock, Newspaper, Plus, Star } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { Avatar, useWorkspace } from "../components/layout/app-layout";
import { Alert, Badge, Button, Checkbox, Dialog, EmptyState, Field, Input, Page, PageHeader, Select, Skeleton, Textarea, useToast } from "../components/ui";
import { ContextualHelpButton } from "../components/help/contextual-help-button";
import { newsApi, sitesApi } from "../lib/api";
import { apiErrorText } from "../lib/api-error";
import { useLocaleFormatter } from "../lib/format";

const COVER_COLORS = ["#6366f1", "#8b5cf6", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#0f766e"];

export function NewsPage() {
  const { t } = useTranslation();
  const { organization } = useWorkspace();
  const canManage = organization.permissions.includes("news.manage");
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { formatDate } = useLocaleFormatter();
  const [open, setOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<NewsStatus | "">("");
  const [form, setForm] = useState({ title: "", excerpt: "", body: "", category: "", tags: "", coverColor: COVER_COLORS[0]!, siteId: "", status: "PUBLISHED" as NewsStatus, featured: false });

  const listing = useQuery({
    queryKey: ["news", organization.id, statusFilter],
    queryFn: () => newsApi.list(organization.id, { status: statusFilter || undefined })
  });
  const sitesQuery = useQuery({ queryKey: ["sites", organization.id], queryFn: () => sitesApi.list(organization.id) });

  const create = useMutation({
    mutationFn: () => newsApi.create(organization.id, {
      title: form.title.trim(),
      excerpt: form.excerpt.trim() || null,
      body: form.body,
      category: form.category.trim() || null,
      tags: form.tags ? form.tags.split(",").map((tag) => tag.trim()).filter(Boolean) : [],
      coverColor: form.coverColor,
      siteId: form.siteId || null,
      status: form.status,
      featured: form.featured
    }),
    onSuccess: async () => {
      setOpen(false);
      setForm({ title: "", excerpt: "", body: "", category: "", tags: "", coverColor: COVER_COLORS[0]!, siteId: "", status: "PUBLISHED", featured: false });
      await queryClient.invalidateQueries({ queryKey: ["news", organization.id] });
      toast({ tone: "success", title: t("news.created") });
    },
    onError: (error: Error) => toast({ tone: "danger", title: t("common.error"), description: apiErrorText(error, t) })
  });

  const featured = (listing.data?.news ?? []).filter((post) => post.featured);
  const rest = (listing.data?.news ?? []).filter((post) => !post.featured);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (form.title.trim()) create.mutate();
  }

  function NewsCard({ post, big }: { post: NewsPostDto; big?: boolean }) {
    return (
      <Link to={`/news/${post.id}`} className="nx-focus-ring block h-full overflow-hidden rounded-lg border border-border bg-surface shadow-sm transition-colors hover:border-border-strong">
        <div className={`relative ${big ? "h-44" : "h-28"}`} style={{ backgroundImage: `linear-gradient(135deg, ${post.coverColor}, ${post.coverColor}55)` }}>
          <span className="absolute inset-0 flex items-center justify-center opacity-20"><Newspaper className="size-16 text-white" /></span>
          {post.featured ? <span className="absolute right-3 top-3 rounded-full bg-overlay p-1.5"><Star className="size-4 fill-amber-300 text-amber-300" /></span> : null}
          <span className="absolute bottom-3 left-3 flex gap-1.5">
            {post.category ? <Badge className="border-0 bg-overlay text-white">{post.category}</Badge> : null}
            <Badge className={`border-0 text-white ${post.status === "PUBLISHED" ? "bg-success/80" : post.status === "SCHEDULED" ? "bg-warning/80" : "bg-muted-foreground/80"}`}>{t(`news.status.${post.status}`)}</Badge>
          </span>
        </div>
        <div className="p-4">
          <h2 className={`font-semibold leading-snug text-foreground ${big ? "text-lg" : "text-sm"}`}>{post.title}</h2>
          {post.excerpt ? <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">{post.excerpt}</p> : null}
          <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
            <Avatar name={post.author?.name ?? "?"} avatar={post.author?.avatar ?? null} />
            <span className="truncate">{post.author?.name}</span>
            {post.siteName ? <Badge variant="outline">{post.siteName}</Badge> : null}
            <Clock className="ml-auto size-3" />{formatDate(post.publishedAt ?? post.createdAt)}
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Page>
      <PageHeader
        eyebrow={organization.name}
        title={t("news.title")}
        description={t("news.description")}
        actions={<><ContextualHelpButton route="/news" showLabel /><Button onClick={() => setOpen(true)} disabled={!canManage} title={!canManage ? t("errors.FORBIDDEN") : undefined}><Plus />{t("news.create")}</Button></>}
      />
      {!canManage ? <Alert variant="info">{t("news.readOnlyNotice")}</Alert> : null}
      <div className="mb-4 flex justify-end">
        <Select className="w-48" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as NewsStatus | "")} aria-label={t("common.status")}>
          <option value="">{t("common.allStatuses")}</option>
          {(["DRAFT", "PUBLISHED", "SCHEDULED"] as NewsStatus[]).map((status) => <option key={status} value={status}>{t(`news.status.${status}`)}</option>)}
        </Select>
      </div>

      {listing.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-52" />)}</div>
      ) : listing.isError ? (
        <Alert variant="danger" title={t("news.loadingError")}><Button className="mt-3" size="sm" onClick={() => void listing.refetch()}>{t("common.retry")}</Button></Alert>
      ) : (listing.data?.news.length ?? 0) === 0 ? (
        <EmptyState icon={Newspaper} title={t("news.empty")} description={canManage ? t("news.emptyDesc") : t("news.readOnlyNotice")} action={canManage ? <Button onClick={() => setOpen(true)}><Plus />{t("news.create")}</Button> : undefined} />
      ) : (
        <>
          {featured.length > 0 ? <div className="mb-6 grid gap-4 lg:grid-cols-2">{featured.slice(0, 2).map((post) => <NewsCard key={post.id} post={post} big />)}</div> : null}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{rest.map((post) => <NewsCard key={post.id} post={post} />)}</div>
        </>
      )}

      <Dialog open={open} onOpenChange={setOpen} title={t("news.newPost")} description={t("news.createDesc")}
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>{t("common.cancel")}</Button><Button type="submit" form="create-news-form" loading={create.isPending} disabled={!form.title.trim()}>{t("common.create")}</Button></>}>
        <form id="create-news-form" className="space-y-4" onSubmit={submit}>
          <Field label={t("common.title")} required error={create.error ? apiErrorText(create.error, t) : undefined}>
            <Input autoFocus maxLength={200} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Field>
          <Field label={t("news.excerpt")}>
            <Textarea rows={2} maxLength={480} value={form.excerpt} onChange={(e) => setForm({ ...form, excerpt: e.target.value })} />
          </Field>
          <Field label={t("news.body")}>
            <Textarea rows={5} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label={t("news.category")}><Input maxLength={80} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></Field>
            <Field label={t("news.tags")} helper={t("news.tagsHint")}><Input maxLength={240} value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label={t("news.site")}>
              <Select value={form.siteId || "_org"} onChange={(e) => setForm({ ...form, siteId: e.target.value === "_org" ? "" : e.target.value })}>
                <option value="_org">{t("news.siteGlobal")}</option>
                {(sitesQuery.data?.sites ?? []).map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
              </Select>
            </Field>
            <Field label={t("common.status")}>
              <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as NewsStatus })}>
                <option value="DRAFT">{t("news.status.DRAFT")}</option>
                <option value="PUBLISHED">{t("news.status.PUBLISHED")}</option>
                <option value="SCHEDULED">{t("news.status.SCHEDULED")}</option>
              </Select>
            </Field>
          </div>
          <div className="flex items-center justify-between gap-4">
            <Field label={t("news.coverColor")}>
              <div className="flex gap-2 pt-1">
                {COVER_COLORS.map((color) => (
                  <button key={color} type="button" onClick={() => setForm({ ...form, coverColor: color })}
                    className={`nx-focus-ring size-7 rounded-md border-2 ${form.coverColor === color ? "border-foreground" : "border-transparent"}`}
                    style={{ background: color }} aria-label={color} />
                ))}
              </div>
            </Field>
            <label className="flex cursor-pointer items-center gap-2 pt-5 text-sm text-secondary-foreground">
              <Checkbox checked={form.featured} onChange={(e) => setForm({ ...form, featured: e.target.checked })} />{t("news.featured")}
            </label>
          </div>
        </form>
      </Dialog>
    </Page>
  );
}
