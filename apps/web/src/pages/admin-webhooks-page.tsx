import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateWebhookResponse, WebhookDeliveryDto, WebhookDto, WebhookStatus } from "@nexora/contracts";
import { Copy, Pencil, ScrollText, TestTube, Trash2, Webhook } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useWorkspace } from "../components/layout/app-layout";
import { ContextualHelpButton } from "../components/help/contextual-help-button";
import { Alert, Badge, Button, Checkbox, Dialog, EmptyState, Field, Input, Page, PageHeader, Skeleton, Switch, Table, TableBody, TableCell, TableContainer, TableHead, TableHeader, TableRow, useToast } from "../components/ui";
import { webhooksApi } from "../lib/api";
import { apiErrorText } from "../lib/api-error";
import { useLocaleFormatter } from "../lib/format";

const WEBHOOK_EVENTS = [
  "document.created",
  "document.updated",
  "document.deleted",
  "document.restored",
  "document.version.added",
  "document.commented",
  "list.item.added",
  "task.created",
  "task.updated",
  "task.commented"
];

export function AdminWebhooksPage() {
  const { t } = useTranslation();
  const { organization } = useWorkspace();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { formatDateTime } = useLocaleFormatter();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<WebhookDto | null>(null);
  const [createdSecret, setCreatedSecret] = useState<{ name: string; secret: string } | null>(null);
  const [deliveriesFor, setDeliveriesFor] = useState<WebhookDto | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<WebhookDto | null>(null);

  const queryKey = ["webhooks", organization.id];
  const webhooks = useQuery({ queryKey, queryFn: () => webhooksApi.list(organization.id) });
  const refresh = () => queryClient.invalidateQueries({ queryKey });

  const test = useMutation({
    mutationFn: (webhookId: string) => webhooksApi.test(organization.id, webhookId),
    onSuccess: (delivery) => {
      void refresh();
      if (delivery.status === "SUCCESS") toast({ tone: "success", title: t("webhooks.testSuccess", { code: delivery.responseCode ?? "—" }) });
      else toast({ tone: "warning", title: t("webhooks.testFailed"), description: delivery.error ?? undefined });
    },
    onError: (error: Error) => toast({ tone: "danger", title: t("webhooks.errorTesting"), description: apiErrorText(error, t) })
  });
  const remove = useMutation({
    mutationFn: (webhookId: string) => webhooksApi.remove(organization.id, webhookId),
    onSuccess: async () => { setConfirmDelete(null); await refresh(); toast({ tone: "success", title: t("webhooks.deleted") }); },
    onError: (error: Error) => toast({ tone: "danger", title: t("webhooks.errorDeleting"), description: apiErrorText(error, t) })
  });

  const items = webhooks.data?.webhooks ?? [];

  return (
    <Page>
      <PageHeader
        eyebrow={t("navigation.admin")}
        title={t("webhooks.title")}
        description={t("webhooks.description")}
        actions={<><ContextualHelpButton route="/admin/webhooks" showLabel /><Button onClick={() => { setEditing(null); setFormOpen(true); }}><Webhook />{t("webhooks.create")}</Button></>}
      />

      {webhooks.isPending ? <div className="space-y-2">{Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-16 w-full" />)}</div> : null}
      {webhooks.isError ? <Alert variant="danger" title={t("webhooks.loadingError")}><p>{apiErrorText(webhooks.error, t)}</p><Button className="mt-4" size="sm" onClick={() => void webhooks.refetch()}>{t("common.retry")}</Button></Alert> : null}
      {webhooks.data && items.length === 0 ? <EmptyState icon={Webhook} title={t("webhooks.empty")} description={t("webhooks.emptyDesc")} action={<Button onClick={() => { setEditing(null); setFormOpen(true); }}><Webhook />{t("webhooks.create")}</Button>} /> : null}

      {items.length > 0 ? (
        <TableContainer>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("common.name")}</TableHead>
                <TableHead className="hidden lg:table-cell">{t("webhooks.url")}</TableHead>
                <TableHead className="hidden xl:table-cell">{t("webhooks.events")}</TableHead>
                <TableHead>{t("common.status")}</TableHead>
                <TableHead className="hidden md:table-cell">{t("common.createdAt")}</TableHead>
                <TableHead className="w-40 text-right"><span className="sr-only">{t("common.actions")}</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((webhook) => (
                <TableRow key={webhook.id}>
                  <TableCell className="font-medium text-foreground">{webhook.name}</TableCell>
                  <TableCell className="hidden max-w-64 truncate font-mono text-xs text-muted-foreground lg:table-cell" title={webhook.url}>{webhook.url}</TableCell>
                  <TableCell className="hidden xl:table-cell">
                    <span className="flex max-w-80 flex-wrap gap-1">
                      {webhook.events.includes("*") ? <Badge variant="primary">{t("webhooks.eventsAll")}</Badge> : webhook.events.slice(0, 3).map((event) => <Badge key={event} variant="outline">{event}</Badge>)}
                      {!webhook.events.includes("*") && webhook.events.length > 3 ? <Badge variant="neutral">+{webhook.events.length - 3}</Badge> : null}
                    </span>
                  </TableCell>
                  <TableCell><Badge variant={webhook.status === "ACTIVE" ? "success" : "neutral"}>{webhook.status === "ACTIVE" ? t("webhooks.statusActive") : t("webhooks.statusDisabled")}</Badge></TableCell>
                  <TableCell className="hidden whitespace-nowrap text-muted-foreground md:table-cell">{formatDateTime(webhook.createdAt)}</TableCell>
                  <TableCell>
                    <span className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon-sm" aria-label={t("webhooks.test")} title={t("webhooks.test")} loading={test.isPending && test.variables === webhook.id} onClick={() => test.mutate(webhook.id)}><TestTube /></Button>
                      <Button variant="ghost" size="icon-sm" aria-label={t("webhooks.deliveries")} title={t("webhooks.deliveries")} onClick={() => setDeliveriesFor(webhook)}><ScrollText /></Button>
                      <Button variant="ghost" size="icon-sm" aria-label={t("common.edit")} title={t("common.edit")} onClick={() => { setEditing(webhook); setFormOpen(true); }}><Pencil /></Button>
                      <Button variant="ghost" size="icon-sm" className="text-danger hover:bg-danger-subtle hover:text-danger" aria-label={t("common.delete")} title={t("common.delete")} onClick={() => setConfirmDelete(webhook)}><Trash2 /></Button>
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      ) : null}

      {formOpen ? <WebhookFormDialog webhook={editing} onClose={() => setFormOpen(false)} onCreated={(name, secret) => { setFormOpen(false); setCreatedSecret({ name, secret }); }} onSaved={refresh} /> : null}
      {createdSecret ? <SecretDialog name={createdSecret.name} secret={createdSecret.secret} onClose={() => setCreatedSecret(null)} /> : null}
      {deliveriesFor ? <DeliveriesDialog webhook={deliveriesFor} onClose={() => setDeliveriesFor(null)} /> : null}
      <Dialog open={confirmDelete !== null} onOpenChange={(next) => !next && setConfirmDelete(null)} title={t("common.delete")} description={t("webhooks.deleteConfirm", { name: confirmDelete?.name ?? "" })}
        footer={<><Button variant="ghost" onClick={() => setConfirmDelete(null)}>{t("common.cancel")}</Button><Button variant="destructive" loading={remove.isPending} onClick={() => confirmDelete && remove.mutate(confirmDelete.id)}>{t("common.delete")}</Button></>} />
    </Page>
  );
}

function WebhookFormDialog({ webhook, onClose, onCreated, onSaved }: { webhook: WebhookDto | null; onClose: () => void; onCreated: (name: string, secret: string) => void; onSaved: () => Promise<unknown> }) {
  const { t } = useTranslation();
  const { organization } = useWorkspace();
  const { toast } = useToast();
  const [name, setName] = useState(webhook?.name ?? "");
  const [url, setUrl] = useState(webhook?.url ?? "");
  const [events, setEvents] = useState<string[]>(webhook?.events ?? []);
  const [status, setStatus] = useState<WebhookStatus>(webhook?.status ?? "ACTIVE");
  const allEvents = events.includes("*");

  const save = useMutation({
    mutationFn: (): Promise<CreateWebhookResponse | WebhookDto> => {
      const payload = { name: name.trim(), url: url.trim(), events };
      return webhook
        ? webhooksApi.update(organization.id, webhook.id, { ...payload, status })
        : webhooksApi.create(organization.id, payload);
    },
    onSuccess: async (result) => {
      await onSaved();
      if (webhook) {
        toast({ tone: "success", title: t("webhooks.updated") });
        onClose();
      } else {
        const created = result as CreateWebhookResponse;
        onCreated(created.webhook.name, created.secret);
      }
    },
    onError: (error: Error) => toast({ tone: "danger", title: webhook ? t("webhooks.errorUpdating") : t("webhooks.errorCreating"), description: apiErrorText(error, t) })
  });

  function toggleEvent(event: string, checked: boolean) {
    setEvents((current) => checked ? [...current.filter((item) => item !== "*"), event] : current.filter((item) => item !== event));
  }
  function toggleAll(checked: boolean) {
    setEvents(checked ? ["*"] : []);
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (name.trim() && url.trim() && events.length) save.mutate();
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()} size="lg" title={webhook ? t("webhooks.editTitle") : t("webhooks.createTitle")} description={t("webhooks.createDesc")}
      footer={<><Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button><Button type="submit" form="webhook-form" loading={save.isPending} disabled={!name.trim() || !url.trim() || events.length === 0}>{t("common.save")}</Button></>}>
      <form id="webhook-form" className="space-y-4" onSubmit={submit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("webhooks.name")} required><Input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder={t("webhooks.namePlaceholder")} maxLength={120} /></Field>
          <Field label={t("webhooks.url")} required><Input type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder={t("webhooks.urlPlaceholder")} maxLength={2000} /></Field>
        </div>
        {webhook ? (
          <div className="flex items-center justify-between gap-4 rounded-md border border-border bg-surface-secondary p-3.5">
            <p className="text-sm font-semibold text-foreground">{t("webhooks.status")}</p>
            <span className="flex items-center gap-2 text-sm text-secondary-foreground">{status === "ACTIVE" ? t("webhooks.statusActive") : t("webhooks.statusDisabled")}<Switch checked={status === "ACTIVE"} onCheckedChange={(checked) => setStatus(checked ? "ACTIVE" : "DISABLED")} label={t("webhooks.status")} /></span>
          </div>
        ) : null}
        <fieldset>
          <legend className="nx-label mb-2">{t("webhooks.events")}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex items-center gap-2 rounded-md border border-border bg-surface-secondary px-3 py-2.5 text-sm font-medium text-foreground">
              <Checkbox checked={allEvents} onChange={(event) => toggleAll(event.target.checked)} />{t("webhooks.eventsAll")}
            </label>
            {WEBHOOK_EVENTS.map((event) => (
              <label key={event} className="flex items-center gap-2 rounded-md border border-border bg-surface-secondary px-3 py-2.5 font-mono text-xs text-secondary-foreground">
                <Checkbox checked={allEvents || events.includes(event)} disabled={allEvents} onChange={(change) => toggleEvent(event, change.target.checked)} />{event}
              </label>
            ))}
          </div>
        </fieldset>
      </form>
    </Dialog>
  );
}

function SecretDialog({ name, secret, onClose }: { name: string; secret: string; onClose: () => void }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()} title={t("webhooks.secretTitle")} footer={<Button onClick={onClose}>{t("common.close")}</Button>}>
      <Alert variant="warning" title={name}>{t("webhooks.secretWarning")}</Alert>
      <Field className="mt-4" label={t("webhooks.secretLabel")}>
        <div className="flex items-center gap-2">
          <Input readOnly value={secret} className="font-mono text-xs" onFocus={(event) => event.target.select()} />
          <Button variant="outline" size="icon" aria-label={t("common.copyToClipboard")} title={t("common.copyToClipboard")} onClick={() => { void navigator.clipboard.writeText(secret); toast({ tone: "success", title: t("webhooks.secretCopied") }); }}><Copy /></Button>
        </div>
      </Field>
    </Dialog>
  );
}

