import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { isRouteErrorResponse, useRouteError } from "react-router";
import { Button } from "../components/ui/button";

export function RouteErrorPage() {
  const { t } = useTranslation();
  const error = useRouteError();
  console.error("Route error:", error);

  const detail = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : null;

  return (
    <div className="grid min-h-screen place-items-center bg-background px-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-8 text-center shadow-sm">
        <div className="mx-auto grid size-12 place-items-center rounded-full bg-danger-subtle text-danger">
          <AlertTriangle className="size-6" />
        </div>
        <h1 className="nx-h2 mt-5">{t("errorBoundary.title")}</h1>
        <p className="mt-2 text-sm leading-6 text-secondary-foreground">{t("errorBoundary.description")}</p>
        {detail ? (
          <p className="mt-3 rounded-md bg-surface-secondary px-3 py-2 font-mono text-xs text-muted-foreground">{detail}</p>
        ) : null}
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button onClick={() => window.location.reload()}>{t("errorBoundary.reload")}</Button>
          <Button variant="outline" onClick={() => { window.location.href = "/"; }}>{t("errorBoundary.goHome")}</Button>
        </div>
      </div>
    </div>
  );
}
