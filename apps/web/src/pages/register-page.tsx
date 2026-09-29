import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Trans, useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";
import { AuthShell } from "../components/forms/auth-shell";
import { Alert, Button, Field, Input } from "../components/ui";
import { authApi } from "../lib/api";
import { apiErrorText } from "../lib/api-error";

export function RegisterPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: "", email: "", organizationName: "", password: "" });
  const register = useMutation({
    mutationFn: authApi.register,
    onSuccess: async (session) => {
      queryClient.setQueryData(["session"], session);
      await navigate("/dashboard");
    }
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    register.mutate(form);
  }

  return (
    <AuthShell title={t("auth.register.title")} description={t("auth.register.description")}>
      <form className="space-y-4" onSubmit={submit}>
        <Field label={t("auth.register.name")} htmlFor="name"><Input id="name" autoComplete="name" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
        <Field label={t("auth.register.organization")} htmlFor="organization"><Input id="organization" required value={form.organizationName} onChange={(event) => setForm({ ...form, organizationName: event.target.value })} /></Field>
        <Field label={t("auth.register.email")} htmlFor="email"><Input id="email" type="email" autoComplete="email" required value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></Field>
        <Field label={t("auth.register.password")} htmlFor="password" helper={t("auth.register.passwordHint")}>
          <Input id="password" type="password" autoComplete="new-password" minLength={12} required value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
        </Field>
        {register.error ? <Alert variant="danger">{apiErrorText(register.error, t)}</Alert> : null}
        <Button className="w-full" disabled={register.isPending} type="submit">{register.isPending ? t("auth.register.submitting") : t("auth.register.submit")}</Button>
        <p className="text-center text-xs leading-relaxed text-muted-foreground">
          <Trans
            i18nKey="auth.register.legalNotice"
            components={{
              termsLink: <Link className="font-medium text-primary" to="/terms" />,
              privacyLink: <Link className="font-medium text-primary" to="/privacy" />
            }}
          />
        </p>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">{t("auth.register.haveAccount")} <Link className="font-medium text-primary" to="/login">{t("auth.register.login")}</Link></p>
    </AuthShell>
  );
}
