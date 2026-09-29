import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileText, Folder, Lock, Upload } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router";
import { Alert, Button, EmptyState, Input, Skeleton } from "../components/ui";
import { ApiClientError, publicShareApi } from "../lib/api";
import { apiErrorText } from "../lib/api-error";
import { useLocaleFormatter } from "../lib/format";

export function SharedDocumentPage() {
  const { t } = useTranslation();
  const { token = "" } = useParams();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [password, setPassword] = useState("");
  const [activePassword, setActivePassword] = useState<string | undefined>();
  const [browseFolderId, setBrowseFolderId] = useState<string | undefined>();
  const queryKey = ["public-document-share", token, activePassword];
  const share = useQuery({ queryKey, queryFn: () => publicShareApi.get(token, activePassword), retry: false });
  const isFolderShare = share.data?.kind === "folder";
  const canBrowse = isFolderShare && share.data?.permission === "READ";
  const browse = useQuery({ queryKey: ["public-folder-share", token, browseFolderId ?? "root", activePassword], queryFn: () => publicShareApi.browse(token, browseFolderId, activePassword), enabled: Boolean(canBrowse), retry: false });
  const upload = useMutation({ mutationFn: (file: File) => isFolderShare ? publicShareApi.uploadFile(token, file, activePassword) : publicShareApi.uploadVersion(token, file, activePassword), onSuccess: () => { void queryClient.invalidateQueries({ queryKey }); void queryClient.invalidateQueries({ queryKey: ["public-folder-share", token] }); } });
  const { formatBytes, formatDate, formatDateTime } = useLocaleFormatter();

  async function download() {
    const result = await publicShareApi.download(token, activePassword);
    saveBlob(result);
  }
  async function downloadSharedFile(documentId: string) {
    try {
      saveBlob(await publicShareApi.downloadFile(token, documentId, activePassword));
    } catch { /* surfaced via query error handling elsewhere */ }
  }
  function unlock(event: FormEvent) { event.preventDefault(); setActivePassword(password); setBrowseFolderId(undefined); }

  const passwordRequired = share.error instanceof ApiClientError && share.error.code === "SHARE_PASSWORD_REQUIRED";

  return (
    <main className="grid min-h-screen place-items-center bg-background p-5">
      <div className={`w-full overflow-hidden rounded-lg border border-border bg-surface shadow-[var(--nx-shadow-overlay)] ${isFolderShare ? "max-w-3xl" : "max-w-xl"}`}>
        <header className="border-b border-border px-7 py-5">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="NEXORA" className="size-9 rounded-md object-cover" />
            <span className="font-semibold tracking-[0.14em] text-foreground">NEXORA</span>
          </div>
        </header>

        {share.isPending ? <div className="p-12"><Skeleton className="h-32 w-full" /></div> : null}

        {passwordRequired ? (
          <form className="p-8 text-center" onSubmit={unlock}>
            <span className="mx-auto grid size-14 place-items-center rounded-md bg-primary-subtle text-primary"><Lock className="size-6" /></span>
            <h1 className="mt-4 nx-h2 text-foreground">{t("auth.shared.protected")}</h1>
            <p className="mt-1 text-sm text-secondary-foreground">{t("auth.shared.protectedDesc")}</p>
            <Input autoFocus className="mt-5" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
            <Button className="mt-3 w-full" type="submit">{t("auth.shared.open")}</Button>
          </form>
        ) : null}

        {share.error && !passwordRequired ? (
          <div className="p-10">
            <EmptyState icon={Lock} title={t("auth.shared.unavailable")} description={apiErrorText(share.error, t)} />
          </div>
        ) : null}

        {share.data?.kind === "document" ? (
          <div className="p-8">
            <div className="flex items-center gap-4">
              <span className="grid size-16 shrink-0 place-items-center rounded-md bg-primary-subtle text-primary"><FileText className="size-8" /></span>
              <div className="min-w-0">
                <h1 className="truncate nx-h2 text-foreground">{share.data.name}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{formatBytes(share.data.sizeBytes ?? 0)} · {t("auth.shared.availableUntil")} {formatDate(share.data.expiresAt)}</p>
              </div>
            </div>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Button className="flex-1" onClick={() => void download()}><Download className="size-4" />{t("auth.shared.download")}</Button>
              {share.data.permission === "EDIT" ? (
                <Button className="flex-1" variant="outline" onClick={() => fileInput.current?.click()} disabled={upload.isPending}><Upload className="size-4" />{upload.isPending ? t("common.loading") : t("auth.shared.uploadNewVersion")}</Button>
              ) : null}
              <input ref={fileInput} className="hidden" type="file" onChange={(event) => { const file = event.target.files?.[0]; if (file) upload.mutate(file); event.target.value = ""; }} />
            </div>
            {upload.error ? <Alert variant="danger" className="mt-4">{apiErrorText(upload.error, t)}</Alert> : null}
            {upload.isSuccess ? <Alert variant="success" className="mt-4">{t("auth.shared.uploadSuccess")}</Alert> : null}
          </div>
        ) : null}

        {share.data?.kind === "folder" ? (
          <div className="p-8">
            <div className="flex items-center gap-4">
              <span className="grid size-16 shrink-0 place-items-center rounded-md bg-warning-subtle text-warning"><Folder className="size-8" /></span>
              <div className="min-w-0">
                <h1 className="truncate nx-h2 text-foreground">{share.data.name}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{share.data.permission === "UPLOAD" ? t("auth.shared.fileRequest") : t("auth.shared.folderShare")} · {t("auth.shared.availableUntil")} {formatDate(share.data.expiresAt)}</p>
              </div>
            </div>

            {share.data.permission === "UPLOAD" ? (
              <div className="mt-7">
                <p className="text-sm text-secondary-foreground">{t("auth.shared.fileRequestDesc")}</p>
                <Button className="mt-4 w-full" onClick={() => fileInput.current?.click()} disabled={upload.isPending}><Upload className="size-4" />{upload.isPending ? t("common.loading") : t("auth.shared.uploadFiles")}</Button>
                <input ref={fileInput} className="hidden" type="file" onChange={(event) => { const file = event.target.files?.[0]; if (file) upload.mutate(file); event.target.value = ""; }} />
                {upload.error ? <Alert variant="danger" className="mt-4">{apiErrorText(upload.error, t)}</Alert> : null}
                {upload.isSuccess ? <Alert variant="success" className="mt-4">{t("auth.shared.uploadSuccess")}</Alert> : null}
              </div>
            ) : null}

            {share.data.permission === "READ" ? (
              <div className="mt-6">
                {browse.isPending ? <Skeleton className="h-40 w-full" /> : null}
                {browse.error ? <Alert variant="danger">{apiErrorText(browse.error, t)}</Alert> : null}
                {browse.data ? (
                  <>
                    {browse.data.breadcrumbs.length > 1 || browseFolderId ? (
                      <div className="mb-3 flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
                        {browse.data.breadcrumbs.map((crumb, index) => (
                          <span key={crumb.id ?? "root"} className="flex items-center gap-1">
                            {index > 0 ? <span>/</span> : null}
                            <button type="button" className="hover:text-foreground hover:underline" onClick={() => setBrowseFolderId(crumb.id ?? undefined)}>{crumb.name}</button>
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {browse.data.items.length === 0 ? <EmptyState icon={Folder} title={t("auth.shared.emptyFolder")} /> : (
                      <ul className="divide-y divide-border rounded-md border border-border">
                        {browse.data.items.map((item) => (
                          <li key={`${item.kind}:${item.id}`}>
                            <button type="button" className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-secondary" onClick={() => item.kind === "folder" ? setBrowseFolderId(item.id) : void downloadSharedFile(item.id)}>
                              {item.kind === "folder" ? <Folder className="size-4 shrink-0 text-warning" /> : <FileText className="size-4 shrink-0 text-primary" />}
                              <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{item.name}</span>
                              <span className="text-xs text-muted-foreground">{item.sizeBytes !== null ? formatBytes(item.sizeBytes) : t("auth.shared.folder")}</span>
                              <span className="hidden text-xs text-muted-foreground sm:block">{formatDateTime(item.updatedAt)}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </main>
  );
}

function saveBlob(result: { blob: Blob; name: string }) { const url = URL.createObjectURL(result.blob); const anchor = window.document.createElement("a"); anchor.href = url; anchor.download = result.name; anchor.click(); URL.revokeObjectURL(url); }
