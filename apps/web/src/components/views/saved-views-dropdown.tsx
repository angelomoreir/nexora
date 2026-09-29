import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SavedViewConfig, SavedViewDto, SavedViewResourceType } from "@nexora/contracts";
import { Bookmark, Pencil, Trash2, User, Users } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useWorkspace } from "../layout/app-layout";
import { viewsApi } from "../../lib/api";
import { apiErrorText } from "../../lib/api-error";
import { Button, Checkbox, Dialog, Dropdown, DropdownSeparator, Field, Input, useConfirm, useToast } from "../ui";

interface SavedViewsDropdownProps {
  resourceType: SavedViewResourceType;
  resourceId?: string | null;
  getConfig: () => SavedViewConfig;
  applyConfig: (config: SavedViewConfig) => void;
}

export function SavedViewsDropdown({ resourceType, resourceId = null, getConfig, applyConfig }: SavedViewsDropdownProps) {
  const { t } = useTranslation();
  const { organization } = useWorkspace();
  const { toast } = useToast();
  const { confirm, confirmDialog } = useConfirm();
  const queryClient = useQueryClient();
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState("");
  const [isShared, setIsShared] = useState(false);
  const [renaming, setRenaming] = useState<SavedViewDto | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const queryKey = ["saved-views", organization.id, resourceType, resourceId];
  const viewsQuery = useQuery({
    queryKey,
    queryFn: () => viewsApi.list(organization.id, { resourceType, resourceId })
  });
  const views = viewsQuery.data?.views ?? [];

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["saved-views", organization.id] });
  const onError = (title: string) => (error: Error) => toast({ tone: "danger", title, description: apiErrorText(error, t) });

  const saveMutation = useMutation({
    mutationFn: () => viewsApi.create(organization.id, { resourceType, resourceId, name: name.trim(), config: getConfig(), isShared }),
    onSuccess: async () => {
      setSaveOpen(false);
      setName("");
      setIsShared(false);
      await invalidate();
      toast({ tone: "success", title: t("views.saved") });
    },
    onError: onError(t("views.errorSaving"))
  });

  const renameMutation = useMutation({
    mutationFn: () => viewsApi.update(organization.id, renaming!.id, { name: renameValue.trim() }),
    onSuccess: async () => {
      setRenaming(null);
      await invalidate();
      toast({ tone: "success", title: t("views.renamed") });
    },
    onError: onError(t("views.errorSaving"))
  });

  const deleteMutation = useMutation({
    mutationFn: (view: SavedViewDto) => viewsApi.remove(organization.id, view.id),
    onSuccess: async () => {
      await invalidate();
      toast({ tone: "success", title: t("views.deleted") });
    },
    onError: onError(t("views.errorDeleting"))
  });

  function submitSave(event: FormEvent) {
    event.preventDefault();
    if (name.trim()) saveMutation.mutate();
  }
  function submitRename(event: FormEvent) {
    event.preventDefault();
    if (renameValue.trim()) renameMutation.mutate();
  }

  return (
    <>
      <Dropdown
        align="end"
        trigger={
          <Button variant="outline" size="sm" aria-label={t("views.title")}>
            <Bookmark />
            {t("views.title")}
          </Button>
        }
      >
        <div className="max-h-72 w-64 overflow-y-auto">
          {viewsQuery.isError ? <p className="px-2.5 py-2 text-sm text-danger">{t("views.errorLoading")}</p> : null}
          {views.map((view) => (
            <div key={view.id} className="group flex items-center gap-1 rounded-sm hover:bg-surface-secondary">
              <button
                type="button"
                role="menuitem"
                className="nx-focus-ring flex min-w-0 flex-1 items-center gap-2 rounded-sm px-2.5 py-2 text-left text-sm text-secondary-foreground hover:text-foreground"
                onClick={() => applyConfig(view.config)}
                title={t("common.apply")}
              >
                {view.isShared ? (
                  <Users className="size-3.5 shrink-0 text-primary" aria-label={t("views.shared")} />
                ) : (
                  <User className="size-3.5 shrink-0 text-muted-foreground" aria-label={t("views.personal")} />
                )}
                <span className="truncate">{view.name}</span>
              </button>
              <button
                type="button"
                className="nx-focus-ring rounded-sm p-1.5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100 group-focus-within:opacity-100"
                aria-label={t("views.rename")}
                title={t("views.rename")}
                onClick={(event) => {
                  event.stopPropagation();
                  setRenaming(view);
                  setRenameValue(view.name);
                }}
              >
                <Pencil className="size-3.5" />
              </button>
              <button
                type="button"
                className="nx-focus-ring mr-1 rounded-sm p-1.5 text-muted-foreground opacity-0 transition-opacity hover:text-danger group-hover:opacity-100 group-focus-within:opacity-100"
                aria-label={t("common.delete")}
                title={t("common.delete")}
                onClick={async (event) => {
                  event.stopPropagation();
                  if (await confirm(t("views.deleteConfirm", { name: view.name }))) deleteMutation.mutate(view);
                }}
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
          {views.length === 0 && !viewsQuery.isError ? <p className="px-2.5 py-2 text-sm text-muted-foreground">{t("views.empty")}</p> : null}
          <DropdownSeparator />
          <button
            type="button"
            role="menuitem"
            className="nx-focus-ring flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-left text-sm font-medium text-primary hover:bg-primary-subtle"
            onClick={() => setSaveOpen(true)}
          >
            <Bookmark className="size-3.5" />
            {t("views.saveCurrent")}
          </button>
        </div>
      </Dropdown>

      <Dialog
        open={saveOpen}
        onOpenChange={setSaveOpen}
        title={t("views.saveCurrent")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setSaveOpen(false)}>{t("common.cancel")}</Button>
            <Button type="submit" form="saved-view-form" loading={saveMutation.isPending} disabled={!name.trim()}>{t("common.save")}</Button>
          </>
        }
      >
        <form id="saved-view-form" className="space-y-4" onSubmit={submitSave}>
          <Field label={t("views.name")} required error={saveMutation.error ? apiErrorText(saveMutation.error, t) : undefined}>
            <Input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder={t("views.namePlaceholder")} maxLength={120} />
          </Field>
          <label className="flex items-center gap-2 rounded-md bg-surface-secondary px-3 py-2.5 text-sm text-secondary-foreground">
            <Checkbox checked={isShared} onChange={(event) => setIsShared(event.target.checked)} />
            {t("views.shareWithTeam")}
          </label>
        </form>
      </Dialog>

      <Dialog
        open={Boolean(renaming)}
        onOpenChange={(next) => !next && setRenaming(null)}
        title={t("views.rename")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRenaming(null)}>{t("common.cancel")}</Button>
            <Button type="submit" form="saved-view-rename-form" loading={renameMutation.isPending} disabled={!renameValue.trim()}>{t("common.save")}</Button>
          </>
        }
      >
        <form id="saved-view-rename-form" onSubmit={submitRename}>
          <Field label={t("views.name")} required error={renameMutation.error ? apiErrorText(renameMutation.error, t) : undefined}>
            <Input autoFocus value={renameValue} onChange={(event) => setRenameValue(event.target.value)} maxLength={120} />
          </Field>
        </form>
      </Dialog>
      {confirmDialog}
    </>
  );
}
