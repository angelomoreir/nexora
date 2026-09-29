import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FormFieldDefinition, FormStatus } from "@nexora/contracts";
import { Copy, Download, Eye, FilePlus, Send, Settings, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { useWorkspace } from "../components/layout/app-layout";
import { Alert, Badge, Breadcrumb, Button, EmptyState, Field, Input, Page, PageHeader, Pagination, Select, Skeleton, Table, TableBody, TableCell, TableContainer, TableHead, TableHeader, TableRow, Tabs, Textarea, useConfirm } from "../components/ui";
import { formsApi } from "../lib/api";

const STATUS_LABELS: Record<FormStatus, string> = { DRAFT: "Rascunho", PUBLISHED: "Publicado", ARCHIVED: "Arquivado" };
const STATUS_VARIANT: Record<FormStatus, "neutral" | "success" | "warning"> = { DRAFT: "neutral", PUBLISHED: "success", ARCHIVED: "warning" };

export function FormDetailPage() {
  const { t, i18n } = useTranslation();
  const { confirm, confirmDialog } = useConfirm();
  const { id: formId = "" } = useParams();
  const { organization } = useWorkspace();
  const canManage = organization.permissions.includes("forms.manage");
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"overview" | "submissions" | "preview">("overview");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [submitValues, setSubmitValues] = useState<Record<string, unknown>>({});
  const [submitResult, setSubmitResult] = useState<string | null>(null);

  const formQuery = useQuery({ queryKey: ["form", organization.id, formId], queryFn: () => formsApi.get(organization.id, formId) });
  const submissionsQuery = useQuery({ queryKey: ["form-submissions", organization.id, formId, page, pageSize], queryFn: () => formsApi.submissions(organization.id, formId, { page, pageSize }) });

  const refreshForm = () => queryClient.invalidateQueries({ queryKey: ["form", organization.id, formId] });
  const refreshSubmissions = () => queryClient.invalidateQueries({ queryKey: ["form-submissions", organization.id, formId] });

  const updateStatus = useMutation({
    mutationFn: (status: FormStatus) => formsApi.update(organization.id, formId, { status }),
    onSuccess: refreshForm
  });
  const duplicateMutation = useMutation({ mutationFn: () => formsApi.duplicate(organization.id, formId), onSuccess: async (form) => { await refreshForm(); navigate(`/forms/${form.id}`); } });
  const removeMutation = useMutation({ mutationFn: () => formsApi.remove(organization.id, formId), onSuccess: () => navigate("/forms") });
  const submitMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) => formsApi.submit(organization.id, formId, values),
    onSuccess: async () => { setSubmitResult(t("forms.submitSuccess")); setSubmitValues({}); await refreshSubmissions(); }
  });

  async function exportSubmissions() {
    const result = await formsApi.exportSubmissions(organization.id, formId);
    const url = URL.createObjectURL(result.blob);
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = result.name;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function submitPreview(event: FormEvent) {
    event.preventDefault();
    submitMutation.mutate(submitValues);
  }

  const form = formQuery.data;

  if (formQuery.isPending) {
    return (
      <Page>
        <PageHeader eyebrow={t("navigation.forms")} title={t("forms.detail")} />
        <div className="space-y-4">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </Page>
    );
  }
  if (formQuery.isError || !form) {
    return (
      <Page>
        <PageHeader eyebrow={t("navigation.forms")} title={t("forms.detail")} />
        <EmptyState icon={FilePlus} title={t("forms.formNotFound")} description={t("forms.errorLoadingForm")} action={<Button variant="outline" onClick={() => navigate("/forms")}>{t("forms.backToForms")}</Button>} />
      </Page>
    );
  }

  const totalPages = Math.max(1, Math.ceil((submissionsQuery.data?.total ?? 0) / pageSize));
  const dataFields = form.fields.filter((f) => f.type !== "heading" && f.type !== "separator");

  return (
    <Page>
      <Breadcrumb items={[{ label: t("navigation.forms"), href: "/forms" }, { label: form.name }]} />
      <PageHeader
        eyebrow={t("navigation.forms")}
        title={form.name}
        description={form.description ?? t("forms.noDescription")}
        actions={
          canManage ? (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => navigate(`/forms/${formId}/builder`)}><Settings className="size-4" />{t("forms.builder")}</Button>
              <Button variant="outline" size="sm" onClick={() => duplicateMutation.mutate()}><Copy className="size-4" />{t("common.duplicate")}</Button>
              <Button variant="outline" size="sm" onClick={async () => { if (await confirm(t("forms.deleteConfirm"))) removeMutation.mutate(); }}><Trash2 className="size-4 text-danger" /></Button>
            </div>
          ) : undefined
        }
      />

      {!canManage ? <Alert variant="info">{t("forms.readOnlyNotice")}</Alert> : null}

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface p-4 shadow-sm">
        <Badge variant={STATUS_VARIANT[form.status]}>{STATUS_LABELS[form.status]}</Badge>
        <span className="text-sm text-secondary-foreground">{t("forms.fieldsBadge", { count: form.fields.length })} · {t("forms.submissionsBadge", { count: form.submissionCount })}</span>
        <div className="ml-auto flex items-center gap-2">
          {canManage && form.status === "DRAFT" ? <Button size="sm" onClick={() => updateStatus.mutate("PUBLISHED")}>{t("forms.publish")}</Button> : null}
          {canManage && form.status === "PUBLISHED" ? <Button size="sm" variant="outline" onClick={() => updateStatus.mutate("ARCHIVED")}>{t("forms.archive")}</Button> : null}
          {canManage && form.status === "ARCHIVED" ? <Button size="sm" variant="outline" onClick={() => updateStatus.mutate("DRAFT")}>{t("forms.reactivate")}</Button> : null}
        </div>
      </div>

      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as typeof tab)}
        items={[
          { value: "overview", label: t("workflows.overview") },
          { value: "submissions", label: t("forms.submissionsTab", { count: form.submissionCount }) },
          { value: "preview", label: t("documents.preview"), icon: <Eye className="size-3.5" /> }
        ]}
      />

      {tab === "overview" ? (
        <section className="rounded-lg border border-border bg-surface p-6 shadow-sm">
          <h3 className="nx-h3 text-foreground">{t("forms.formFields")}</h3>
          {form.fields.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">{t("forms.noFieldsPreview")}</p>
          ) : (
            <ol className="mt-4 space-y-2">
              {form.fields.map((field, index) => (
                <li key={field.id} className="flex items-center gap-3 rounded-md border border-border bg-surface-secondary p-3">
                  <span className="grid size-7 place-items-center rounded-full bg-surface text-xs font-medium text-muted-foreground">{index + 1}</span>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">{field.label}</p>
                    <p className="text-xs text-muted-foreground">{field.type}{field.required ? ` · ${t("forms.isRequired")}` : ""}</p>
                  </div>
                  {field.options && field.options.length > 0 ? <span className="text-xs text-muted-foreground">{t("forms.optionsCount", { count: field.options.length })}</span> : null}
                </li>
              ))}
            </ol>
          )}
          {canManage ? <div className="mt-6">
            <Button variant="outline" size="sm" onClick={() => navigate(`/forms/${formId}/builder`)}><Settings className="size-4" />{t("forms.editInBuilder")}</Button>
          </div> : null}
        </section>
      ) : null}

      {tab === "submissions" ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-secondary-foreground">{t("forms.submissionsBadge", { count: submissionsQuery.data?.total ?? 0 })}</p>
            <Button variant="outline" size="sm" onClick={exportSubmissions} disabled={(submissionsQuery.data?.total ?? 0) === 0}><Download className="size-4" />{t("forms.exportCsv")}</Button>
          </div>
          <TableContainer>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("forms.submittedAt")}</TableHead>
                  <TableHead>{t("forms.submittedBy")}</TableHead>
                  {dataFields.map((field) => <TableHead key={field.id}>{field.label}</TableHead>)}
                </TableRow>
              </TableHeader>
              <TableBody>
                {(submissionsQuery.data?.submissions ?? []).length === 0 ? (
                  <TableRow><TableCell colSpan={dataFields.length + 2}><EmptyState icon={FilePlus} title={t("forms.noSubmissions")} description={t("forms.submissionsWillAppear")} /></TableCell></TableRow>
                ) : null}
                {(submissionsQuery.data?.submissions ?? []).map((sub) => (
                  <TableRow key={sub.id}>
                    <TableCell>{new Date(sub.submittedAt).toLocaleString("pt-PT")}</TableCell>
                    <TableCell>{sub.submitter?.name ?? t("forms.anonymous")}</TableCell>
                    {dataFields.map((field) => <TableCell key={field.id}>{formatValue(field, sub.values[field.id], i18n.language)}</TableCell>)}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} total={submissionsQuery.data?.total ?? 0} />
        </div>
      ) : null}

      {tab === "preview" ? (
        <div className="mx-auto max-w-2xl">
          {form.status !== "PUBLISHED" ? (
            <Alert variant="warning" className="mb-4">{t("forms.notPublished")}</Alert>
          ) : null}
          <form className="rounded-lg border border-border bg-surface p-6 shadow-sm" onSubmit={submitPreview}>
            <h2 className="nx-h2 text-foreground">{form.name}</h2>
            {form.description ? <p className="mt-1 text-sm text-secondary-foreground">{form.description}</p> : null}
            <div className="mt-6 space-y-4">
              {form.fields.length === 0 ? <p className="text-sm text-muted-foreground">Sem campos. Adicione campos no construtor.</p> : null}
              {form.fields.map((field) => (
                <PreviewField key={field.id} field={field} value={submitValues[field.id]} onChange={(value) => setSubmitValues({ ...submitValues, [field.id]: value })} />
              ))}
            </div>
            {submitResult ? <Alert variant="success" className="mt-4">{submitResult}</Alert> : null}
            {form.fields.length > 0 ? (
              <div className="mt-6 flex justify-end">
                <Button type="submit" disabled={submitMutation.isPending}><Send className="size-4" />{submitMutation.isPending ? t("common.submitting") : t("common.submit")}</Button>
              </div>
            ) : null}
          </form>
        </div>
      ) : null}
      {confirmDialog}
    </Page>
  );
}

function formatValue(field: FormFieldDefinition, value: unknown, locale: string): string {
  if (value == null || value === "") return "—";
  if (Array.isArray(value)) return value.join(", ");
  switch (field.type) {
    case "date": return new Date(String(value)).toLocaleDateString(locale);
    case "currency": return typeof value === "number" ? value.toLocaleString(locale, { style: "currency", currency: "EUR" }) : String(value);
    case "select":
    case "radio": {
      const opt = field.options?.find((o) => o.value === value);
      return opt?.label ?? String(value);
    }
    case "checkbox": {
      const arr = Array.isArray(value) ? value : [value];
      return arr.map((v) => field.options?.find((o) => o.value === v)?.label ?? String(v)).join(", ");
    }
    default: return String(value);
  }
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
