import { useQuery } from "@tanstack/react-query";
import type { PageWidget } from "@nexora/contracts";
import { FileText, List, Newspaper, TrendingUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { useWorkspace } from "./layout/app-layout";
import { documentsApi, listsApi, newsApi } from "../lib/api";
import { useLocaleFormatter } from "../lib/format";

function RecentDocumentsWidget() {
  const { t } = useTranslation();
  const { organization } = useWorkspace();
  const { formatRelative } = useLocaleFormatter();
  const { data } = useQuery({ queryKey: ["widget-recent-docs", organization.id], queryFn: () => documentsApi.recent(organization.id) });
  const documents = (data?.documents ?? []).slice(0, 6);
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground"><FileText className="size-4 text-primary" />{t("pages.widgetRecentDocs")}</p>
      {documents.length === 0 ? <p className="text-xs text-muted-foreground">{t("pages.noDocuments")}</p> : (
        <div className="space-y-1">
          {documents.map((doc) => (
            <Link key={doc.id} to={`/documents/${doc.id}`} className="nx-focus-ring flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-surface-secondary">
              <FileText className="size-4 shrink-0 text-muted-foreground" />
              <span className="flex-1 truncate text-sm text-secondary-foreground">{doc.name}</span>
              <span className="text-[10px] text-muted-foreground">{formatRelative(doc.updatedAt)}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function NewsWidget({ siteId }: { siteId?: string | null }) {
  const { t } = useTranslation();
  const { organization } = useWorkspace();
  const { formatRelative } = useLocaleFormatter();
  const { data } = useQuery({ queryKey: ["widget-news", organization.id, siteId], queryFn: () => newsApi.list(organization.id, { siteId: siteId ?? undefined, status: "PUBLISHED" }) });
  const items = (data?.news ?? []).slice(0, 4);
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground"><Newspaper className="size-4 text-primary" />{t("pages.widgetNews")}</p>
      {items.length === 0 ? <p className="text-xs text-muted-foreground">{t("news.empty")}</p> : (
        <div className="space-y-2">
          {items.map((item) => (
            <Link key={item.id} to={`/news/${item.id}`} className="nx-focus-ring flex items-start gap-2.5 rounded-md px-2 py-1.5 hover:bg-surface-secondary">
              <span className="mt-1 h-6 w-1 shrink-0 rounded-full" style={{ background: item.coverColor }} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-secondary-foreground">{item.title}</span>
                <span className="text-[10px] text-muted-foreground">{item.publishedAt ? formatRelative(item.publishedAt) : ""}</span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function ListWidget({ listId }: { listId?: string }) {
  const { organization } = useWorkspace();
  const { data } = useQuery({
    queryKey: ["widget-list", organization.id, listId],
    queryFn: () => listsApi.items(organization.id, listId!, { page: 1, pageSize: 6 }),
    enabled: Boolean(listId)
  });
  const listQuery = useQuery({
    queryKey: ["widget-list-meta", organization.id, listId],
    queryFn: () => listsApi.get(organization.id, listId!),
    enabled: Boolean(listId)
  });
  if (!listId) return null;
  const title = listQuery.data?.name ?? "Lista";
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground"><List className="size-4 text-primary" />{title}</p>
      <div className="space-y-1">
        {(data?.items ?? []).map((item) => (
          <Link key={item.id} to={`/lists/${listId}`} className="nx-focus-ring block truncate rounded-md px-2 py-1.5 text-sm text-secondary-foreground hover:bg-surface-secondary">
            {String(Object.values(item.values)[0] ?? "—")}
          </Link>
        ))}
      </div>
    </div>
  );
}

export function PageRenderer({ widgets, siteId }: { widgets: PageWidget[]; siteId?: string | null }) {
  return (
    <div className="space-y-5">
      {widgets.map((widget) => {
        switch (widget.type) {
          case "hero":
            return (
              <div key={widget.id} className="rounded-lg border border-border bg-gradient-to-br from-primary-subtle via-surface to-surface p-8">
                <h2 className="text-2xl font-bold tracking-tight text-foreground">{String(widget.props.title ?? "")}</h2>
                {widget.props.subtitle ? <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{String(widget.props.subtitle)}</p> : null}
              </div>
            );
          case "title":
            return <h3 key={widget.id} className="text-lg font-semibold text-foreground">{String(widget.props.text ?? "")}</h3>;
          case "text":
            return <div key={widget.id} className="whitespace-pre-wrap rounded-lg border border-border bg-surface p-5 text-sm leading-relaxed text-secondary-foreground">{String(widget.props.text ?? "")}</div>;
          case "recent-docs":
            return <RecentDocumentsWidget key={widget.id} />;
          case "news":
            return <NewsWidget key={widget.id} siteId={siteId} />;
          case "list":
            return <ListWidget key={widget.id} listId={widget.props.listId as string | undefined} />;
          case "kpi":
            return (
              <div key={widget.id} className="flex items-center gap-4 rounded-lg border border-border bg-surface p-5">
                <span className="rounded-lg bg-primary-subtle p-3 text-primary-subtle-foreground"><TrendingUp className="size-6" /></span>
                <div>
                  <div className="text-2xl font-bold text-foreground">{String(widget.props.value ?? "—")}</div>
                  <div className="text-xs text-muted-foreground">{String(widget.props.label ?? "KPI")}</div>
                </div>
              </div>
            );
          case "link":
            return (
              <a key={widget.id} href={String(widget.props.url ?? "#")} target="_blank" rel="noreferrer" className="nx-focus-ring inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover">
                {String(widget.props.label ?? "Abrir")}
              </a>
            );
          case "html":
            return <div key={widget.id} className="rounded-lg border border-border bg-surface p-5 text-sm text-secondary-foreground" dangerouslySetInnerHTML={{ __html: String(widget.props.html ?? "") }} />;
          default:
            return null;
        }
      })}
    </div>
  );
}
