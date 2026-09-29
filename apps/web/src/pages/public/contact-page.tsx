import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, Mail, MapPin } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { PublicSection, PublicSectionTitle } from "../../components/layout/public-layout";
import { Alert, Button, Field, Input, Textarea } from "../../components/ui";
import { ApiClientError } from "../../lib/api";
import { apiErrorText } from "../../lib/api-error";

const apiUrl = import.meta.env?.VITE_API_URL ?? "http://localhost:3000/api/v1";

export function ContactPage() {
  const { t } = useTranslation();
  const [form, setForm] = useState({ name: "", email: "", company: "", message: "" });
  const [sent, setSent] = useState(false);

  const submit = useMutation({
    mutationFn: async () => {
      const response = await fetch(`${apiUrl}/public/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(form)
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new ApiClientError(response.status, payload?.error?.code ?? "REQUEST_FAILED", payload?.error?.message ?? t("public.contact.error"));
      }
    },
    onSuccess: () => setSent(true)
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    submit.mutate();
  }

  return (
    <PublicSection>
      <PublicSectionTitle eyebrow={t("public.nav.contact")} title={t("public.contact.title")} sub={t("public.contact.sub")} />
      <div className="mx-auto grid max-w-4xl gap-8 md:grid-cols-5">
        <div className="space-y-6 md:col-span-2">
          <div className="flex items-start gap-3">
            <Mail className="mt-1 size-5 text-primary" />
            <div><p className="font-medium">Email</p><p className="text-sm text-nav-muted">japmoreira@gmail.com</p></div>
          </div>
          <div className="flex items-start gap-3">
            <MapPin className="mt-1 size-5 text-primary" />
            <div><p className="font-medium">{t("public.contact.office")}</p><p className="text-sm text-nav-muted">Porto, Portugal</p></div>
          </div>
          <div className="rounded-xl border border-border bg-surface p-5 text-sm text-nav-muted">{t("public.contact.note")}</div>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-6 md:col-span-3">
          {sent ? (
            <div className="flex flex-col items-center py-12 text-center">
              <CheckCircle2 className="size-12 text-success" />
              <h3 className="mt-4 text-lg font-semibold">{t("public.contact.sent")}</h3>
              <p className="mt-1 text-sm text-nav-muted">{t("public.contact.sentDesc")}</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t("common.name")}><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
                <Field label="Email"><Input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
              </div>
              <Field label={t("public.contact.company")}><Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></Field>
              <Field label={t("public.contact.message")}><Textarea required rows={5} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} /></Field>
              {submit.error ? <Alert variant="danger">{apiErrorText(submit.error, t)}</Alert> : null}
              <Button className="w-full" loading={submit.isPending}>{submit.isPending ? t("common.sending") : t("public.contact.send")}</Button>
            </form>
          )}
        </div>
      </div>
    </PublicSection>
  );
}
