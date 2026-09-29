import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, MessageSquare, Newspaper, Send, Star, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { Avatar, useWorkspace } from "../components/layout/app-layout";
import { useRealtimeChannel } from "../components/collaboration/use-realtime-channel";
import { LivePresence } from "../components/collaboration/live-presence";
import { Alert, Badge, Breadcrumb, Button, Card, CardContent, Page, PageHeader, Skeleton, Textarea, useConfirm, useToast } from "../components/ui";
import { newsApi } from "../lib/api";
import { apiErrorText } from "../lib/api-error";
import { useLocaleFormatter } from "../lib/format";

export function NewsDetailPage() {
  const { postId = "" } = useParams();
  const { t } = useTranslation();
  const { organization, session } = useWorkspace();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { confirm, confirmDialog } = useConfirm();
  const { formatDateTime } = useLocaleFormatter();
  const [comment, setComment] = useState("");

  const detail = useQuery({ queryKey: ["news-post", organization.id, postId], queryFn: () => newsApi.get(organization.id, postId), enabled: Boolean(postId) });
  const realtime = useRealtimeChannel({
    organizationId: organization.id,
    channel: { type: "news", resourceId: postId },
    enabled: Boolean(postId) && detail.isSuccess,
    onEvent: (event) => {
      if (event.type === "connected" || event.type === "comment.created" || event.type === "comment.deleted" || event.type === "resource.updated") {
        void queryClient.invalidateQueries({ queryKey: ["news-post", organization.id, postId] });
      }
    }
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["news-post", organization.id, postId] });

  const addComment = useMutation({
    mutationFn: () => newsApi.addComment(organization.id, postId, comment.trim()),
    onSuccess: async () => { setComment(""); await refresh(); },
    onError: (error: Error) => toast({ tone: "danger", title: t("common.error"), description: apiErrorText(error, t) })
  });
  const removeComment = useMutation({
    mutationFn: (commentId: string) => newsApi.removeComment(organization.id, postId, commentId),
    onSuccess: refresh,
    onError: (error: Error) => toast({ tone: "danger", title: t("common.error"), description: apiErrorText(error, t) })
  });
  const removePost = useMutation({
    mutationFn: () => newsApi.remove(organization.id, postId),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["news", organization.id] }); navigate("/news"); },
    onError: (error: Error) => toast({ tone: "danger", title: t("common.error"), description: apiErrorText(error, t) })
  });

  if (detail.isPending) return <Page><Skeleton className="h-64" /></Page>;
  if (detail.isError || !detail.data) return <Page><Alert variant="danger" title={t("news.loadingError")}><Button className="mt-3" size="sm" onClick={() => void detail.refetch()}>{t("common.retry")}</Button></Alert></Page>;

  const { post, comments } = detail.data;
  const canDelete = post.author?.id === session.user.id;

  function submitComment(event: FormEvent) {
    event.preventDefault();
    if (comment.trim()) addComment.mutate();
  }

  return (
    <Page>
      <Breadcrumb className="mb-3" items={[{ label: t("news.title"), href: "/news" }, { label: post.title }]} />
      <div className="overflow-hidden rounded-lg border border-border">
        <div className="relative h-48" style={{ backgroundImage: `linear-gradient(135deg, ${post.coverColor}, ${post.coverColor}55)` }}>
          <span className="absolute inset-0 flex items-center justify-center opacity-20"><Newspaper className="size-20 text-white" /></span>
          {post.featured ? <span className="absolute right-3 top-3 rounded-full bg-overlay p-1.5"><Star className="size-4 fill-amber-300 text-amber-300" /></span> : null}
        </div>
      </div>
      <PageHeader
        className="mt-5"
        title={post.title}
        description={post.excerpt ?? undefined}
        actions={<div className="flex items-center gap-2"><Badge variant={post.status === "PUBLISHED" ? "success" : post.status === "SCHEDULED" ? "warning" : "neutral"}>{t(`news.status.${post.status}`)}</Badge>{canDelete ? <Button variant="ghost" size="icon-sm" onClick={async () => { if (await confirm(t("news.deleteConfirm"))) removePost.mutate(); }} aria-label={t("common.delete")}><Trash2 className="size-4 text-danger" /></Button> : null}</div>}
      />
      <div className="mb-5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-2"><Avatar name={post.author?.name ?? "?"} avatar={post.author?.avatar ?? null} />{post.author?.name}</span>
        <span className="flex items-center gap-1"><Clock className="size-3" />{formatDateTime(post.publishedAt ?? post.createdAt)}</span>
        {post.category ? <Badge variant="outline">{post.category}</Badge> : null}
        {post.siteName ? <Badge variant="outline">{post.siteName}</Badge> : null}
        {post.tags.map((tag) => <Badge key={tag} variant="primary">#{tag}</Badge>)}
      </div>
      <Card className="mb-8"><CardContent className="whitespace-pre-wrap p-6 text-sm leading-relaxed text-secondary-foreground">{post.body || post.excerpt || ""}</CardContent></Card>

      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground"><MessageSquare className="size-4 text-primary" />{t("news.comments", { count: comments.length })}</h2>
          <LivePresence status={realtime.status} presence={realtime.presence} />
        </div>
        <div className="space-y-3">
          {comments.map((item) => (
            <div key={item.id} className="flex gap-3 rounded-lg border border-border bg-surface p-4">
              <Avatar name={item.author?.name ?? "?"} avatar={item.author?.avatar ?? null} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{item.author?.name}</span>
                  <span className="text-[11px] text-muted-foreground">{formatDateTime(item.createdAt)}</span>
                  {item.author?.id === session.user.id ? <Button variant="ghost" size="icon-sm" className="ml-auto text-muted-foreground hover:bg-danger-subtle hover:text-danger" onClick={() => removeComment.mutate(item.id)} aria-label={t("common.delete")}><Trash2 className="size-3.5" /></Button> : null}
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-secondary-foreground">{item.body}</p>
              </div>
            </div>
          ))}
        </div>
        <form className="mt-4 flex gap-2" onSubmit={submitComment}>
          <Textarea rows={2} className="flex-1" placeholder={t("news.commentPlaceholder")} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={2000} />
          <Button type="submit" disabled={!comment.trim()} loading={addComment.isPending}><Send />{t("common.send")}</Button>
        </form>
      </section>
      {confirmDialog}
    </Page>
  );
}
