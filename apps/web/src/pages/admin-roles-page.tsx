import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PermissionDto, RoleDto } from "@nexora/contracts";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useWorkspace } from "../components/layout/app-layout";
import { Alert, Badge, Button, EmptyState, Field, Input, Page, PageHeader, Skeleton, useConfirm } from "../components/ui";
import { rolesApi } from "../lib/api";
import { apiErrorText } from "../lib/api-error";

export function AdminRolesPage() {
  const { t } = useTranslation();
  const { confirm, confirmDialog } = useConfirm();
  const { organization } = useWorkspace();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [selectedPerms, setSelectedPerms] = useState<Set<string>>(new Set());

  const rolesQuery = useQuery({
    queryKey: ["admin-roles", organization.id],
    queryFn: () => rolesApi.list(organization.id)
  });

  const permsQuery = useQuery({
    queryKey: ["admin-permissions", organization.id],
    queryFn: () => rolesApi.listPermissions(organization.id)
  });

  const createMutation = useMutation({
    mutationFn: () => rolesApi.create(organization.id, { name, description: description || undefined, permissionKeys: [...selectedPerms] }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-roles", organization.id] });
      setShowCreate(false); setName(""); setDescription(""); setSelectedPerms(new Set());
    }
  });

  const updatePermsMutation = useMutation({
    mutationFn: ({ roleId, permKeys }: { roleId: string; permKeys: string[] }) =>
      rolesApi.update(organization.id, roleId, { permissionKeys: permKeys }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-roles", organization.id] })
  });

  const deleteMutation = useMutation({
    mutationFn: (roleId: string) => rolesApi.delete(organization.id, roleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-roles", organization.id] });
      setSelectedRole(null);
    }
  });

  const roles: RoleDto[] = rolesQuery.data ?? [];
  const allPerms: PermissionDto[] = permsQuery.data ?? [];
  const activeRole = roles.find((r) => r.id === selectedRole);

  function togglePerm(key: string) {
    const next = new Set(selectedPerms);
    if (next.has(key)) next.delete(key); else next.add(key);
    setSelectedPerms(next);
  }

  function handleSubmit(e: FormEvent) { e.preventDefault(); createMutation.mutate(); }

  function saveRolePerms(role: RoleDto) {
    const currentKeys = new Set(role.permissions.map((p) => p.key));
    if (selectedPerms.size === 0 && role.permissions.length === 0) return;
    const keysToSave = selectedPerms.size > 0 ? [...selectedPerms] : [...currentKeys];
    updatePermsMutation.mutate({ roleId: role.id, permKeys: keysToSave });
  }

  return (
    <Page>
      <PageHeader eyebrow={t("navigation.admin")} title={t("admin.rolesTitle")} description={t("admin.rolesDesc")} actions={<Button onClick={() => setShowCreate(!showCreate)}>{t("admin.newRole")}</Button>} />

      {showCreate ? (
        <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-border bg-surface p-5 shadow-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("common.name")} htmlFor="role-name"><Input id="role-name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} /></Field>
            <Field label={t("common.description")} htmlFor="role-description"><Input id="role-description" value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
          </div>
          <div>
            <h3 className="nx-label mb-2 uppercase text-muted-foreground">{t("admin.roles")}</h3>
            <div className="flex flex-wrap gap-2">
              {allPerms.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors nx-focus-ring ${selectedPerms.has(p.key) ? "bg-primary text-primary-foreground" : "bg-surface-secondary text-secondary-foreground hover:bg-surface-secondary/70"}`}
                  onClick={() => togglePerm(p.key)}
                >
                  {p.key}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={createMutation.isPending}>{t("common.create")}</Button>
            <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>{t("common.cancel")}</Button>
          </div>
        </form>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          {rolesQuery.isPending ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />) : null}
          {rolesQuery.isError ? <Alert variant="danger" title={t("common.error")}>{apiErrorText(rolesQuery.error, t)}</Alert> : null}
          {rolesQuery.data && roles.length === 0 ? <EmptyState title={t("admin.noRoles")} description={t("admin.noRolesDesc")} action={<Button onClick={() => setShowCreate(true)}>{t("admin.newRole")}</Button>} /> : null}
          {roles.map((r) => (
            <button
              key={r.id}
              className={`w-full rounded-lg border p-3 text-left transition-colors nx-focus-ring ${selectedRole === r.id ? "border-primary bg-primary-subtle" : "border-border bg-surface hover:border-border-strong"}`}
              onClick={() => { setSelectedRole(r.id); setSelectedPerms(new Set(r.permissions.map((p) => p.key))); }}
            >
              <div className="flex items-center justify-between">
                <p className="font-medium text-foreground">{r.name}</p>
                {r.isSystem ? <Badge variant="warning">{t("dashboard.system")}</Badge> : null}
              </div>
              {r.description ? <p className="text-sm text-secondary-foreground">{r.description}</p> : null}
              <p className="mt-1 text-xs text-muted-foreground">{r.permissions.length} ${t("admin.permissionsCount", { count: r.permissions.length })}</p>
            </button>
          ))}
        </div>

        <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
          {activeRole ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="nx-h3 text-foreground">{activeRole.name}</h2>
                {!activeRole.isSystem ? (
                  <Button variant="ghost" size="sm" className="text-danger hover:bg-danger-subtle hover:text-danger" onClick={async () => { if (await confirm(t("admin.deleteRoleConfirm", { name: activeRole.name }))) deleteMutation.mutate(activeRole.id); }}>{t("common.delete")}</Button>
                ) : null}
              </div>
              <div>
                <h3 className="nx-label mb-2 uppercase text-muted-foreground">{t("admin.permissionsCount", { count: selectedPerms.size })}</h3>
                <div className="flex flex-wrap gap-2">
                  {allPerms.map((p) => (
                    <button
                      key={p.key}
                      className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors nx-focus-ring ${selectedPerms.has(p.key) ? "bg-primary text-primary-foreground" : "bg-surface-secondary text-secondary-foreground hover:bg-surface-secondary/70"}`}
                      onClick={() => togglePerm(p.key)}
                      disabled={activeRole.isSystem}
                    >
                      {p.key}
                    </button>
                  ))}
                </div>
                {activeRole.isSystem ? <Alert variant="warning" className="mt-2">{t("admin.systemRoleCannotEdit")}</Alert> : null}
              </div>
              {!activeRole.isSystem ? (
                <Button size="sm" disabled={updatePermsMutation.isPending} onClick={() => saveRolePerms(activeRole)}>
                  {t("admin.savePermissions")}
                </Button>
              ) : null}
            </div>
          ) : (
            <p className="grid min-h-48 place-items-center text-sm text-muted-foreground">{t("admin.selectRole")}</p>
          )}
        </div>
      </div>
      {confirmDialog}
    </Page>
  );
}
