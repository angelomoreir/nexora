import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router";
import { useWorkspace } from "../components/layout/app-layout";
import { PageRenderer } from "../components/page-renderer";
import { Alert, Badge, Breadcrumb, Button, Page, PageHeader, Skeleton } from "../components/ui";
import { sitesApi } from "../lib/api";
import { useLocaleFormatter } from "../lib/format";

export function PageViewPage() {
  const { pageId = "" } = useParams();
  const { t } = useTranslation();
  const { organization } = useWorkspace();
  const { formatDateTime } = useLocaleFormatter();
  const detail = useQuery({ queryKey: ["page", organization.id, pageId], queryFn: () => sitesApi.getPage(organization.id, pageId), enabled: Boolean(pageId) });

  if (detail.isPending) return <Page><Skeleton className="h-64" /></Page>;
  if (detail.isError || !detail.data) return <Page><Alert variant="danger" title={t("pages.loadingError")}><Button className="mt-3" size="sm" onClick={() => void detail.refetch()}>{t("common.retry")}</Button></Alert></Page>;

  const page = detail.data.page;
  return (
    <Page>
      <Breadcrumb className="mb-3" items={[{ label: t("sites.title"), href: `/sites/${page.siteId}` }, { label: page.title }]} />
      <PageHeader
        title={page.title}
        description={t("pages.updatedAt", { date: formatDateTime(page.updatedAt) })}
        actions={<Badge variant={page.status === "PUBLISHED" ? "success" : "warning"}>{t(`pages.status.${page.status}`)}</Badge>}
      />
      <PageRenderer widgets={page.widgets} siteId={page.siteId} />
    </Page>
  );
}
