import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AccessEntryDto, AccessRequestDto, DocumentAccess } from "@nexora/contracts";
import { Check, Crown, KeyRound, Link2, Minus, Share2, User, Users } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useWorkspace } from "../layout/app-layout";
import { Alert, Avatar, Badge, Button, Dialog, Select, Skeleton, Switch, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, useToast } from "../ui";
import { accessApi, type FileManagerItem } from "../../lib/api";
import { apiErrorText } from "../../lib/api-error";
import { useLocaleFormatter } from "../../lib/format";

const CAPABILITIES: DocumentAccess[] = ["view", "edit", "delete", "share"];
const SOURCE_ICONS = { owner: Crown, user: User, team: Users, link: Link2 } as const;

export function ManageAccessDialog({ item, onClose, onShare }: { item: FileManagerItem; onClose: () => void; onShare?: () => void }) {
  const { t } = useTranslation();
  const { organization } = useWorkspace();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { formatDateTime } = useLocaleFormatter();

  const panelKey = ["access-panel", organization.id, item.kind, item.id];
  const requestsKey = ["access-requests", organization.id];
  const panel = useQuery({ queryKey: panelKey, queryFn: () => accessApi.panel(organization.id, item.kind, item.id) });
  const requests = useQuery({ queryKey: requestsKey, queryFn: () => accessApi.listRequests(organization.id, "PENDING") });
  const pendingForItem = (requests.data?.requests ?? []).filter((request) => request.resourceId === item.id && request.resourceType === item.kind);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: panelKey });
    await queryClient.invalidateQueries({ queryKey: requestsKey });
  };
  const setInherit = useMutation({
    mutationFn: (inherit: boolean) => accessApi.setInherit(organization.id, item.kind, item.id, inherit),
    onSuccess: async () => { await refresh(); toast({ tone: "success", title: t("access.inheritUpdated") }); },
    onError: (error: Error) => toast({ tone: "danger", title: t("access.errorInherit"), description: apiErrorText(error, t) })
  });

  const sourceLabel = (source: AccessEntryDto["source"]) => ({ owner: t("access.sourceOwner"), user: t("access.sourceUser"), team: t("access.sourceTeam"), link: t("access.sourceLink") })[source];
  const capabilityLabel = (capability: DocumentAccess) => ({ view: t("access.capabilityView"), edit: t("access.capabilityEdit"), delete: t("access.capabilityDelete"), share: t("access.capabilityShare") })[capability];

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()} size="lg" title={t("access.dialogTitle", { name: item.name })} description={t("access.dialogDesc")}
      footer={<><Button variant="ghost" onClick={onClose}>{t("common.close")}</Button>{onShare ? <Button variant="outline" onClick={onShare}><Share2 />{t("access.openShare")}</Button> : null}</>}>
      {panel.isPending ? <div className="space-y-2">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-10 w-full" />)}</div> : null}
      {panel.isError ? <Alert variant="danger" title={t("access.errorLoading")}>{apiErrorText(panel.error, t)}</Alert> : null}
      {panel.data ? (
        <div className="space-y-6">
          <div className="flex items-start justify-between gap-4 rounded-md border border-border bg-surface-secondary p-3.5">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">{t("access.inherit")}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{t("access.inheritHint")}</p>
              {!panel.data.inheritsPermissions ? <p className="mt-1.5 text-xs font-medium text-warning">{t("access.inheritOffWarning")}</p> : null}
            </div>
            <Switch checked={panel.data.inheritsPermissions} disabled={setInherit.isPending} onCheckedChange={(checked) => setInherit.mutate(checked)} label={t("access.inherit")} />
          </div>

          <div>
            <p className="nx-label mb-2">{t("access.whoHasAccess")}</p>
            <div className="overflow-x-auto rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("common.name")}</TableHead>
                    <TableHead>{t("access.source")}</TableHead>
                    {CAPABILITIES.map((capability) => <TableHead key={capability} className="text-center">{capabilityLabel(capability)}</TableHead>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {panel.data.entries.map((entry, index) => {
                    const SourceIcon = SOURCE_ICONS[entry.source];
                    return (
                      <TableRow key={`${entry.source}-${entry.membershipId ?? entry.teamId ?? index}`}>
                        <TableCell>
                          <span className="flex items-center gap-2">
                            {entry.source === "user" || entry.source === "owner" ? <Avatar name={entry.name} size="sm" /> : <SourceIcon className="size-4 text-muted-foreground" />}
                            <span className="max-w-56 truncate font-medium text-foreground">{entry.source === "link" ? t("access.publicLink") : entry.name}</span>
                          </span>
                        </TableCell>
                        <TableCell><Badge variant={entry.source === "owner" ? "primary" : "outline"}>{sourceLabel(entry.source)}</Badge></TableCell>
                        {CAPABILITIES.map((capability) => (
                          <TableCell key={capability} className="text-center">
                            {entry.access[capability] ? <Check className="mx-auto size-4 text-success" aria-label={capabilityLabel(capability)} /> : <Minus className="mx-auto size-4 text-muted-foreground/50" aria-hidden="true" />}
                          </TableCell>
                        ))}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            {panel.data.linksCount > 0 ? <p className="mt-2 text-xs text-muted-foreground">{t("access.linksCount", { count: panel.data.linksCount })}</p> : null}
          </div>

          <div>
            <p className="nx-label mb-2">{t("access.requests")}</p>
            {requests.isPending ? <Skeleton className="h-14 w-full" /> : null}
            {requests.data && pendingForItem.length === 0 ? <p className="text-sm text-muted-foreground">{t("access.requestsEmpty")}</p> : null}
            <ul className="space-y-2">
              {pendingForItem.map((request) => (
                <AccessRequestRow key={request.id} request={request} formatDateTime={formatDateTime} onDecided={refresh} />
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}

export function AccessRequestRow({ request, formatDateTime, onDecided }: { request: AccessRequestDto; formatDateTime: (value: string | Date) => string; onDecided: () => Promise<void> | void }) {
  const { t } = useTranslation();
  const { organization } = useWorkspace();
  const { toast } = useToast();
  const [access, setAccess] = useState<"view" | "edit">("view");
  const decide = useMutation({
    mutationFn: (approve: boolean) => accessApi.decide(organization.id, request.id, { approve, access: approve ? access : undefined }),
    onSuccess: async () => { await onDecided(); toast({ tone: "success", title: t("access.decided") }); },
    onError: (error: Error) => toast({ tone: "danger", title: t("access.errorDecide"), description: apiErrorText(error, t) })
  });
  return (
    <li className="flex flex-col gap-3 rounded-md border border-border bg-surface px-3 py-2.5 sm:flex-row sm:items-center">
      <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary-subtle text-primary"><KeyRound className="size-4" /></span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">{t("access.requestedBy", { name: request.requester?.name ?? "—" })}</span>
        <span className="block text-xs text-muted-foreground">{request.requester?.email ?? ""}{request.requester?.email ? " · " : ""}{formatDateTime(request.createdAt)}</span>
        {request.message ? <span className="mt-1 block break-words text-xs text-secondary-foreground">{request.message}</span> : null}
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <Select aria-label={t("access.accessLevel")} className="w-32" value={access} onChange={(event) => setAccess(event.target.value as "view" | "edit")}>
          <option value="view">{t("documents.readAccess")}</option>
          <option value="edit">{t("documents.editAccess")}</option>
        </Select>
        <Button size="sm" loading={decide.isPending && decide.variables === true} disabled={decide.isPending} onClick={() => decide.mutate(true)}>{t("access.approve")}</Button>
        <Button size="sm" variant="ghost" className="text-danger hover:bg-danger-subtle hover:text-danger" loading={decide.isPending && decide.variables === false} disabled={decide.isPending} onClick={() => decide.mutate(false)}>{t("access.reject")}</Button>
      </span>
    </li>
  );
}
