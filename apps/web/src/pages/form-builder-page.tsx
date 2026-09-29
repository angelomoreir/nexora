import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { FormFieldDefinition, FormFieldType, FormFieldOption } from "@nexora/contracts";
import { ArrowDown, ArrowUp, Copy as CopyIcon, Eye, Plus, Save, Trash2, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { useWorkspace } from "../components/layout/app-layout";
import { Alert, Breadcrumb, Button, Checkbox, EmptyState, Field, Input, Page, PageHeader, Select, Skeleton, Textarea, useToast } from "../components/ui";
import { formsApi, type FormFieldInput } from "../lib/api";
import { apiErrorText } from "../lib/api-error";

const FIELD_TYPES: FormFieldType[] = ["text", "longtext", "number", "currency", "email", "phone", "date", "select", "radio", "checkbox", "upload", "heading", "separator"];
const INPUT_TYPES = FIELD_TYPES.filter((t) => t !== "heading" && t !== "separator");
const LAYOUT_TYPES: FormFieldType[] = ["heading", "separator"];

function generateId(): string {
  return `field-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function FormBuilderPage() {
  const { t } = useTranslation();
  const FIELD_TYPE_LABELS: Record<FormFieldType, string> = {
  text: t("forms.fieldText"),
  longtext: t("forms.fieldLongText"),
  number: t("forms.fieldNumber"),
  currency: t("forms.fieldCurrency"),
  email: t("forms.fieldEmail"),
  phone: t("forms.fieldPhone"),
  date: t("forms.fieldDate"),
  select: t("forms.fieldSelect"),
  radio: t("forms.fieldRadio"),
  checkbox: t("forms.fieldCheckbox"),
  upload: t("forms.fieldUpload"),
  heading: t("forms.fieldTitle"),
  separator: t("forms.fieldSeparator")
};
  const { id: formId = "" } = useParams();
  const { organization } = useWorkspace();
  const canManage = organization.permissions.includes("forms.manage");
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [fields, setFields] = useState<FormFieldInput[]>([]);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewValues, setPreviewValues] = useState<Record<string, unknown>>({});
  const [loaded, setLoaded] = useState(false);

  const formQuery = useQuery({
    queryKey: ["form", organization.id, formId],
    queryFn: () => formsApi.get(organization.id, formId),
    enabled: !loaded
  });

  if (!loaded && formQuery.data) {
    setName(formQuery.data.name);
    setDescription(formQuery.data.description ?? "");
    setFields(formQuery.data.fields.map((f) => ({ ...f })));
    setLoaded(true);
  }

  function addField(type: FormFieldType) {
    const newField: FormFieldInput = {
      id: generateId(),
      type,
      label: type === "separator" ? t("forms.fieldSeparator") : t("forms.newField"),
      required: false,
      options: (type === "select" || type === "radio" || type === "checkbox") ? [{ value: "opcao1", label: t("forms.optionLabel") }] : null,
      order: fields.length
    };
    setFields([...fields, newField]);
  }

  function duplicateField(index: number) {
    const original = fields[index]!;
    const copy: FormFieldInput = { ...original, id: generateId(), label: t("forms.copyOf", { label: original.label }), options: original.options ? original.options.map((o) => ({ ...o })) : null };
    const next = [...fields];
    next.splice(index + 1, 0, copy);
    setFields(next.map((f, i) => ({ ...f, order: i })));
  }

  function removeField(index: number) {
    setFields(fields.filter((_, i) => i !== index).map((f, i) => ({ ...f, order: i })));
  }

  function moveField(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= fields.length) return;
    const next = [...fields];
    const tmp = next[index]!;
    next[index] = next[target]!;
    next[target] = tmp;
    setFields(next.map((f, i) => ({ ...f, order: i })));
  }

  function updateField(index: number, patch: Partial<FormFieldInput>) {
    setFields(fields.map((f, i) => {
      if (i !== index) return f;
      const updated = { ...f, ...patch };
      if (patch.type) {
        const needsOptions = updated.type === "select" || updated.type === "radio" || updated.type === "checkbox";
        if (needsOptions && (!updated.options || updated.options.length === 0)) {
          updated.options = [{ value: "opcao1", label: t("forms.optionLabel") }];
        }
        if (!needsOptions) updated.options = null;
        if (updated.type === "heading" || updated.type === "separator") {
          updated.required = false;
          updated.placeholder = undefined;
          updated.defaultValue = undefined;
        }
      }
      return updated;
    }));
  }

  function addOption(index: number) {
    setFields(fields.map((f, i) => {
      if (i !== index || !f.options) return f;
      const n = f.options.length + 1;
      return { ...f, options: [...f.options, { value: `opcao${n}`, label: t("forms.optionN", { n }) }] };
    }));
  }

  function updateOption(fieldIndex: number, optionIndex: number, patch: Partial<FormFieldOption>) {
    setFields(fields.map((f, i) => {
      if (i !== fieldIndex || !f.options) return f;
      return { ...f, options: f.options.map((o, j) => j === optionIndex ? { ...o, ...patch } : o) };
    }));
  }

  function removeOption(fieldIndex: number, optionIndex: number) {
    setFields(fields.map((f, i) => {
      if (i !== fieldIndex || !f.options) return f;
      return { ...f, options: f.options.filter((_, j) => j !== optionIndex) };
    }));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await formsApi.update(organization.id, formId, { name, description: description || null, fields });
      await queryClient.invalidateQueries({ queryKey: ["form", organization.id, formId] });
      await queryClient.invalidateQueries({ queryKey: ["forms", organization.id] });
      toast({ tone: "success", title: t("forms.saved") });
      navigate(`/forms/${formId}`);
    } catch (error) {
      toast({ tone: "danger", title: t("common.error"), description: apiErrorText(error as Error, t) });
    } finally {
      setSaving(false);
    }
  }

  if (formQuery.isPending && !loaded) {
    return (
      <Page>
        <PageHeader eyebrow={t("navigation.forms")} title={t("forms.builder")} />
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </Page>
    );
  }
  if (formQuery.isError) {
    return (
      <Page>
        <PageHeader eyebrow={t("navigation.forms")} title={t("forms.builder")} />
        <EmptyState title={t("forms.formNotFound")} description={t("forms.errorLoadingForm")} action={<Button variant="outline" onClick={() => navigate("/forms")}>{t("forms.backToForms")}</Button>} />
      </Page>
    );
  }

  return (
    <Page>
      <Breadcrumb items={[{ label: t("navigation.forms"), href: "/forms" }, { label: t("forms.builderTitle") }]} />
      <PageHeader
        eyebrow={t("navigation.forms")}
        title={t("forms.builder")}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowPreview(!showPreview)}><Eye className="size-4" />{showPreview ? t("common.edit") : t("documents.preview")}</Button>
            <Button size="sm" onClick={save} disabled={saving || !name.trim() || !canManage} title={!canManage ? t("errors.FORBIDDEN") : undefined}><Save className="size-4" />{saving ? t("common.saving") : t("common.save")}</Button>
          </div>
        }
      />

      {!canManage ? <Alert variant="info">{t("forms.readOnlyNotice")}</Alert> : null}

      {showPreview ? (
        <div className="mx-auto max-w-2xl rounded-lg border border-border bg-surface p-6 shadow-sm">
          <h2 className="nx-h2 text-foreground">{name}</h2>
          {description ? <p className="mt-1 text-sm text-secondary-foreground">{description}</p> : null}
          <div className="mt-6 space-y-4">
            {fields.length === 0 ? <p className="text-sm text-muted-foreground">{t("forms.noFields")}</p> : null}
            {fields.map((field) => (
              <PreviewField key={field.id} field={field} value={previewValues[field.id]} onChange={(value) => setPreviewValues({ ...previewValues, [field.id]: value })} />
            ))}
          </div>
        </div>
      ) : (
        <form className="space-y-6" onSubmit={save}>
          <fieldset disabled={!canManage} className="m-0 min-w-0 space-y-6 border-0 p-0">
          <section className="rounded-lg border border-border bg-surface p-5 shadow-sm">
            <h3 className="nx-h3 text-foreground">{t("forms.properties")}</h3>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label={t("common.name")} htmlFor="form-name"><Input id="form-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} /></Field>
              <Field label={t("common.description")} htmlFor="form-description"><Input id="form-description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={480} /></Field>
            </div>
          </section>

          <section className="rounded-lg border border-border bg-surface p-5 shadow-sm">
            <h3 className="nx-h3 text-foreground">{t("forms.addComponent")}</h3>
            <div className="mt-4 flex flex-wrap gap-2">
              {INPUT_TYPES.map((type) => (
                <button key={type} type="button" className="nx-focus-ring rounded-md border border-border bg-surface-secondary px-3 py-1.5 text-sm text-secondary-foreground transition-colors hover:border-border-strong hover:text-foreground" onClick={() => addField(type)}><Plus className="mr-1 inline size-3" />{FIELD_TYPE_LABELS[type]}</button>
              ))}
              {LAYOUT_TYPES.map((type) => (
                <button key={type} type="button" className="nx-focus-ring rounded-md border border-dashed border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground" onClick={() => addField(type)}><Plus className="mr-1 inline size-3" />{FIELD_TYPE_LABELS[type]}</button>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-border bg-surface p-5 shadow-sm">
            <h3 className="nx-h3 text-foreground">{t("forms.fieldsCount", { count: fields.length })}</h3>
            <div className="mt-4 space-y-3">
              {fields.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">{t("forms.noFieldsBuilder")}</p> : null}
              {fields.map((field, index) => (
                <div key={field.id} className="rounded-md border border-border bg-surface-secondary p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex flex-col gap-1 pt-2">
                      <button type="button" className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40 nx-focus-ring" disabled={index === 0} onClick={() => moveField(index, -1)} aria-label={t("lists.moveUp")}><ArrowUp className="size-4" /></button>
                      <button type="button" className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40 nx-focus-ring" disabled={index === fields.length - 1} onClick={() => moveField(index, 1)} aria-label={t("lists.moveDown")}><ArrowDown className="size-4" /></button>
                    </div>
                    <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      <Field label={t("common.label")} htmlFor={`${field.id}-label`}><Input id={`${field.id}-label`} value={field.label} onChange={(e) => updateField(index, { label: e.target.value })} required maxLength={200} /></Field>
                      <Field label={t("common.type")} htmlFor={`${field.id}-type`}>
                        <Select id={`${field.id}-type`} value={field.type} onChange={(e) => updateField(index, { type: e.target.value as FormFieldType })}>
                          {FIELD_TYPES.map((type) => <option key={type} value={type}>{FIELD_TYPE_LABELS[type]}</option>)}
                        </Select>
                      </Field>
                      {field.type !== "heading" && field.type !== "separator" ? (
                        <Field label={t("common.placeholder")} htmlFor={`${field.id}-placeholder`}><Input id={`${field.id}-placeholder`} value={field.placeholder ?? ""} onChange={(e) => updateField(index, { placeholder: e.target.value })} maxLength={200} /></Field>
                      ) : <div />}
                    </div>
                    <div className="flex flex-col gap-1 pt-2">
                      <button type="button" className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-surface hover:text-foreground nx-focus-ring" onClick={() => duplicateField(index)} title={t("common.duplicate")}><CopyIcon className="size-4" /></button>
                      <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:bg-danger-subtle hover:text-danger" onClick={() => removeField(index)} title={t("common.remove")}><Trash2 className="size-4" /></Button>
                    </div>
                  </div>
                  {field.type !== "heading" && field.type !== "separator" ? (
                    <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-border pt-3">
                      <label className="flex items-center gap-2"><Checkbox checked={field.required} onChange={(e) => updateField(index, { required: e.target.checked })} /><span className="text-sm text-secondary-foreground">{t("common.required")}</span></label>
                      <label className="flex items-center gap-2"><span className="text-sm text-secondary-foreground">{t("forms.defaultValueLabel")}</span><Input className="h-8 w-40" value={String(field.defaultValue ?? "")} onChange={(e) => updateField(index, { defaultValue: e.target.value })} /></label>
                    </div>
                  ) : null}
                  {field.type === "select" || field.type === "radio" || field.type === "checkbox" ? (
                    <div className="mt-3 space-y-2 border-t border-border pt-3">
                      <div className="flex items-center justify-between"><span className="nx-label text-muted-foreground">{t("common.options")}</span><button type="button" className="text-xs text-primary transition-opacity hover:opacity-80 nx-focus-ring" onClick={() => addOption(index)}>{t("common.addOption")}</button></div>
                      {(field.options ?? []).map((opt, optionIndex) => (
                        <div key={optionIndex} className="flex items-center gap-2">
                          <Input className="h-8 w-32 text-xs" placeholder={t("common.value")} value={opt.value} onChange={(e) => updateOption(index, optionIndex, { value: e.target.value })} />
                          <Input className="h-8 flex-1 text-xs" placeholder={t("common.label")} value={opt.label} onChange={(e) => updateOption(index, optionIndex, { label: e.target.value })} />
                          <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:bg-danger-subtle hover:text-danger" onClick={() => removeOption(index, optionIndex)} aria-label={t("lists.removeOption")}><X className="size-3.5" /></Button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </section>

          <div className="flex justify-end">
            <Button type="submit" disabled={saving || !name.trim() || !canManage} title={!canManage ? t("errors.FORBIDDEN") : undefined}><Save className="size-4" />{saving ? t("common.saving") : t("forms.saveForm")}</Button>
          </div>
          </fieldset>
        </form>
      )}
    </Page>
  );
}

function PreviewField({ field, value, onChange }: { field: FormFieldDefinition; value: unknown; onChange: (value: unknown) => void }) {
  if (field.type === "heading") return <h3 className="border-b border-border pb-2 nx-h3 text-foreground">{field.label}</h3>;
  if (field.type === "separator") return <hr className="border-border" />;

  const labelText = `${field.label}${field.required ? " *" : ""}`;

  switch (field.type) {
    case "longtext":
      return <Field label={labelText} htmlFor={field.id}><Textarea id={field.id} rows={4} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} required={field.required} placeholder={field.placeholder} /></Field>;
    case "number":
    case "currency":
      return <Field label={labelText} htmlFor={field.id}><Input id={field.id} type="number" step={field.type === "currency" ? "0.01" : "any"} value={(value as string | number) ?? ""} onChange={(e) => onChange(e.target.value)} required={field.required} placeholder={field.placeholder} /></Field>;
    case "email":
      return <Field label={labelText} htmlFor={field.id}><Input id={field.id} type="email" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} required={field.required} placeholder={field.placeholder} /></Field>;
    case "phone":
      return <Field label={labelText} htmlFor={field.id}><Input id={field.id} type="tel" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} required={field.required} placeholder={field.placeholder} /></Field>;
    case "date":
      return <Field label={labelText} htmlFor={field.id}><Input id={field.id} type="date" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} required={field.required} /></Field>;
    case "select":
      return <Field label={labelText} htmlFor={field.id}><Select id={field.id} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} required={field.required}><option value="">—</option>{field.options?.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}</Select></Field>;
    case "radio":
      return (
        <div className="space-y-1.5">
          <label className="nx-label block">{labelText}</label>
          <div className="space-y-2">{field.options?.map((opt) => <label key={opt.value} className="flex items-center gap-2"><input type="radio" name={field.id} value={opt.value} checked={value === opt.value} onChange={() => onChange(opt.value)} required={field.required} className="nx-focus-ring" /><span className="text-sm text-secondary-foreground">{opt.label}</span></label>)}</div>
        </div>
      );
    case "checkbox":
      return (
        <div className="space-y-1.5">
          <label className="nx-label block">{labelText}</label>
          <div className="space-y-2">{field.options?.map((opt) => { const arr = Array.isArray(value) ? value : []; return <label key={opt.value} className="flex items-center gap-2"><input type="checkbox" value={opt.value} checked={arr.includes(opt.value)} onChange={(e) => { const next = e.target.checked ? [...arr, opt.value] : arr.filter((v: string) => v !== opt.value); onChange(next); }} className="nx-focus-ring" /><span className="text-sm text-secondary-foreground">{opt.label}</span></label>; })}</div>
        </div>
      );
    case "upload":
      return <Field label={labelText} htmlFor={field.id}><Input id={field.id} type="file" onChange={(e) => onChange(e.target.files?.[0]?.name ?? "")} required={field.required} /></Field>;
    default:
      return <Field label={labelText} htmlFor={field.id}><Input id={field.id} type="text" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} required={field.required} placeholder={field.placeholder} /></Field>;
  }
}