function DeliveriesDialog({ webhook, onClose }: { webhook: WebhookDto; onClose: () => void }) {
  const { t } = useTranslation();
  const { organization } = useWorkspace();
  const { formatDateTime } = useLocaleFormatter();
  const deliveries = useQuery({ queryKey: ["webhook-deliveries", organization.id, webhook.id], queryFn: () => webhooksApi.deliveries(organization.id, webhook.id) });
  const items = deliveries.data?.deliveries ?? [];

  const statusBadge = (delivery: WebhookDeliveryDto) => {
    if (delivery.status === "SUCCESS") return <Badge variant="success">{t("webhooks.deliverySuccess")}</Badge>;
    if (delivery.status === "FAILED") return <Badge variant="danger">{t("webhooks.deliveryFailed")}</Badge>;
    return <Badge variant="neutral">{t("webhooks.deliveryPending")}</Badge>;
  };

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()} size="xl" title={t("webhooks.deliveriesTitle", { name: webhook.name })} footer={<Button variant="ghost" onClick={onClose}>{t("common.close")}</Button>}>
      {deliveries.isPending ? <div className="space-y-2">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-10 w-full" />)}</div> : null}
      {deliveries.isError ? <Alert variant="danger" title={t("webhooks.loadingError")}>{apiErrorText(deliveries.error, t)}</Alert> : null}
      {deliveries.data && items.length === 0 ? <p className="py-4 text-center text-sm text-muted-foreground">{t("webhooks.deliveriesEmpty")}</p> : null}
      {items.length > 0 ? (
        <div className="overflow-x-auto rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("webhooks.deliveryEvent")}</TableHead>
                <TableHead>{t("webhooks.deliveryStatus")}</TableHead>
                <TableHead>{t("webhooks.deliveryResponse")}</TableHead>
                <TableHead>{t("webhooks.deliveryAttemptedAt")}</TableHead>
                <TableHead className="hidden lg:table-cell">{t("webhooks.deliveryError")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((delivery) => (
                <TableRow key={delivery.id}>
                  <TableCell className="font-mono text-xs text-foreground">{delivery.event}</TableCell>
                  <TableCell>{statusBadge(delivery)}</TableCell>
                  <TableCell className="font-mono text-xs">{delivery.responseCode ?? "—"}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{formatDateTime(delivery.attemptedAt)}</TableCell>
                  <TableCell className="hidden max-w-56 truncate text-xs text-muted-foreground lg:table-cell" title={delivery.error ?? undefined}>{delivery.error ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
    </Dialog>
  );
}
