import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InvitationDto, RoleName } from "@nexora/contracts";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Check, Copy, Link2 } from "lucide-react";
import { useWorkspace } from "../components/layout/app-layout";
import { Alert, Badge, Button, Field, Input, Page, PageHeader, Select, Skeleton, Table, TableBody, TableCell, TableContainer, TableHead, TableHeader, TableRow, useConfirm } from "../components/ui";
import { ApiClientError, invitationsApi, usersApi, type OrganizationUser } from "../lib/api";
import { apiErrorText } from "../lib/api-error";
import { useLocaleFormatter } from "../lib/format";

const ROLE_OPTIONS: RoleName[] = ["Member", "Editor", "Manager", "Admin", "Viewer"];
const MEMBER_ONLY_OPTIONS: RoleName[] = ["Member"];

export function AdminUsersPage() {
  const { t } = useTranslation();
  const { formatDate } = useLocaleFormatter();
  const { organization } = useWorkspace();
  const queryClient = useQueryClient();
  const { confirm, confirmDialog } = useConfirm();
  const [formMode, setFormMode] = useState<"invite" | "create" | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<RoleName>("Member");
  const [jobTitle, setJobTitle] = useState("");
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // The API requires roles.manage to assign any role other than Member.
  const roleOptions = organization.permissions.includes("roles.manage") ? ROLE_OPTIONS : MEMBER_ONLY_OPTIONS;

  const usersQuery = useQuery({
    queryKey: ["admin-users", organization.id],
    queryFn: () => usersApi.list(organization.id)
  });

  const invitationsQuery = useQuery({
    queryKey: ["admin-invitations", organization.id],
    queryFn: () => invitationsApi.list(organization.id)
  });

  const inviteMutation = useMutation({
    mutationFn: () => invitationsApi.create(organization.id, { email, role }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["admin-invitations", organization.id] });
      setLastInviteUrl(result.inviteUrl);
      setEmail(""); setRole("Member");
      if (result.emailSent) {
        setFormMode(null);
      }
    }
  });

  const revokeMutation = useMutation({
    mutationFn: (invitationId: string) => invitationsApi.revoke(organization.id, invitationId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-invitations", organization.id] })
  });

  const createMutation = useMutation({
    mutationFn: () => usersApi.create(organization.id, { name, email, password, role, jobTitle: jobTitle || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users", organization.id] });
      setFormMode(null);
      setName(""); setEmail(""); setPassword(""); setRole("Member"); setJobTitle("");
    }
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ userId, memberStatus }: { userId: string; memberStatus: "ACTIVE" | "SUSPENDED" }) =>
      usersApi.update(organization.id, userId, { memberStatus }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-users", organization.id] })
  });

  const users: OrganizationUser[] = usersQuery.data ?? [];
  const invitations: InvitationDto[] = invitationsQuery.data ?? [];

  function handleInvite(e: FormEvent) {
    e.preventDefault();
    setLastInviteUrl(null);
    inviteMutation.mutate();
  }

  function handleCreate(e: FormEvent) {
    e.preventDefault();
    createMutation.mutate();
  }

  function errorText(error: unknown): string {
    if (error instanceof ApiClientError) {
      if (error.fields?.password) return t("auth.register.passwordHint");
      if (error.fields) return Object.values(error.fields).flat().join(" · ");
    }
    return apiErrorText(error, t);
  }

  async function copyInviteUrl() {
    if (!lastInviteUrl) return;
    await navigator.clipboard.writeText(lastInviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Page>
      <PageHeader
        eyebrow={t("navigation.admin")}
        title={t("admin.usersTitle")}
        description={t("admin.usersDesc")}
        actions={<Button onClick={() => setFormMode(formMode === "invite" ? null : "invite")}>{t("admin.inviteUser")}</Button>}
      />

      {formMode === "invite" ? (
        <form onSubmit={handleInvite} className="space-y-4 rounded-lg border border-border bg-surface p-5 shadow-sm">
          <p className="text-sm text-muted-foreground">{t("admin.inviteDesc")}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("auth.login.email")} htmlFor="invite-email"><Input id="invite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
            <Field label={t("admin.role")} htmlFor="invite-role">
              <Select id="invite-role" value={role} onChange={(e) => setRole(e.target.value as RoleName)}>
                {roleOptions.map((r) => <option key={r}>{r}</option>)}
              </Select>
            </Field>
          </div>
          {inviteMutation.isError ? (
            <Alert variant="danger" title={t("admin.errorInvitingUser")}>
              {errorText(inviteMutation.error)}
            </Alert>
          ) : null}
          {lastInviteUrl ? (
            <Alert variant="success">
              <div className="flex flex-col gap-2">
                <span>{t("admin.inviteCreatedNoEmail")}</span>
                <div className="flex items-center gap-2">
                  <code className="flex-1 truncate rounded bg-surface px-2 py-1 text-xs"><Link2 className="mr-1 inline h-3 w-3" />{lastInviteUrl}</code>
                  <Button type="button" size="sm" variant="outline" onClick={copyInviteUrl}>
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {copied ? t("common.copied") : t("common.copy")}
                  </Button>
                </div>
              </div>
            </Alert>
          ) : null}
          <div className="flex items-center gap-2">
            <Button type="submit" loading={inviteMutation.isPending}>{t("admin.sendInvite")}</Button>
            <Button type="button" variant="outline" onClick={() => setFormMode(null)}>{t("common.cancel")}</Button>
            <button type="button" className="ml-auto text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline" onClick={() => setFormMode("create")}>
              {t("admin.createDirectly")}
            </button>
          </div>
        </form>
      ) : null}

      {formMode === "create" ? (
        <form onSubmit={handleCreate} className="space-y-4 rounded-lg border border-border bg-surface p-5 shadow-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("common.name")} htmlFor="user-name"><Input id="user-name" value={name} onChange={(e) => setName(e.target.value)} required /></Field>
            <Field label={t("auth.login.email")} htmlFor="user-email"><Input id="user-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
            <Field label={t("auth.login.password")} htmlFor="user-password" helper={t("auth.register.passwordHint")}><Input id="user-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={12} /></Field>
            <Field label={t("admin.role")} htmlFor="user-role">
              <Select id="user-role" value={role} onChange={(e) => setRole(e.target.value as RoleName)}>
                {roleOptions.map((r) => <option key={r}>{r}</option>)}
              </Select>
            </Field>
            <Field label={t("settings.userJobTitle")} htmlFor="user-jobtitle"><Input id="user-jobtitle" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} /></Field>
          </div>
          {createMutation.isError ? (
            <Alert variant="danger" title={t("admin.errorCreatingUser")}>
              {errorText(createMutation.error)}
            </Alert>
          ) : null}
          <div className="flex gap-2">
            <Button type="submit" loading={createMutation.isPending}>{t("common.create")}</Button>
            <Button type="button" variant="outline" onClick={() => setFormMode(null)}>{t("common.cancel")}</Button>
          </div>
        </form>
      ) : null}

      {invitations.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-foreground">{t("admin.pendingInvitations")}</h2>
          <TableContainer>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("auth.login.email")}</TableHead>
                  <TableHead>{t("admin.role")}</TableHead>
                  <TableHead>{t("admin.invitedBy")}</TableHead>
                  <TableHead>{t("admin.inviteExpires")}</TableHead>
                  <TableHead>{t("common.status")}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitations.map((invitation) => (
                  <TableRow key={invitation.id}>
                    <TableCell className="font-medium text-foreground">{invitation.email}</TableCell>
                    <TableCell><Badge variant="primary">{invitation.role}</Badge></TableCell>
                    <TableCell>{invitation.invitedByName}</TableCell>
                    <TableCell>{formatDate(invitation.expiresAt)}</TableCell>
                    <TableCell>
                      <Badge variant={invitation.status === "PENDING" ? "warning" : "neutral"}>{t(`admin.invitationStatus.${invitation.status}`)}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {invitation.status === "PENDING" ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-danger hover:bg-danger-subtle hover:text-danger"
                          onClick={async () => {
                            if (await confirm(t("admin.confirmRevokeInvite"))) {
                              revokeMutation.mutate(invitation.id);
                            }
                          }}
                        >
                          {t("admin.revokeInvite")}
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </section>
      ) : null}

      {usersQuery.isPending ? (
        <TableContainer>
          <Table>
            <TableHeader><TableRow><TableHead>{t("common.name")}</TableHead><TableHead>{t("auth.login.email")}</TableHead><TableHead>{t("admin.roles")}</TableHead><TableHead>{t("common.status")}</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                  <TableCell />
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      ) : null}

      {usersQuery.data ? (
        <TableContainer>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("common.name")}</TableHead>
                <TableHead>{t("auth.login.email")}</TableHead>
                <TableHead>{t("admin.roles")}</TableHead>
                <TableHead>{t("common.status")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.memberId}>
                  <TableCell className="font-medium text-foreground">{u.name}</TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {u.roles.map((r) => <Badge key={r} variant="primary">{r}</Badge>)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={u.memberStatus === "ACTIVE" ? "success" : "danger"}>{u.memberStatus}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {u.memberStatus === "ACTIVE" ? (
                      <Button variant="ghost" size="sm" className="text-danger hover:bg-danger-subtle hover:text-danger" onClick={() => updateStatusMutation.mutate({ userId: u.id, memberStatus: "SUSPENDED" })}>
                        {t("admin.suspend")}
                      </Button>
                    ) : (
                      <Button variant="ghost" size="sm" className="text-success hover:bg-success-subtle hover:text-success" onClick={() => updateStatusMutation.mutate({ userId: u.id, memberStatus: "ACTIVE" })}>
                        {t("admin.reactivate")}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      ) : null}
      {confirmDialog}
    </Page>
  );
}
