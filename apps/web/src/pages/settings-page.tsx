import type { RoleName } from "@nexora/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, UsersRound } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Avatar, useWorkspace } from "../components/layout/app-layout";
import { Alert, Badge, Button, EmptyState, Field, Input, Page, PageHeader, Select, Skeleton, useConfirm } from "../components/ui";
import { ContextualHelpButton } from "../components/help/contextual-help-button";
import { usersApi } from "../lib/api";
import { apiErrorText } from "../lib/api-error";

const roles: RoleName[] = ["Admin", "Manager", "Editor", "Member", "Viewer"];

export function SettingsPage() {
  const { t } = useTranslation();
  const { confirm, confirmDialog } = useConfirm();
  const { organization, session } = useWorkspace();
  const queryClient = useQueryClient();
  const queryKey = ["organization-users", organization.id];
  const users = useQuery({ queryKey, queryFn: () => usersApi.list(organization.id), retry: false });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", jobTitle: "", role: "Member" as RoleName });
  const create = useMutation({
    mutationFn: () => usersApi.create(organization.id, form),
    onSuccess: async () => {
      setForm({ name: "", email: "", password: "", jobTitle: "", role: "Member" });
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey });
    }
  });
  const remove = useMutation({
    mutationFn: (userId: string) => usersApi.remove(organization.id, userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey })
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    create.mutate();
  }

  return (
    <Page>
      <PageHeader eyebrow={organization.name} title={t("settings.title")} description={t("settings.description", { name: organization.name })} actions={<><ContextualHelpButton route="/settings" showLabel /><Button onClick={() => setOpen(!open)}><Plus className="size-4" />{t("admin.addUser")}</Button></>} />

      {open && (
        <form className="grid gap-4 rounded-lg border border-border bg-surface p-5 shadow-sm md:grid-cols-2" onSubmit={submit}>
          <Field label={t("common.name")} htmlFor="new-name"><Input id="new-name" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
          <Field label={t("auth.login.email")} htmlFor="new-email"><Input id="new-email" type="email" required value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></Field>
          <Field label={t("settings.userJobTitle")} htmlFor="new-title"><Input id="new-title" value={form.jobTitle} onChange={(event) => setForm({ ...form, jobTitle: event.target.value })} /></Field>
          <Field label={t("admin.role")} htmlFor="new-role">
            <Select id="new-role" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as RoleName })}>{roles.map((role) => <option key={role}>{role}</option>)}</Select>
          </Field>
          <div className="md:col-span-2">
            <Field label={t("settings.userPassword")} htmlFor="new-password"><Input id="new-password" type="password" minLength={12} required value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></Field>
          </div>
          {create.error ? <Alert variant="danger" className="md:col-span-2">{apiErrorText(create.error, t)}</Alert> : null}
          <div className="md:col-span-2"><Button disabled={create.isPending} type="submit">{t("admin.createUser")}</Button></div>
        </form>
      )}

      <section className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
        <div className="flex items-center gap-3 border-b border-border px-5 py-4"><UsersRound className="size-5 text-primary" /><h2 className="nx-h3 text-foreground">{t("admin.users")}</h2></div>
        {users.isPending ? <div className="space-y-3 p-5">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div> : null}
        {users.error ? <div className="p-5"><Alert variant="danger">{apiErrorText(users.error, t)}</Alert></div> : null}
        {users.data && users.data.length === 0 ? <EmptyState title={t("settings.noUsers")} description={t("admin.noUsersDesc")} /> : null}
        {users.data?.map((user) => (
          <div key={user.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4 last:border-0">
            <div className="flex items-center gap-3">
              <Avatar name={user.name} avatar={user.avatar} />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{user.name}</p>
                <p className="text-xs text-muted-foreground">{user.email}{user.jobTitle ? ` · ${user.jobTitle}` : ""}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="primary">{user.roles.join(", ")}</Badge>
              {user.id !== session.user.id ? (
                <Button variant="ghost" size="icon-sm" aria-label={t("settings.removeUser", { name: user.name })} className="text-muted-foreground hover:bg-danger-subtle hover:text-danger" onClick={async () => { if (await confirm(t("admin.removeUserConfirm", { name: user.name }))) remove.mutate(user.id); }}>
                  <Trash2 className="size-4" />
                </Button>
              ) : null}
            </div>
          </div>
        ))}
      </section>
      {confirmDialog}
    </Page>
  );
}
