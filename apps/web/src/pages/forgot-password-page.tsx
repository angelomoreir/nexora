import { useMutation } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { AuthShell } from "../components/forms/auth-shell";
import { Alert, Button, Field, Input } from "../components/ui";
import { authApi } from "../lib/api";
import { apiErrorText } from "../lib/api-error";

export function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const recovery = useMutation({ mutationFn: authApi.forgotPassword });

  function submit(event: FormEvent) {
    event.preventDefault();
    recovery.mutate(email);
  }

  return (
    <AuthShell title={t("auth.forgot.title")} description={t("auth.forgot.description")}>
      {recovery.isSuccess ? (
        <Alert variant="success" title={t("auth.forgot.success")}>
          <p>{recovery.data.message}</p>
          {recovery.data.resetToken ? <Link className="mt-3 inline-block font-medium underline text-success" to={`/reset-password?token=${encodeURIComponent(recovery.data.resetToken)}`}>{t("auth.forgot.devLink")}</Link> : null}
        </Alert>
      ) : (
        <form className="space-y-5" onSubmit={submit}>
          <Field label={t("auth.forgot.email")} htmlFor="email"><Input id="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></Field>
          {recovery.error ? <Alert variant="danger">{apiErrorText(recovery.error, t)}</Alert> : null}
          <Button className="w-full" disabled={recovery.isPending} type="submit">{recovery.isPending ? t("auth.forgot.submitting") : t("auth.forgot.submit")}</Button>
        </form>
      )}
      <Link className="mt-6 block text-center text-sm text-primary" to="/login">{t("auth.forgot.backToLogin")}</Link>
    </AuthShell>
  );
}
