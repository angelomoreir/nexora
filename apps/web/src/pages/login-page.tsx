import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router";
import { KeyRound } from "lucide-react";
import { AuthShell } from "../components/forms/auth-shell";
import { Alert, Button, Field, Input } from "../components/ui";
import { authApi, ssoApi } from "../lib/api";
import { apiErrorText } from "../lib/api-error";

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const ssoFailed = searchParams.get("sso") === "error";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const login = useMutation({
    mutationFn: authApi.login,
    onSuccess: async (session) => {
      queryClient.setQueryData(["session"], session);
      await navigate("/dashboard");
    }
  });

  const ssoLookup = useMutation({
    mutationFn: () => ssoApi.lookup(email),
    onSuccess: (result) => {
      if (result.enabled) {
        window.location.href = ssoApi.startUrl(result.organizationId);
      }
    }
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    login.mutate({ email, password });
  }

  function submitSso(event: FormEvent) {
    event.preventDefault();
    if (email) ssoLookup.mutate();
  }

  return (
    <AuthShell title={t("auth.login.title")} description={t("auth.login.description")}>
      {ssoFailed ? <Alert variant="danger" className="mb-4">{t("auth.login.ssoFailed")}</Alert> : null}
      <form className="space-y-5" onSubmit={submit}>
        <Field label={t("auth.login.email")} htmlFor="email"><Input id="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></Field>
        <div>
          <div className="flex justify-between">
            <label className="nx-label mb-1.5 block" htmlFor="password">{t("auth.login.password")}</label>
            <Link className="text-sm text-primary transition-colors hover:opacity-80" to="/forgot-password">{t("auth.login.recoverPassword")}</Link>
          </div>
          <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
        </div>
        {login.error ? <Alert variant="danger">{apiErrorText(login.error, t)}</Alert> : null}
        <Button className="w-full" disabled={login.isPending} type="submit">{login.isPending ? t("auth.login.submitting") : t("auth.login.submit")}</Button>
      </form>

      <div className="my-5 flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs uppercase tracking-wide text-muted-foreground">{t("common.or")}</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={submitSso}>
        <Button type="submit" variant="outline" className="w-full" loading={ssoLookup.isPending} disabled={!email}>
          <KeyRound className="size-4" /> {t("auth.login.continueWithSso")}
        </Button>
        {ssoLookup.isSuccess && !ssoLookup.data.enabled ? (
          <p className="mt-2 text-center text-xs text-muted-foreground">{t("auth.login.ssoNotConfigured")}</p>
        ) : null}
        {ssoLookup.isError ? <p className="mt-2 text-center text-xs text-danger">{t("auth.login.ssoFailed")}</p> : null}
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">{t("auth.login.noAccount")} <Link className="font-medium text-primary" to="/register">{t("auth.login.createAccount")}</Link></p>
    </AuthShell>
  );
}
