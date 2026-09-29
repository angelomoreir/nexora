import { useMutation } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router";
import { AuthShell } from "../components/forms/auth-shell";
import { Alert, Button, Field, Input } from "../components/ui";
import { authApi } from "../lib/api";
import { apiErrorText } from "../lib/api-error";

export function ResetPasswordPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const [password, setPassword] = useState("");
  const token = params.get("token") ?? "";
  const reset = useMutation({ mutationFn: () => authApi.resetPassword(token, password) });

  function submit(event: FormEvent) {
    event.preventDefault();
    reset.mutate();
  }

  return (
    <AuthShell title={t("auth.reset.title")} description={t("auth.reset.description")}>
      {reset.isSuccess ? (
        <div>
          <Alert variant="success" title={t("auth.reset.success")}>{reset.data.message}</Alert>
          <Link className="mt-6 block text-center text-sm text-primary" to="/login">{t("auth.reset.backToLogin")}</Link>
        </div>
      ) : (
        <form className="space-y-5" onSubmit={submit}>
          <Field label={t("auth.reset.newPassword")} htmlFor="password"><Input id="password" type="password" autoComplete="new-password" minLength={12} required value={password} onChange={(event) => setPassword(event.target.value)} /></Field>
          {!token ? <Alert variant="danger">{t("auth.reset.invalidToken")}</Alert> : null}
          {reset.error ? <Alert variant="danger">{apiErrorText(reset.error, t)}</Alert> : null}
          <Button className="w-full" disabled={!token || reset.isPending} type="submit">{reset.isPending ? t("auth.reset.submitting") : t("auth.reset.submit")}</Button>
        </form>
      )}
    </AuthShell>
  );
}
