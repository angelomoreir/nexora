import { AlertTriangle, CheckCircle, Info, XCircle } from "lucide-react";
import { Alert, Avatar, Badge, Breadcrumb, Button, Card, Checkbox, Dialog, EmptyState, Field, Input, Page, PageHeader, Pagination, Radio, Select, Skeleton, Stat, Switch, Table, TableBody, TableCell, TableContainer, TableHead, TableHeader, TableRow, Tabs, Textarea, Tooltip } from "../components/ui";
import { useState } from "react";
import { useTranslation } from "react-i18next";

const badgeVariants = [
  { variant: "neutral", label: "Neutral" },
  { variant: "primary", label: "Primary" },
  { variant: "success", label: "Success" },
  { variant: "warning", label: "Warning" },
  { variant: "danger", label: "Danger" },
  { variant: "info", label: "Info" },
  { variant: "outline", label: "Outline" }
] as const;

const buttonVariants = [
  { variant: "default", label: "Default" },
  { variant: "outline", label: "Outline" },
  { variant: "ghost", label: "Ghost" },
  { variant: "destructive", label: "Destructive" }
] as const;

const buttonSizes = [
  { size: "sm", label: "Small" },
  { size: "default", label: "Default" },
  { size: "lg", label: "Large" },
  { size: "icon", label: "Icon" }
] as const;

