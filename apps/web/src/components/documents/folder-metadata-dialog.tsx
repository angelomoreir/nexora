import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FolderMetadataFieldInput, FolderMetadataFieldType, FolderItemDto } from "@nexora/contracts";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useWorkspace } from "../layout/app-layout";
import { Badge, Button, Checkbox, Dialog, Field, Input, Select, Skeleton, useToast } from "../ui";
import { documentsApi } from "../../lib/api";
import { apiErrorText } from "../../lib/api-error";

const FIELD_TYPES: FolderMetadataFieldType[] = ["text", "longtext", "number", "currency", "date", "datetime", "boolean", "choice", "email", "url", "user"];

function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").slice(0, 80);
}

export function useMetadataFieldTypeLabels(): Record<FolderMetadataFieldType, string> {
  const { t } = useTranslation();
  return {
    text: t("forms.fieldText"),
    longtext: t("forms.fieldLongText"),
    number: t("forms.fieldNumber"),
    currency: t("forms.fieldCurrency"),
    date: t("forms.fieldDate"),
    datetime: t("forms.fieldDateTime"),
    boolean: t("forms.fieldBoolean"),
    choice: t("forms.fieldChoice"),
    email: t("forms.fieldEmail"),
    url: t("forms.fieldUrl"),
    user: t("forms.fieldUser")
  };
}

