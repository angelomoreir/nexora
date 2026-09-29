import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TeamDto } from "@nexora/contracts";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useWorkspace } from "../components/layout/app-layout";
import { Alert, Badge, Button, EmptyState, Field, Input, Page, PageHeader, Select, Skeleton, useConfirm } from "../components/ui";
import { teamsApi, usersApi, type OrganizationUser } from "../lib/api";
import { apiErrorText } from "../lib/api-error";

export function AdminTeamsPage() {
  const { t } = useTranslation();
  const { confirm, confirmDialog } = useConfirm();
  const { organization } = useWorkspace();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [addMemberId, setAddMemberId] = useState("");

  const teamsQuery = useQuery({
    queryKey: ["admin-teams", organization.id],
    queryFn: () => teamsApi.list(organization.id)
  });

  const teamDetailQuery = useQuery({
    queryKey: ["admin-team-detail", organization.id, selectedTeam],
    queryFn: () => teamsApi.get(organization.id, selectedTeam!),
    enabled: !!selectedTeam
  });

  const usersQuery = useQuery({
    queryKey: ["admin-users-for-teams", organization.id],
    queryFn: () => usersApi.list(organization.id)
  });

  const createMutation = useMutation({
    mutationFn: () => teamsApi.create(organization.id, { name, description: description || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-teams", organization.id] });
      setShowCreate(false); setName(""); setDescription("");
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (teamId: string) => teamsApi.delete(organization.id, teamId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-teams", organization.id] });
      setSelectedTeam(null);
    }
  });

  const addMemberMutation = useMutation({
    mutationFn: () => teamsApi.addMember(organization.id, selectedTeam!, addMemberId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-team-detail", organization.id, selectedTeam] });
      setAddMemberId("");
    }
  });

  const removeMemberMutation = useMutation({
    mutationFn: (membershipId: string) => teamsApi.removeMember(organization.id, selectedTeam!, membershipId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-team-detail", organization.id, selectedTeam] })
  });

  const teams: TeamDto[] = teamsQuery.data ?? [];
  const members: OrganizationUser[] = usersQuery.data ?? [];
  const detail = teamDetailQuery.data;

  function handleSubmit(e: FormEvent) { e.preventDefault(); createMutation.mutate(); }

  return (
    <Page>
      <PageHeader eyebrow={t("navigation.admin")} title={t("admin.teamsTitle")} description={t("admin.teamsDescription")} actions={<Button onClick={() => setShowCreate(!showCreate)}>{t("admin.createTeam")}</Button>} />

      {showCreate ? (
        <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-border bg-surface p-5 shadow-sm">
          <Field label={t("common.name")} htmlFor="team-name"><Input id="team-name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} /></Field>
          <Field label={t("common.description")} htmlFor="team-description"><Input id="team-description" value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
          <div className="flex gap-2">
            <Button type="submit" disabled={createMutation.isPending}>{t("common.create")}</Button>
            <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>{t("common.cancel")}</Button>
          </div>
        </form>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          {teamsQuery.isPending ? (
            Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)
          ) : null}
          {teamsQuery.isError ? <Alert variant="danger" title={t("common.error")}>{apiErrorText(teamsQuery.error, t)}</Alert> : null}
          {teamsQuery.data && teams.length === 0 ? (
            <EmptyState title={t("admin.noTeams")} description={t("admin.noTeamsDesc")} action={<Button onClick={() => setShowCreate(true)}>{t("admin.createTeam")}</Button>} />
          ) : null}
          {teams.map((team) => (
            <button
              key={team.id}
              className={`flex w-full items-center justify-between rounded-lg border p-3 text-left transition-colors nx-focus-ring ${selectedTeam === team.id ? "border-primary bg-primary-subtle" : "border-border bg-surface hover:border-border-strong"}`}
              onClick={() => setSelectedTeam(team.id)}
            >
              <div className="min-w-0">
                <p className="font-medium text-foreground">{team.name}</p>
                {team.description ? <p className="text-sm text-secondary-foreground">{team.description}</p> : null}
              </div>
              <Badge variant="neutral">{t("admin.membersCount", { count: team.memberCount })}</Badge>
            </button>
          ))}
        </div>

        <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
          {teamDetailQuery.isPending ? <Skeleton className="h-48 w-full" /> : null}
          {detail ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="nx-h3 text-foreground">{detail.name}</h2>
                <Button variant="ghost" size="sm" className="text-danger hover:bg-danger-subtle hover:text-danger" onClick={async () => { if (await confirm(t("admin.deleteTeamConfirm", { name: detail.name }))) deleteMutation.mutate(detail.id); }}>{t("common.delete")}</Button>
              </div>
              <div>
                <h3 className="nx-label mb-2 uppercase text-muted-foreground">{t("admin.membersCount", { count: detail.members.length })}</h3>
                <div className="space-y-1">
                  {detail.members.map((m) => (
                    <div key={m.id} className="flex items-center justify-between rounded-md bg-surface-secondary px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">{m.name}</p>
                        <p className="text-xs text-muted-foreground">{m.email}</p>
                      </div>
                      <Button variant="ghost" size="sm" className="text-danger hover:bg-danger-subtle hover:text-danger" onClick={() => removeMemberMutation.mutate(m.id)}>{t("common.remove")}</Button>
                    </div>
                  ))}
                  {detail.members.length === 0 ? <p className="text-sm text-muted-foreground">{t("admin.noMembers")}</p> : null}
                </div>
              </div>
              <div className="border-t border-border pt-3">
                <h3 className="nx-label mb-2 uppercase text-muted-foreground">{t("admin.addMember")}</h3>
                <div className="flex gap-2">
                  <Select className="flex-1" value={addMemberId} onChange={(e) => setAddMemberId(e.target.value)}>
                    <option value="">{t("common.select")}</option>
                    {members.filter((m) => m.memberStatus === "ACTIVE").map((m) => (
                      <option key={m.memberId} value={m.memberId}>{m.name} ({m.email})</option>
                    ))}
                  </Select>
                  <Button size="sm" disabled={!addMemberId} onClick={() => addMemberMutation.mutate()}>{t("common.add")}</Button>
                </div>
              </div>
            </div>
          ) : !teamDetailQuery.isPending ? (
            <p className="grid min-h-48 place-items-center text-sm text-muted-foreground">{t("admin.selectTeam")}</p>
          ) : null}
        </div>
      </div>
      {confirmDialog}
    </Page>
  );
}