export function DesignSystemPage() {
  const { t } = useTranslation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [tab, setTab] = useState("components");
  const [checkbox, setCheckbox] = useState(true);
  const [switchOn, setSwitchOn] = useState(false);
  const [radio, setRadio] = useState("option1");

  return (
    <Page>
      <Breadcrumb items={[{ label: t("navigation.admin"), href: "/admin" }, { label: "Design System" }]} />
      <PageHeader eyebrow={t("designSystem.eyebrow")} title={t("designSystem.title")} description={t("designSystem.description")} />

      <Tabs
        value={tab}
        onValueChange={setTab}
        items={[
          { value: "components", label: t("designSystem.components") },
          { value: "tokens", label: t("designSystem.tokens") },
          { value: "patterns", label: t("designSystem.patterns") }
        ]}
      />

      {tab === "components" ? (
        <div className="space-y-8">
          {/* Buttons */}
          <Card>
            <h3 className="nx-h3 mb-4 text-foreground">{t("designSystem.buttons")}</h3>
            <div className="space-y-4">
              <div className="flex flex-wrap gap-3">
                {buttonVariants.map(({ variant, label }) => (
                  <Button key={variant} variant={variant}>{label}</Button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {buttonSizes.map(({ size, label }) => (
                  <Button key={size} size={size} variant="outline">{label === "Icon" ? <CheckCircle className="size-4" /> : label}</Button>
                ))}
                <Button disabled>Disabled</Button>
                <Button loading>Loading</Button>
              </div>
            </div>
          </Card>

          {/* Badges */}
          <Card>
            <h3 className="nx-h3 mb-4 text-foreground">{t("designSystem.badges")}</h3>
            <div className="flex flex-wrap gap-2">
              {badgeVariants.map(({ variant, label }) => (
                <Badge key={variant} variant={variant}>{label}</Badge>
              ))}
            </div>
          </Card>

          {/* Form controls */}
          <Card>
            <h3 className="nx-h3 mb-4 text-foreground">{t("designSystem.formControls")}</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Input" htmlFor="ds-input" helper={t("designSystem.helperText")}>
                <Input id="ds-input" placeholder="Placeholder" />
              </Field>
              <Field label="Select" htmlFor="ds-select">
                <Select id="ds-select"><option>{t("designSystem.optionA")}</option><option>{t("designSystem.optionB")}</option></Select>
              </Field>
              <Field label="Textarea" htmlFor="ds-textarea">
                <Textarea id="ds-textarea" placeholder={t("designSystem.longTextPlaceholder")} />
              </Field>
              <Field label={t("designSystem.invalidInput")} htmlFor="ds-input-invalid" error={t("common.requiredField")}>
                <Input id="ds-input-invalid" invalid placeholder={t("designSystem.withError")} />
              </Field>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-6">
              <label className="flex items-center gap-2"><Checkbox checked={checkbox} onChange={(e) => setCheckbox(e.target.checked)} /><span className="text-sm text-secondary-foreground">Checkbox</span></label>
              <label className="flex items-center gap-2"><Switch checked={switchOn} onCheckedChange={setSwitchOn} /><span className="text-sm text-secondary-foreground">Switch</span></label>
              <div className="space-y-1">
                <label className="flex items-center gap-2"><Radio name="ds-radio" value="option1" checked={radio === "option1"} onChange={() => setRadio("option1")} /><span className="text-sm text-secondary-foreground">{t("designSystem.radioA")}</span></label>
                <label className="flex items-center gap-2"><Radio name="ds-radio" value="option2" checked={radio === "option2"} onChange={() => setRadio("option2")} /><span className="text-sm text-secondary-foreground">{t("designSystem.radioB")}</span></label>
              </div>
            </div>
          </Card>

          {/* Alerts */}
          <Card>
            <h3 className="nx-h3 mb-4 text-foreground">{t("designSystem.alerts")}</h3>
            <div className="space-y-3">
              <Alert variant="info"><Info className="size-4" /> {t("common.info")}</Alert>
              <Alert variant="success"><CheckCircle className="size-4" /> {t("common.success")}</Alert>
              <Alert variant="warning"><AlertTriangle className="size-4" /> {t("common.warning")}</Alert>
              <Alert variant="danger"><XCircle className="size-4" /> {t("common.error")}</Alert>
            </div>
          </Card>

          {/* Table */}
          <Card>
            <h3 className="nx-h3 mb-4 text-foreground">{t("designSystem.table")}</h3>
            <TableContainer>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("common.name")}</TableHead>
                    <TableHead>{t("common.status")}</TableHead>
                    <TableHead className="text-right">{t("common.value")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow><TableCell>Item A</TableCell><TableCell><Badge variant="success">{t("common.active")}</Badge></TableCell><TableCell className="text-right">€ 1.000</TableCell></TableRow>
                  <TableRow><TableCell>Item B</TableCell><TableCell><Badge variant="warning">{t("common.pending")}</Badge></TableCell><TableCell className="text-right">€ 2.500</TableCell></TableRow>
                  <TableRow><TableCell>Item C</TableCell><TableCell><Badge variant="danger">{t("admin.inactive")}</Badge></TableCell><TableCell className="text-right">€ 0</TableCell></TableRow>
                </TableBody>
              </Table>
            </TableContainer>
          </Card>

          {/* Other components */}
          <Card>
            <h3 className="nx-h3 mb-4 text-foreground">{t("designSystem.other")}</h3>
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <Avatar name="Américo" src={null} />
                <Skeleton className="h-10 w-40" />
                <Stat label={t("navigation.documents")} value="1.248" />
              </div>
              <Pagination page={2} totalPages={10} onPageChange={() => {}} total={240} />
              <div className="flex gap-2">
                <Tooltip content={t("designSystem.sampleTip")}><Button variant="outline" size="sm">{t("designSystem.hoverTooltip")}</Button></Tooltip>
                <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>{t("designSystem.openDialog")}</Button>
              </div>
              <EmptyState icon={Info} title={t("designSystem.emptyState")} description={t("designSystem.noData")} action={<Button size="sm" variant="outline">{t("designSystem.action")}</Button>} />
            </div>
          </Card>
        </div>
      ) : null}

      {tab === "tokens" ? (
        <div className="space-y-6">
          <Card>
            <h3 className="nx-h3 mb-4 text-foreground">{t("designSystem.brandIdentity")}</h3>
            <div className="flex items-center gap-4">
              <img src="/logo.png" alt="NEXORA" className="size-16 rounded-md object-cover" />
              <div>
                <p className="nx-h3 text-foreground">NEXORA</p>
                <p className="text-sm text-secondary-foreground">{t("auth.slogan")}</p>
              </div>
            </div>
          </Card>

          <Card>
            <h3 className="nx-h3 mb-4 text-foreground">{t("designSystem.semanticColors")}</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[
                { name: "bg-background", class: "bg-background", text: "text-foreground" },
                { name: "bg-surface", class: "bg-surface", text: "text-foreground" },
                { name: "bg-surface-secondary", class: "bg-surface-secondary", text: "text-foreground" },
                { name: "bg-primary", class: "bg-primary", text: "text-primary-foreground" },
                { name: "bg-primary-subtle", class: "bg-primary-subtle", text: "text-primary" },
                { name: "bg-danger-subtle", class: "bg-danger-subtle", text: "text-danger" }
              ].map(({ name, class: cls, text }) => (
                <div key={name} className={`rounded-md border border-border p-4 ${cls}`}>
                  <span className={`text-sm font-medium ${text}`}>{name}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <h3 className="nx-h3 mb-4 text-foreground">{t("designSystem.typography")}</h3>
            <div className="space-y-3">
              <p className="nx-display text-foreground">Display — {t("designSystem.displaySample")}</p>
              <p className="nx-h1 text-foreground">H1 — {t("designSystem.h1Sample")}</p>
              <p className="nx-h2 text-foreground">H2 — {t("designSystem.h2Sample")}</p>
              <p className="nx-h3 text-foreground">H3 — {t("designSystem.h3Sample")}</p>
              <p className="text-foreground">Body — {t("designSystem.bodySample")}</p>
              <p className="text-sm text-secondary-foreground">Body small — {t("designSystem.bodySmallSample")}</p>
              <p className="nx-caption text-muted-foreground">Caption — {t("designSystem.captionSample")}</p>
              <p className="nx-label text-foreground">Label — {t("designSystem.labelSample")}</p>
            </div>
          </Card>

          <Card>
            <h3 className="nx-h3 mb-4 text-foreground">{t("designSystem.bordersRadius")}</h3>
            <div className="flex flex-wrap gap-4">
              <div className="rounded-sm border border-border bg-surface p-6 text-sm text-secondary-foreground">rounded-sm</div>
              <div className="rounded-md border border-border bg-surface p-6 text-sm text-secondary-foreground">rounded-md</div>
              <div className="rounded-lg border border-border bg-surface p-6 text-sm text-secondary-foreground">rounded-lg</div>
            </div>
          </Card>
        </div>
      ) : null}

      {tab === "patterns" ? (
        <div className="space-y-6">
          <Card>
            <h3 className="nx-h3 mb-4 text-foreground">{t("designSystem.pageHeader")}</h3>
            <PageHeader eyebrow={t("designSystem.sampleEyebrow")} title={t("designSystem.sampleTitle")} description={t("designSystem.sampleDesc")} actions={<Button size="sm">{t("designSystem.action")}</Button>} />
          </Card>

          <Card>
            <h3 className="nx-h3 mb-4 text-foreground">{t("designSystem.loadingState")}</h3>
            <div className="space-y-3">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-10 w-2/3" />
            </div>
          </Card>

          <Card>
            <h3 className="nx-h3 mb-4 text-foreground">{t("designSystem.emptyState")}</h3>
            <EmptyState icon={Info} title={t("designSystem.noResults")} description={t("designSystem.noResultsDesc")} action={<Button size="sm" variant="outline">{t("designSystem.createItem")}</Button>} />
          </Card>

          <Card>
            <h3 className="nx-h3 mb-4 text-foreground">{t("designSystem.errorState")}</h3>
            <Alert variant="danger" title={t("designSystem.errorTitle")}>{t("designSystem.errorLoading")}</Alert>
          </Card>
        </div>
      ) : null}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen} title={t("designSystem.sampleDialog")} description={t("designSystem.sampleDialogDesc")} footer={<><Button variant="ghost" onClick={() => setDialogOpen(false)}>{t("common.cancel")}</Button><Button onClick={() => setDialogOpen(false)}>{t("common.confirm")}</Button></>}>
        <p className="text-sm text-secondary-foreground">{t("designSystem.dialogBody")}</p>
      </Dialog>
    </Page>
  );
}
