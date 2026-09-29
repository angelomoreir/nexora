import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { FolderItemDto, RetentionMode, SensitivityLevel } from "@nexora/contracts";
import { Shield } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useWorkspace } from "../layout/app-layout";
import { Button, Checkbox, Dialog, Field, Input, Select, useToast } from "../ui";
import { documentsApi } from "../../lib/api";
import { apiErrorText } from "../../lib/api-error";

const SENSITIVITY_LEVELS: SensitivityLevel[] = ["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED"];
const RETENTION_MODES: RetentionMode[] = ["NONE", "RETAIN", "BLOCK_DELETE"];

export function FolderGovernanceDialog({ folder, onClose }: { folder: FolderItemDto; onClose: () => void }) {
  const { t } = useTranslation();
  const { organization } = useWorkspace();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [sensitivity, setSensitivity] = useState<SensitivityLevel>(folder.governance.sensitivity);
  const [retentionMode, setRetentionMode] = useState<RetentionMode>(folder.governance.retentionMode);
  const [retentionDays, setRetentionDays] = useState<string>(folder.governance.retentionDays != null ? String(folder.governance.retentionDays) : "30");
  const [requireApproval, setRequireApproval] = useState<boolean>(folder.governance.requireApproval);

  const save = useMutation({
    mutationFn: () => documentsApi.setFolderGovernance(organization.id, folder.id, {
      sensitivity,
      retentionMode,
      retentionDays: retentionMode === "RETAIN" ? Math.max(1, Number(retentionDays) || 1) : null,
      requireApproval
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["documents", organization.id] });
      toast({ tone: "success", title: t("governance.saved") });
      onClose();
    },
    onError: (error: Error) => toast({ tone: "danger", title: t("governance.errorSaving"), description: apiErrorText(error, t) })
  });

  const sensitivityDescriptions: Record<SensitivityLevel, string> = {
    PUBLIC: t("governance.sensitivityPublicDesc"),
    INTERNAL: t("governance.sensitivityInternalDesc"),
    CONFIDENTIAL: t("governance.sensitivityConfidentialDesc"),
    RESTRICTED: t("governance.sensitivityRestrictedDesc")
  };
  const retentionDescriptions: Record<RetentionMode, string> = {
    NONE: t("governance.retentionNoneDesc"),
    RETAIN: t("governance.retentionRetainDesc"),
    BLOCK_DELETE: t("governance.retentionBlockDesc")
  };

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()} title={t("governance.dialogTitle", { name: folder.name })} description={t("governance.dialogDesc")}
      footer={<><Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button><Button loading={save.isPending} onClick={() => save.mutate()}><Shield />{t("common.save")}</Button></>}>
      <div className="space-y-5">
        {folder.governance.inheritedFrom ? (
          <p className="rounded-md border border-info/25 bg-info-subtle px-3 py-2.5 text-xs text-info">{t("governance.inherited")}</p>
        ) : null}
        <Field label={t("governance.sensitivity")} helper={sensitivityDescriptions[sensitivity]}>
          <Select value={sensitivity} onChange={(event) => setSensitivity(event.target.value as SensitivityLevel)}>
            {SENSITIVITY_LEVELS.map((level) => <option key={level} value={level}>{t(`governance.sensitivity${level === "PUBLIC" ? "Public" : level === "INTERNAL" ? "Internal" : level === "CONFIDENTIAL" ? "Confidential" : "Restricted"}`)}</option>)}
          </Select>
        </Field>
        <Field label={t("governance.retention")} helper={retentionDescriptions[retentionMode]}>
          <Select value={retentionMode} onChange={(event) => setRetentionMode(event.target.value as RetentionMode)}>
            {RETENTION_MODES.map((mode) => <option key={mode} value={mode}>{t(`governance.retention${mode === "NONE" ? "None" : mode === "RETAIN" ? "Retain" : "Block"}`)}</option>)}
          </Select>
        </Field>
        {retentionMode === "RETAIN" ? (
          <Field label={t("governance.retentionDays")} helper={t("governance.retentionDaysHint")} required>
            <Input type="number" min={1} step={1} value={retentionDays} onChange={(event) => setRetentionDays(event.target.value)} />
          </Field>
        ) : null}
        <label className="flex items-start gap-2.5 rounded-md border border-border px-3 py-2.5 text-sm text-secondary-foreground">
          <Checkbox checked={requireApproval} onChange={(event) => setRequireApproval(event.target.checked)} />
          <span><span className="block font-medium text-foreground">{t("governance.requireApproval")}</span><span className="block text-xs text-muted-foreground">{t("governance.requireApprovalDesc")}</span></span>
        </label>
      </div>
    </Dialog>
  );
}
