import { CheckCircle2, Clock3, Loader2, X, XCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui";

export type UploadStatus = "pending" | "uploading" | "done" | "error";

export interface UploadQueueItem {
  id: string;
  name: string;
  path?: string;
  status: UploadStatus;
}

export interface DroppedFile {
  file: File;
  path?: string;
}

/**
 * Walks DataTransfer entries (files AND directories) and returns a flat list of
 * files. Files inside directories carry the relative directory path so the
 * backend can recreate the folder chain.
 */
export async function collectDroppedFiles(dataTransfer: DataTransfer): Promise<DroppedFile[]> {
  const entries = Array.from(dataTransfer.items)
    .map((item) => (item.kind === "file" ? item.webkitGetAsEntry() : null))
    .filter((entry): entry is FileSystemEntry => Boolean(entry));

  if (entries.length === 0) {
    return Array.from(dataTransfer.files).map((file) => ({ file }));
  }

  const results: DroppedFile[] = [];

  async function readFile(entry: FileSystemFileEntry): Promise<File> {
    return new Promise<File>((resolve, reject) => entry.file(resolve, reject));
  }

  async function readAllEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
    const collected: FileSystemEntry[] = [];
    // readEntries returns batches (typically max 100); loop until empty.
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
      if (batch.length === 0) break;
      collected.push(...batch);
    }
    return collected;
  }

  async function walk(entry: FileSystemEntry, directoryPath: string): Promise<void> {
    if (entry.isFile) {
      const file = await readFile(entry as FileSystemFileEntry);
      results.push({ file, path: directoryPath || undefined });
      return;
    }
    if (entry.isDirectory) {
      const children = await readAllEntries((entry as FileSystemDirectoryEntry).createReader());
      const childPath = directoryPath ? `${directoryPath}/${entry.name}` : entry.name;
      for (const child of children) await walk(child, childPath);
    }
  }

  for (const entry of entries) {
    await walk(entry, "");
  }
  return results;
}

/** Directory portion of a webkitRelativePath (e.g. "acme/contracts/f.pdf" -> "acme/contracts"). */
export function directoryOf(relativePath: string): string | undefined {
  const normalized = relativePath.replaceAll("\\", "/");
  const index = normalized.lastIndexOf("/");
  return index > 0 ? normalized.slice(0, index) : undefined;
}

export function UploadQueuePanel({ items, onDismiss }: { items: UploadQueueItem[]; onDismiss: () => void }) {
  const { t } = useTranslation();
  if (items.length === 0) return null;
  const done = items.filter((item) => item.status === "done" || item.status === "error").length;
  const active = items.some((item) => item.status === "pending" || item.status === "uploading");

  return (
    <div className="fixed bottom-4 right-4 z-[60] flex w-[min(22rem,calc(100vw-2rem))] flex-col rounded-lg border border-border bg-surface shadow-[var(--nx-shadow-overlay)]" role="status" aria-live="polite">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{t("documents.uploadQueueTitle")}</p>
          <p className="text-xs text-muted-foreground">{t("documents.uploadQueueProgress", { done, total: items.length })}</p>
        </div>
        <Button variant="ghost" size="icon-sm" aria-label={t("common.close")} onClick={onDismiss} title={active ? t("documents.uploadQueueHide") : t("common.close")}>
          <X />
        </Button>
      </header>
      <ul className="max-h-56 overflow-y-auto p-2">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-2.5 rounded-sm px-2 py-1.5 text-sm">
            <UploadStatusIcon status={item.status} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-secondary-foreground">{item.name}</span>
              {item.path ? <span className="block truncate text-xs text-muted-foreground">{item.path}</span> : null}
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">{statusLabel(t, item.status)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function UploadStatusIcon({ status }: { status: UploadStatus }) {
  switch (status) {
    case "uploading":
      return <Loader2 className="size-4 shrink-0 animate-spin text-primary" />;
    case "done":
      return <CheckCircle2 className="size-4 shrink-0 text-success" />;
    case "error":
      return <XCircle className="size-4 shrink-0 text-danger" />;
    default:
      return <Clock3 className="size-4 shrink-0 text-muted-foreground" />;
  }
}

function statusLabel(t: (key: string) => string, status: UploadStatus): string {
  switch (status) {
    case "uploading":
      return t("documents.uploadStatusUploading");
    case "done":
      return t("documents.uploadStatusDone");
    case "error":
      return t("documents.uploadStatusError");
    default:
      return t("common.pending");
  }
}