export function FolderMetadataDialog({ folder, onClose }: { folder: FolderItemDto; onClose: () => void }) {
  const { t } = useTranslation();
  const { organization } = useWorkspace();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const typeLabels = useMetadataFieldTypeLabels();

  const queryKey = ["folder-metadata-fields", organization.id, folder.id];
  const fieldsQuery = useQuery({ queryKey, queryFn: () => documentsApi.getFolderMetadataFields(organization.id, folder.id) });
  const [fields, setFields] = useState<FolderMetadataFieldInput[]>([]);

  useEffect(() => {
    if (fieldsQuery.data) setFields(fieldsQuery.data.fields.map((f) => ({ name: f.name, slug: f.slug, type: f.type, required: f.required, options: f.options, order: f.order })));
  }, [fieldsQuery.data]);

  const save = useMutation({
    mutationFn: () => documentsApi.setFolderMetadataFields(organization.id, folder.id, fields.map((f, i) => ({ ...f, order: i }))),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      await queryClient.invalidateQueries({ queryKey: ["documents", organization.id] });
      toast({ tone: "success", title: t("documents.meta.fieldsSaved") });
      onClose();
    },
    onError: (error: Error) => toast({ tone: "danger", title: t("documents.meta.errorSavingFields"), description: apiErrorText(error, t) })
  });

  function updateField(index: number, patch: Partial<FolderMetadataFieldInput>) {
    setFields((current) => current.map((f, i) => {
      if (i !== index) return f;
      const updated = { ...f, ...patch };
      if (patch.name !== undefined && patch.slug === undefined) updated.slug = slugify(patch.name);
      if (patch.type && patch.type !== "choice") updated.options = null;
      return updated;
    }));
  }
  function moveField(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= fields.length) return;
    setFields((current) => {
      const next = [...current];
      const tmp = next[index]!;
      next[index] = next[target]!;
      next[target] = tmp;
      return next.map((f, i) => ({ ...f, order: i }));
    });
  }

  const inherited = fieldsQuery.data?.inherited ?? [];

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()} size="lg" title={t("documents.meta.dialogTitle", { name: folder.name })} description={t("documents.meta.dialogDesc")}
      footer={<><Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button><Button loading={save.isPending} onClick={() => save.mutate()}>{t("common.save")}</Button></>}>
      {fieldsQuery.isPending ? <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div> : (
        <div className="space-y-5">
          {inherited.length ? (
            <div>
              <p className="nx-label mb-2">{t("documents.meta.inheritedFields")}</p>
              <div className="space-y-2">
                {inherited.map((field) => (
                  <div key={field.id} className="flex items-center gap-3 rounded-md border border-border bg-surface-secondary px-3 py-2.5">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-secondary-foreground">{field.name}</span>
                    <span className="text-xs text-muted-foreground">{typeLabels[field.type]}</span>
                    {field.required ? <Badge variant="outline">{t("common.requiredField")}</Badge> : null}
                    <Badge variant="neutral">{t("documents.meta.inherited")}</Badge>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div>
            <div className="flex items-center justify-between">
              <p className="nx-label">{t("documents.meta.ownFields", { count: fields.length })}</p>
              <Button type="button" size="sm" variant="outline" onClick={() => setFields([...fields, { name: "", slug: "", type: "text", required: false, options: null, order: fields.length }])}><Plus />{t("forms.addField")}</Button>
            </div>
            {fields.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">{t("documents.meta.noFields")}</p> : null}
            <div className="mt-3 space-y-3">
              {fields.map((field, index) => (
                <div key={index} className="rounded-md border border-border bg-surface-secondary p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex flex-col gap-1 pt-2">
                      <button type="button" className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40 nx-focus-ring" disabled={index === 0} onClick={() => moveField(index, -1)} aria-label={t("documents.meta.moveUp")}><ArrowUp className="size-4" /></button>
                      <button type="button" className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40 nx-focus-ring" disabled={index === fields.length - 1} onClick={() => moveField(index, 1)} aria-label={t("documents.meta.moveDown")}><ArrowDown className="size-4" /></button>
                    </div>
                    <div className="grid flex-1 gap-3 sm:grid-cols-2">
                      <Field label={t("common.name")}><Input value={field.name} onChange={(e) => updateField(index, { name: e.target.value })} required maxLength={120} /></Field>
                      <Field label={t("documents.meta.slug")}><Input value={field.slug} onChange={(e) => updateField(index, { slug: slugify(e.target.value) })} required maxLength={80} /></Field>
                      <Field label={t("common.type")}>
                        <Select value={field.type} onChange={(e) => updateField(index, { type: e.target.value as FolderMetadataFieldType })}>
                          {FIELD_TYPES.map((type) => <option key={type} value={type}>{typeLabels[type]}</option>)}
                        </Select>
                      </Field>
                      <div className="flex items-end pb-1">
                        <label className="flex items-center gap-2 text-sm text-secondary-foreground"><Checkbox checked={field.required} onChange={(e) => updateField(index, { required: e.target.checked })} />{t("common.requiredField")}</label>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon-sm" className="pt-2 text-muted-foreground hover:bg-danger-subtle hover:text-danger" onClick={() => setFields(fields.filter((_, i) => i !== index).map((f, i) => ({ ...f, order: i })))} aria-label={t("documents.meta.removeField")}><Trash2 className="size-4" /></Button>
                  </div>
                  {field.type === "choice" ? (
                    <div className="mt-3 border-t border-border pt-3">
                      <p className="nx-label mb-2">{t("common.options")}</p>
                      <div className="space-y-2">
                        {(field.options ?? []).map((option, optionIndex) => (
                          <div key={optionIndex} className="flex items-center gap-2">
                            <Input placeholder={t("common.value")} value={option.value} onChange={(e) => updateField(index, { options: (field.options ?? []).map((o, j) => j === optionIndex ? { ...o, value: e.target.value } : o) })} />
                            <Input placeholder={t("common.label")} value={option.label} onChange={(e) => updateField(index, { options: (field.options ?? []).map((o, j) => j === optionIndex ? { ...o, label: e.target.value } : o) })} />
                            <Button type="button" variant="ghost" size="icon-sm" aria-label={t("common.remove")} onClick={() => updateField(index, { options: (field.options ?? []).filter((_, j) => j !== optionIndex) })}><Trash2 /></Button>
                          </div>
                        ))}
                        <Button type="button" size="sm" variant="outline" onClick={() => updateField(index, { options: [...(field.options ?? []), { value: "", label: "" }] })}>{t("common.addOption")}</Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Dialog>
  );
}
