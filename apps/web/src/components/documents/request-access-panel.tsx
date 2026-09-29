import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, KeyRound, Send } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { useWorkspace } from "../layout/app-layout";
import { Button, EmptyState, Field, Textarea, useToast } from "../ui";
import { accessApi, ApiClientError } from "../../lib/api";
import { apiErrorText } from "../../lib/api-error";

export function RequestAccessPanel({ resourceType, resourceId }: { resourceType: "document" | "folder"; resourceId: string }) {
  const { t } = useTranslation();
  const { organization } = useWorkspace();
  const { toast } = useToast();
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);

  const request = useMutation({
    mutationFn: () => accessApi.request(organization.id, { resourceType, resourceId, message: message.trim() || undefined }),
    onSuccess: () => setSent(true),
    onError: (error: Error) => {
      if (error instanceof ApiClientError && error.code === "ACCESS_REQUEST_PENDING") {
        setSent(true);
        return;
      }
      toast({ tone: "danger", title: t("access.errorRequest"), description: apiErrorText(error, t) });
    }
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    request.mutate();
  }

  if (sent) {
    return (
      <div className="mx-auto max-w-2xl">
        <EmptyState
          icon={KeyRound}
          title={t("access.requestSent")}
          description={t("access.requestSentDesc")}
          action={<Link to="/documents"><Button variant="outline"><ArrowLeft />{t("documents.trash.backToDocuments")}</Button></Link>}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <EmptyState
        icon={KeyRound}
        title={t("access.requestTitle")}
        description={t("access.requestDesc")}
        action={
          <form className="w-full max-w-md space-y-3" onSubmit={submit}>
            <Field label={t("access.messageLabel")}>
              <Textarea rows={3} maxLength={1000} placeholder={t("access.messagePlaceholder")} value={message} onChange={(event) => setMessage(event.target.value)} />
            </Field>
            <div className="flex justify-center gap-2">
              <Button type="submit" loading={request.isPending}><Send />{t("access.sendRequest")}</Button>
              <Link to="/documents"><Button variant="outline" type="button"><ArrowLeft />{t("common.back")}</Button></Link>
            </div>
          </form>
        }
      />
    </div>
  );
}
