import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router";
import { UserPlus } from "lucide-react";
import { AuthShell } from "../components/forms/auth-shell";
import { Alert, Button, Field, Input, Skeleton } from "../components/ui";
import { invitationsApi } from "../lib/api";
import { apiErrorText } from "../lib/api-error";

export function AcceptInvitePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");

  const preview = useQuery({
    queryKey: ["invitation-preview", token],
    queryFn: () => invitationsApi.preview(token),
    enabled: Boolean(token),
    retry: false
  });

  const accept = useMutation({
    mutationFn: () => invitationsApi.accept(token, preview.data?.accountExists ? {} : { name, password }),
    onSuccess: async (session) => {
      queryClient.setQueryData(["session"], session);
      await navigate("/dashboard");
    }
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    accept.mutate();
  }

  if (!token || preview.isError) {
    return (
      <AuthShell title={t("invite.invalidTitle")} description={t("invite.invalidDesc")}>
        <Alert variant="danger">{t("invite.invalidMessage")}</Alert>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          <Link className="font-medium text-primary" to="/login">{t("invite.backToLogin")}</Link>
        </p>
      </AuthShell>
    );
  }

  if (preview.isPending || !preview.data) {
    return (
      <AuthShell title={t("invite.loading")} description=" ">
        <div className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-32" />
        </div>
      </AuthShell>
    );
  }

  const invitation = preview.data;

  return (
    <AuthShell
      title={t("invite.title", { organization: invitation.organizationName })}
      description={t("invite.description", { inviter: invitation.inviterName, organization: invitation.organizationName, role: invitation.role })}
    >
      <form className="space-y-5" onSubmit={submit}>
        <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-secondary p-4">
          <UserPlus className="h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{invitation.email}</p>
            <p className="text-xs text-muted-foreground">{invitation.organizationName} · {invitation.role}</p>
          </div>
        </div>
        {!invitation.accountExists ? (
          <>
            <Field label={t("common.name")} htmlFor="invite-name">
              <Input id="invite-name" autoComplete="name" required value={name} onChange={(event) => setName(event.target.value)} />
            </Field>
            <Field label={t("auth.login.password")} htmlFor="invite-password" helper={t("auth.register.passwordHint")}>
              <Input id="invite-password" type="password" autoComplete="new-password" required minLength={12} value={password} onChange={(event) => setPassword(event.target.value)} />
            </Field>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{t("invite.existingAccountHint")}</p>
        )}
        {accept.error ? <Alert variant="danger">{apiErrorText(accept.error, t)}</Alert> : null}
        <Button className="w-full" loading={accept.isPending} type="submit">{t("invite.accept")}</Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        <Link className="font-medium text-primary" to="/login">{t("invite.backToLogin")}</Link>
      </p>
    </AuthShell>
  );
}
