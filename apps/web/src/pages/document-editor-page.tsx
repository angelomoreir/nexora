import type { DocumentItemDto, EditorDocumentKind } from "@nexora/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlignCenter, AlignJustify, AlignLeft, AlignRight, ArrowDownAZ, ArrowLeft, ArrowUpZA,
  BarChart3, Bold, Download, FileText, FileUp, Highlighter, Image as ImageIcon, Italic, Link2, Link2Off,
  List, ListOrdered, ListTodo, Minus, Palette, Pencil, Plus, Printer, Redo2, Save,
  Strikethrough, Table2, Table as TableIcon, Trash2, Underline, Undo2, Zap
} from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TableKit } from "@tiptap/extension-table";
import { TaskList } from "@tiptap/extension-task-list";
import { TaskItem } from "@tiptap/extension-task-item";
import { Image } from "@tiptap/extension-image";
import { Highlight } from "@tiptap/extension-highlight";
import { TextAlign } from "@tiptap/extension-text-align";
import { TextStyleKit } from "@tiptap/extension-text-style";
import { CharacterCount, Placeholder } from "@tiptap/extensions";
import { columnIndex, columnName, displayValue, evaluateSheet, SUPPORTED_FUNCTIONS, type SheetFunction } from "../lib/sheet-formula";
import { useWorkspace } from "../components/layout/app-layout";
import { Alert, Badge, Breadcrumb, Button, Dialog, Dropdown, DropdownItem, Input, Select, Skeleton, useToast } from "../components/ui";
import { analyticsApi, ApiClientError, dashboardApi, documentsApi, formsApi, listsApi, tasksApi } from "../lib/api";
import { apiErrorText } from "../lib/api-error";
import { cn } from "../lib/utils";

type SaveState = "idle" | "saved" | "dirty" | "saving";

// ---------- Nexora sheet functions (live org data in formulas) ----------

const NEXORA_SHEET_DATA = {
  tasks: { total: 0, byStatus: {} as Record<string, number>, overdue: 0 },
  lists: 0,
  forms: 0,
  documents: 0
};

const TASK_STATUS_ALIASES: Record<string, string[]> = {
  TODO: ["TODO"], "POR FAZER": ["TODO"],
  IN_PROGRESS: ["IN_PROGRESS"], "EM CURSO": ["IN_PROGRESS"], "EM PROGRESSO": ["IN_PROGRESS"], "EM_PROGRESSO": ["IN_PROGRESS"],
  IN_REVIEW: ["IN_REVIEW"], "EM REVISAO": ["IN_REVIEW"], "EM REVISÃO": ["IN_REVIEW"], "EM_ANALISE": ["IN_REVIEW"],
  DONE: ["DONE"], CONCLUIDAS: ["DONE"], "CONCLUÍDAS": ["DONE"], CONCLUIDO: ["DONE"], "CONCLUÍDO": ["DONE"], FECHADAS: ["DONE"],
  CANCELLED: ["CANCELLED"], CANCELADAS: ["CANCELLED"],
  OPEN: ["TODO", "IN_PROGRESS", "IN_REVIEW"], ABERTAS: ["TODO", "IN_PROGRESS", "IN_REVIEW"], ABERTO: ["TODO", "IN_PROGRESS", "IN_REVIEW"], ATIVAS: ["TODO", "IN_PROGRESS", "IN_REVIEW"], ACTIVE: ["TODO", "IN_PROGRESS", "IN_REVIEW"]
};

const NEXORA_FUNCTIONS: Record<string, SheetFunction> = {
  TASKSCOUNT: ([status]) => {
    if (status === undefined || status === null || status === "") return NEXORA_SHEET_DATA.tasks.total;
    const statuses = TASK_STATUS_ALIASES[String(status).toUpperCase()] ?? [String(status).toUpperCase()];
    return statuses.reduce((sum, key) => sum + (NEXORA_SHEET_DATA.tasks.byStatus[key] ?? 0), 0);
  },
  TASKSOVERDUE: () => NEXORA_SHEET_DATA.tasks.overdue,
  LISTSCOUNT: () => NEXORA_SHEET_DATA.lists,
  FORMCOUNT: () => NEXORA_SHEET_DATA.forms,
  DOCSCOUNT: () => NEXORA_SHEET_DATA.documents
};

export function DocumentEditorPage() {
  const { t } = useTranslation();
  const { id = "" } = useParams();
  const { organization } = useWorkspace();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const detail = useQuery({ queryKey: ["document", organization.id, id], queryFn: () => documentsApi.get(organization.id, id) });
  const editorDoc = detail.data?.document.documentKind === "DOC" || detail.data?.document.documentKind === "SHEET" ? detail.data.document : null;
  const content = useQuery({
    queryKey: ["document-editor", organization.id, id],
    queryFn: () => documentsApi.getEditorContent(organization.id, id),
    enabled: Boolean(editorDoc)
  });

  const save = useMutation({
    mutationFn: (payload: { content: unknown; plainText?: string }) => documentsApi.saveEditorContent(organization.id, id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["document", organization.id, id] });
      await queryClient.invalidateQueries({ queryKey: ["documents", organization.id] });
    },
    onError: (error: Error) => {
      let title = t("editor.saveError");
      if (error instanceof ApiClientError && error.code === "DOCUMENT_CHECKED_OUT") title = t("documents.checkedOutError");
      toast({ tone: "danger", title, description: apiErrorText(error, t) });
    }
  });

  const rename = useMutation({
    mutationFn: ({ item, baseName }: { item: DocumentItemDto; baseName: string }) => documentsApi.rename(organization.id, item, `${baseName}.${item.extension}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["document", organization.id, id] });
      await queryClient.invalidateQueries({ queryKey: ["documents", organization.id] });
      toast({ tone: "success", title: t("documents.documentRenamed") });
    },
    onError: (error: Error) => toast({ tone: "danger", title: t("documents.errorRenamingDocument"), description: apiErrorText(error, t) })
  });

  const saveVersion = useMutation({
    mutationFn: ({ doc, snapshot }: { doc: DocumentItemDto; snapshot: unknown }) => {
      const file = new File([JSON.stringify(snapshot)], doc.name, { type: doc.mimeType });
      return documentsApi.uploadVersion(organization.id, doc.id, file, "minor");
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["document", organization.id, id] });
      toast({ tone: "success", title: t("documents.newVersionAdded") });
    },
    onError: (error: Error) => toast({ tone: "danger", title: t("documents.errorAddingVersion"), description: apiErrorText(error, t) })
  });

  if (detail.isPending || (editorDoc && content.isPending)) return <div className="mx-auto max-w-6xl space-y-4 p-2"><Skeleton className="h-8 w-64" /><Skeleton className="h-10 w-full" /><Skeleton className="h-[60vh] w-full" /></div>;
  if (detail.isError) return <div className="mx-auto max-w-3xl"><Alert variant="danger" title={t("documents.openError")}><p>{apiErrorText(detail.error, t)}</p><Link to="/documents"><Button className="mt-4" variant="outline"><ArrowLeft />{t("documents.trash.backToDocuments")}</Button></Link></Alert></div>;
  if (!editorDoc) return <div className="mx-auto max-w-3xl"><Alert variant="warning" title={t("editor.notEditorDocument")}><p>{t("editor.notEditorDocumentDesc")}</p><Link to={`/documents/${id}`}><Button className="mt-4" variant="outline"><ArrowLeft />{t("editor.openDetails")}</Button></Link></Alert></div>;
  if (content.isError) return <div className="mx-auto max-w-3xl"><Alert variant="danger" title={t("editor.loadError")}><p>{apiErrorText(content.error, t)}</p></Alert></div>;

  const document = editorDoc;
  const canEdit = document.permissions.edit && !document.checkedOut;
  const breadcrumbs = [...detail.data!.breadcrumbs.map((crumb) => ({ label: crumb.name, href: crumb.id ? `/documents?folder=${crumb.id}` : "/documents" })), { label: document.name }];
  const shared = {
    organizationId: organization.id,
    document,
    canEdit,
    saving: save.isPending || rename.isPending || saveVersion.isPending,
    onSave: (payload: { content: unknown; plainText?: string }) => save.mutate(payload),
    onBack: () => navigate(`/documents/${id}`),
    onRename: (baseName: string) => rename.mutate({ item: document, baseName }),
    onSnapshot: (snapshot: unknown) => saveVersion.mutate({ doc: document, snapshot })
  };

  return (
    <div className="mx-auto flex w-full max-w-[90rem] flex-col gap-4">
      <Breadcrumb items={breadcrumbs} />
      {document.documentKind === "DOC" ? <DocEditor {...shared} content={content.data!.content} /> : <SheetEditor {...shared} content={content.data!.content} />}
    </div>
  );
}

interface SharedProps {
  organizationId: string;
  document: DocumentItemDto;
  canEdit: boolean;
  saving: boolean;
  onSave: (payload: { content: unknown; plainText?: string }) => void;
  onBack: () => void;
  onRename: (baseName: string) => void;
  onSnapshot: (snapshot: unknown) => void;
}

function EditableTitle({ document, canEdit, onRename }: { document: DocumentItemDto; canEdit: boolean; onRename: (baseName: string) => void }) {
  const { t } = useTranslation();
  const baseName = document.name.replace(/\.(nxdoc|nxsheet)$/i, "");
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(baseName);
  useEffect(() => { if (!editing) setValue(baseName); }, [baseName, editing]);

  if (!canEdit) return <h1 className="nx-h1 truncate">{baseName}</h1>;
  if (!editing) {
    return (
      <button type="button" title={t("editor.renameTitle")} onClick={() => { setValue(baseName); setEditing(true); }}
        className="nx-focus-ring nx-h1 group -ml-1 flex min-w-0 items-center gap-2 rounded-sm px-1 text-left hover:bg-surface-secondary">
        <span className="truncate">{baseName}</span>
        <Pencil className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </button>
    );
  }
  const submit = () => {
    const next = value.trim();
    setEditing(false);
    if (next && next !== baseName) onRename(next);
  };
  return (
    <input
      autoFocus
      aria-label={t("editor.renameTitle")}
      className="nx-focus-ring nx-h1 -ml-1 min-w-0 flex-1 rounded-sm border border-primary bg-surface px-1"
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onBlur={submit}
      onKeyDown={(event) => {
        if (event.key === "Enter") { event.preventDefault(); submit(); }
        if (event.key === "Escape") { setValue(baseName); setEditing(false); }
      }}
    />
  );
}

function EditorHeader({ document, kind, canEdit, saveState, onBack, onSave, onRename, extra }: { document: DocumentItemDto; kind: EditorDocumentKind; canEdit: boolean; saveState: SaveState; onBack: () => void; onSave: () => void; onRename: (baseName: string) => void; extra?: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <header className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <span className={cn("grid size-10 shrink-0 place-items-center rounded-md", kind === "DOC" ? "bg-primary-subtle text-primary-subtle-foreground" : "bg-success-subtle text-success")}>{kind === "DOC" ? <FileText className="size-5" /> : <Table2 className="size-5" />}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <EditableTitle document={document} canEdit={canEdit} onRename={onRename} />
            <Badge variant="outline">{kind === "DOC" ? "Nexora Docs" : "Nexora Sheets"}</Badge>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {saveState === "saving" ? t("editor.saving") : saveState === "dirty" ? t("editor.unsaved") : saveState === "saved" ? t("editor.saved") : t("editor.ready")}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {extra}
        <Button variant="outline" onClick={onBack}><ArrowLeft />{t("editor.details")}</Button>
        {canEdit ? <Button onClick={onSave} loading={saveState === "saving"}><Save />{t("common.save")}</Button> : null}
      </div>
    </header>
  );
}

// ---------- Nexora Docs (rich text) ----------

type SlashCmd = { key: string; icon: React.ReactNode; run: (chain: ReturnType<typeof buildChain>) => void };
function buildChain(editor: NonNullable<ReturnType<typeof useEditor>>) { return editor.chain().focus(); }

const TOOL_BTN = "nx-focus-ring rounded-sm px-2 py-1.5 text-secondary-foreground hover:bg-surface-secondary hover:text-foreground disabled:opacity-[var(--nx-disabled-opacity)]";
const TOOL_ACTIVE = "bg-primary-subtle text-primary-subtle-foreground";
const ToolbarSep = () => <span className="mx-1 h-5 w-px self-center bg-border" />;

function DocEditor({ document, content, canEdit, saving, onSave, onBack, onRename, onSnapshot }: SharedProps & { content: unknown }) {
  const { t } = useTranslation();
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [slash, setSlash] = useState<{ pos: number; query: string; left: number; top: number } | null>(null);
  const dirtyRef = useRef(false);
  const editedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const imageInputId = useId();
  const pickImage = useCallback(() => {
    (window.document.getElementById(imageInputId) as HTMLInputElement | null)?.click();
  }, [imageInputId]);

  const editor = useEditor({
    extensions: [
      StarterKit,
      TableKit,
      TaskList,
      TaskItem.configure({ nested: true }),
      Image,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TextStyleKit,
      CharacterCount,
      Placeholder.configure({ placeholder: () => t("editor.placeholder") })
    ],
    content: content as Record<string, unknown>,
    editable: canEdit,
    editorProps: {
      handlePaste: (view, event) => {
        const file = Array.from(event.clipboardData?.files ?? []).find((f) => f.type.startsWith("image/"));
        if (!file) return false;
        const reader = new FileReader();
        reader.onload = () => {
          const { state, dispatch } = view;
          const node = state.schema.nodes.image?.create({ src: reader.result });
          if (node) dispatch(state.tr.replaceSelectionWith(node));
        };
        reader.readAsDataURL(file);
        return true;
      }
    },
    onUpdate: () => {
      dirtyRef.current = true;
      editedRef.current = true;
      setSaveState("dirty");
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => doSave(), 1500);
    },
    onSelectionUpdate: ({ editor: e }) => {
      const $from = e.state.selection.$from;
      const before = $from.parent.textBetween(0, $from.parentOffset, "\0", " ");
      const match = /\/([a-z]*)$/i.exec(before);
      if (match && canEdit && $from.parent.type.name === "paragraph") {
        const coords = e.view.coordsAtPos($from.pos);
        setSlash({ pos: $from.pos - match[0].length, query: match[1]!.toLowerCase(), left: coords.left, top: coords.bottom + 4 });
      } else setSlash(null);
    }
  });

  const doSave = useCallback(() => {
    if (!editor || !dirtyRef.current) return;
    dirtyRef.current = false;
    onSave({ content: editor.getJSON(), plainText: editor.getText() });
  }, [editor, onSave]);

  const slashCommands = useMemo<SlashCmd[]>(() => editor ? [
    { key: "paragraph", icon: <Minus className="size-4" />, run: (c) => c.setParagraph().run() },
    { key: "heading1", icon: <span className="text-xs font-bold">H1</span>, run: (c) => c.setHeading({ level: 1 }).run() },
    { key: "heading2", icon: <span className="text-xs font-bold">H2</span>, run: (c) => c.setHeading({ level: 2 }).run() },
    { key: "heading3", icon: <span className="text-xs font-bold">H3</span>, run: (c) => c.setHeading({ level: 3 }).run() },
    { key: "bulletList", icon: <List className="size-4" />, run: (c) => c.toggleBulletList().run() },
    { key: "orderedList", icon: <ListOrdered className="size-4" />, run: (c) => c.toggleOrderedList().run() },
    { key: "taskList", icon: <ListTodo className="size-4" />, run: (c) => c.toggleTaskList().run() },
    { key: "quote", icon: <span className="text-sm">❝</span>, run: (c) => c.toggleBlockquote().run() },
    { key: "codeBlock", icon: <span className="font-mono text-xs">{"</>"}</span>, run: (c) => c.toggleCodeBlock().run() },
    { key: "table", icon: <TableIcon className="size-4" />, run: (c) => c.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
    { key: "horizontalRule", icon: <Minus className="size-4" />, run: (c) => c.setHorizontalRule().run() },
    { key: "image", icon: <ImageIcon className="size-4" />, run: () => pickImage() }
  ] : [], [editor, pickImage]);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);
  useEffect(() => { if (!saving && editedRef.current) setSaveState(dirtyRef.current ? "dirty" : "saved"); }, [saving]);
  useEffect(() => { const close = () => setSlash(null); window.addEventListener("scroll", close, true); return () => window.removeEventListener("scroll", close, true); }, []);

  const state = useEditorState({ editor, selector: (ctx) => ctx.editor ? {
    bold: ctx.editor.isActive("bold"),
    italic: ctx.editor.isActive("italic"),
    underline: ctx.editor.isActive("underline"),
    strike: ctx.editor.isActive("strike"),
    code: ctx.editor.isActive("code"),
    highlight: ctx.editor.isActive("highlight"),
    link: ctx.editor.isActive("link"),
    h1: ctx.editor.isActive("heading", { level: 1 }),
    h2: ctx.editor.isActive("heading", { level: 2 }),
    h3: ctx.editor.isActive("heading", { level: 3 }),
    bullet: ctx.editor.isActive("bulletList"),
    ordered: ctx.editor.isActive("orderedList"),
    task: ctx.editor.isActive("taskList"),
    quote: ctx.editor.isActive("blockquote"),
    codeBlock: ctx.editor.isActive("codeBlock"),
    table: ctx.editor.isActive("table"),
    alignLeft: ctx.editor.isActive({ textAlign: "left" }),
    alignCenter: ctx.editor.isActive({ textAlign: "center" }),
    alignRight: ctx.editor.isActive({ textAlign: "right" }),
    alignJustify: ctx.editor.isActive({ textAlign: "justify" })
  } : null });

  if (!editor || !state) return <Skeleton className="h-[60vh] w-full" />;

  const btn = (active: boolean, label: string, action: () => void, icon: React.ReactNode) => (
    <button key={label} type="button" disabled={!canEdit} aria-pressed={active} title={label} aria-label={label} onClick={action}
      className={cn(TOOL_BTN, active && TOOL_ACTIVE)}>{icon}</button>
  );

  const insertImage = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => editor.chain().focus().setImage({ src: reader.result as string }).run();
    reader.readAsDataURL(file);
  };

  const setLink = () => {
    if (state.link) { editor.chain().focus().unsetLink().run(); return; }
    const url = window.prompt(t("editor.linkPrompt"), "https://");
    if (url) editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  const exportDoc = () => {
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${document.name}</title><style>body{font-family:system-ui,sans-serif;line-height:1.7;max-width:48rem;margin:2rem auto;padding:0 1rem}table{border-collapse:collapse;width:100%}td,th{border:1px solid #999;padding:.4rem .7rem}blockquote{border-left:3px solid #ccc;padding-left:1em;color:#555}pre{background:#f4f4f4;padding:.8em;border-radius:6px}img{max-width:100%}ul[data-type="taskList"]{list-style:none;padding-left:0}ul[data-type="taskList"] li{display:flex;gap:.5em}</style></head><body><h1>${document.name.replace(/\.nxdoc$/i, "")}</h1>${editor.getHTML()}</body></html>`;
    const blob = new Blob([html], { type: "application/msword" });
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = `${document.name.replace(/\.nxdoc$/i, "")}.doc`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const printPdf = () => {
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${document.name}</title><style>body{font-family:system-ui,sans-serif;line-height:1.7;max-width:48rem;margin:2rem auto;padding:0 1rem}table{border-collapse:collapse;width:100%}td,th{border:1px solid #999;padding:.4rem .7rem}blockquote{border-left:3px solid #ccc;padding-left:1em;color:#555}pre{background:#f4f4f4;padding:.8em;border-radius:6px}img{max-width:100%}ul[data-type="taskList"]{list-style:none;padding-left:0}ul[data-type="taskList"] li{display:flex;gap:.5em}</style></head><body><h1>${document.name.replace(/\.nxdoc$/i, "")}</h1>${editor.getHTML()}</body></html>`);
    win.document.close();
    win.focus();
    win.print();
  };

  const filteredSlash = slash ? slashCommands.filter((cmd) => t(`editor.${cmd.key}`).toLowerCase().includes(slash.query)) : [];
  const wordCount = editor.storage.characterCount?.words() ?? 0;
  const charCount = editor.storage.characterCount?.characters() ?? 0;

  return (
    <>
      <EditorHeader document={document} kind="DOC" canEdit={canEdit} saveState={saving ? "saving" : saveState} onBack={onBack} onSave={doSave} onRename={onRename}
        extra={<>
          {canEdit ? <Button variant="outline" onClick={() => onSnapshot(editor.getJSON())}><Save />{t("editor.saveVersion")}</Button> : null}
          <Dropdown trigger={<Button variant="outline"><Download />{t("editor.export")}</Button>}>
            <DropdownItem onClick={printPdf}><Printer className="size-4" />{t("editor.exportPdf")}</DropdownItem>
            <DropdownItem onClick={exportDoc}><FileText className="size-4" />{t("editor.exportDoc")}</DropdownItem>
          </Dropdown>
        </>} />

      <div className="flex flex-wrap items-center gap-0.5 rounded-md border border-border bg-surface p-1" role="toolbar" aria-label={t("editor.toolbar")}>
        {btn(false, t("editor.undo"), () => editor.chain().focus().undo().run(), <Undo2 className="size-4" />)}
        {btn(false, t("editor.redo"), () => editor.chain().focus().redo().run(), <Redo2 className="size-4" />)}
        <ToolbarSep />
        {btn(state.bold, t("editor.bold"), () => editor.chain().focus().toggleBold().run(), <Bold className="size-4" />)}
        {btn(state.italic, t("editor.italic"), () => editor.chain().focus().toggleItalic().run(), <Italic className="size-4" />)}
        {btn(state.underline, t("editor.underline"), () => editor.chain().focus().toggleUnderline().run(), <Underline className="size-4" />)}
        {btn(state.strike, t("editor.strike"), () => editor.chain().focus().toggleStrike().run(), <Strikethrough className="size-4" />)}
        {btn(state.code, t("editor.inlineCode"), () => editor.chain().focus().toggleCode().run(), <span className="font-mono text-xs">{"</>"}</span>)}
        {btn(state.highlight, t("editor.highlight"), () => editor.chain().focus().toggleHighlight().run(), <Highlighter className="size-4" />)}
        <label title={t("editor.textColor")} className={cn(TOOL_BTN, "relative cursor-pointer")} aria-label={t("editor.textColor")}>
          <Palette className="size-4" />
          <input type="color" className="absolute inset-0 size-full cursor-pointer opacity-0" disabled={!canEdit}
            onChange={(event) => editor.chain().focus().setColor(event.target.value).run()} />
        </label>
        <ToolbarSep />
        {btn(state.h1, t("editor.heading1"), () => editor.chain().focus().toggleHeading({ level: 1 }).run(), <span className="text-xs font-bold">H1</span>)}
        {btn(state.h2, t("editor.heading2"), () => editor.chain().focus().toggleHeading({ level: 2 }).run(), <span className="text-xs font-bold">H2</span>)}
        {btn(state.h3, t("editor.heading3"), () => editor.chain().focus().toggleHeading({ level: 3 }).run(), <span className="text-xs font-bold">H3</span>)}
        <ToolbarSep />
        {btn(state.alignLeft, t("editor.alignLeft"), () => editor.chain().focus().setTextAlign("left").run(), <AlignLeft className="size-4" />)}
        {btn(state.alignCenter, t("editor.alignCenter"), () => editor.chain().focus().setTextAlign("center").run(), <AlignCenter className="size-4" />)}
        {btn(state.alignRight, t("editor.alignRight"), () => editor.chain().focus().setTextAlign("right").run(), <AlignRight className="size-4" />)}
        {btn(state.alignJustify, t("editor.alignJustify"), () => editor.chain().focus().setTextAlign("justify").run(), <AlignJustify className="size-4" />)}
        <ToolbarSep />
        {btn(state.bullet, t("editor.bulletList"), () => editor.chain().focus().toggleBulletList().run(), <List className="size-4" />)}
        {btn(state.ordered, t("editor.orderedList"), () => editor.chain().focus().toggleOrderedList().run(), <ListOrdered className="size-4" />)}
        {btn(state.task, t("editor.taskList"), () => editor.chain().focus().toggleTaskList().run(), <ListTodo className="size-4" />)}
        <ToolbarSep />
        {btn(state.quote, t("editor.quote"), () => editor.chain().focus().toggleBlockquote().run(), <span className="text-sm">❝</span>)}
        {btn(state.codeBlock, t("editor.codeBlock"), () => editor.chain().focus().toggleCodeBlock().run(), <span className="font-mono text-xs">{"{ }"}</span>)}
        {btn(false, t("editor.horizontalRule"), () => editor.chain().focus().setHorizontalRule().run(), <Minus className="size-4" />)}
        <ToolbarSep />
        {btn(state.link, state.link ? t("editor.unlink") : t("editor.insertLink"), setLink, state.link ? <Link2Off className="size-4" /> : <Link2 className="size-4" />)}
        {btn(false, t("editor.insertImage"), pickImage, <ImageIcon className="size-4" />)}
        {btn(state.table, t("editor.table"), () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(), <TableIcon className="size-4" />)}
        {state.table && canEdit ? <>
          {btn(false, t("editor.addRow"), () => editor.chain().focus().addRowAfter().run(), <span className="text-xs">+R</span>)}
          {btn(false, t("editor.addColumn"), () => editor.chain().focus().addColumnAfter().run(), <span className="text-xs">+C</span>)}
          {btn(false, t("editor.deleteTable"), () => editor.chain().focus().deleteTable().run(), <Trash2 className="size-4" />)}
        </> : null}
        <input id={imageInputId} type="file" accept="image/*" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) insertImage(file); event.target.value = ""; }} />
      </div>

      <div className="relative rounded-lg border border-border bg-surface">
        <EditorContent editor={editor} className="nx-doc-editor min-h-[60vh] px-6 py-5 sm:px-10" />
        {slash && filteredSlash.length ? (
          <div role="menu" className="fixed z-[70] w-56 overflow-y-auto rounded-md border border-border bg-surface p-1 shadow-[var(--nx-shadow-overlay)]" style={{ left: slash.left, top: slash.top, maxHeight: 280 }}>
            {filteredSlash.map((cmd) => (
              <button key={cmd.key} type="button" role="menuitem" className="nx-focus-ring flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-left text-sm text-secondary-foreground hover:bg-surface-secondary hover:text-foreground"
                onMouseDown={(event) => {
                  event.preventDefault();
                  editor.chain().focus().deleteRange({ from: slash.pos, to: editor.state.selection.$from.pos }).run();
                  cmd.run(editor.chain().focus());
                  setSlash(null);
                }}>
                {cmd.icon}{t(`editor.${cmd.key}`)}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <p className="text-xs text-muted-foreground">{t("editor.wordCount", { words: wordCount, chars: charCount })} · {t("editor.slashHint")}</p>
    </>
  );
}

// ---------- Nexora Sheets (spreadsheet) ----------

type CellStyle = { b?: boolean; i?: boolean; color?: string; bg?: string };
type TriggerOp = ">" | ">=" | "<" | "<=" | "=" | "!=";
type SheetTrigger = { id: string; cell: string; op: TriggerOp; value: string; title: string; lastTrue?: boolean };
type SheetTab = { name: string; cells: Record<string, string>; styles: Record<string, CellStyle>; columnWidths: Record<number, number>; rowHeights: Record<number, number>; rowCount: number; columnCount: number; triggers?: SheetTrigger[] };
type Range = { r1: number; c1: number; r2: number; c2: number };
type ChartType = "bar" | "line" | "pie";

const SHEET_FUNCTIONS = [...SUPPORTED_FUNCTIONS, ...Object.keys(NEXORA_FUNCTIONS)];

const colName = columnName;
function cellKey(row: number, col: number) { return `${colName(col)}${row + 1}`; }

function normalizeRange(a: { row: number; col: number }, b: { row: number; col: number }): Range {
  return { r1: Math.min(a.row, b.row), c1: Math.min(a.col, b.col), r2: Math.max(a.row, b.row), c2: Math.max(a.col, b.col) };
}

function migrateSheetContent(raw: unknown): SheetTab[] {
  const data = (raw ?? {}) as { sheets?: SheetTab[]; cells?: Record<string, string>; rowCount?: number; columnCount?: number };
  if (Array.isArray(data.sheets) && data.sheets.length) {
    return data.sheets.map((sheet) => ({ name: sheet.name ?? "Folha1", cells: sheet.cells ?? {}, styles: sheet.styles ?? {}, columnWidths: sheet.columnWidths ?? {}, rowHeights: sheet.rowHeights ?? {}, rowCount: sheet.rowCount ?? 100, columnCount: sheet.columnCount ?? 26, triggers: sheet.triggers ?? [] }));
  }
  return [{ name: "Folha1", cells: data.cells ?? {}, styles: {}, columnWidths: {}, rowHeights: {}, rowCount: data.rowCount ?? 100, columnCount: data.columnCount ?? 26, triggers: [] }];
}

function SheetEditor({ organizationId, document, content, canEdit, saving, onSave, onBack, onRename, onSnapshot }: SharedProps & { content: unknown }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [sheets, setSheets] = useState<SheetTab[]>(() => migrateSheetContent(content));
  const [activeSheet, setActiveSheet] = useState(0);
  const [selected, setSelected] = useState<{ row: number; col: number }>({ row: 0, col: 0 });
  const [range, setRange] = useState<Range | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [fillTarget, setFillTarget] = useState<Range | null>(null);
  const [filling, setFilling] = useState(false);
  const [formulaBar, setFormulaBar] = useState("");
  const [freezeRow, setFreezeRow] = useState(false);
  const [freezeCol, setFreezeCol] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [edited, setEdited] = useState(false);
  const [dataVersion, setDataVersion] = useState(0);
  const [chartOpen, setChartOpen] = useState(false);
  const [chartType, setChartType] = useState<ChartType>("bar");
  const [triggersOpen, setTriggersOpen] = useState(false);
  const importInputId = useId();
  const sheetsRef = useRef(sheets);
  const dirtyRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const historyRef = useRef<SheetTab[][]>([]);
  const futureRef = useRef<SheetTab[][]>([]);
  const gridRef = useRef<HTMLDivElement>(null);
  const resizing = useRef<{ kind: "col"; col: number; startX: number; startWidth: number } | { kind: "row"; row: number; startY: number; startHeight: number } | null>(null);
  useEffect(() => { sheetsRef.current = sheets; }, [sheets]);

  const sheet = sheets[activeSheet] ?? sheets[0]!;
  const rowCount = sheet.rowCount;
  const columnCount = sheet.columnCount;
  const cells = sheet.cells;
  const styles = sheet.styles;
  const tableWidth = useMemo(() => 40 + Array.from({ length: columnCount }, (_, col) => sheet.columnWidths[col] ?? 96).reduce((a, b) => a + b, 0), [columnCount, sheet.columnWidths]);

  const updateSheet = useCallback((updater: (tab: SheetTab) => SheetTab, pushHistory = true) => {
    setSheets((current) => {
      if (pushHistory) { historyRef.current.push(current); futureRef.current = []; }
      return current.map((tab, i) => i === activeSheet ? updater(tab) : tab);
    });
  }, [activeSheet]);

  const scheduleSave = useCallback(() => {
    dirtyRef.current = true;
    setDirty(true);
    setEdited(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (!dirtyRef.current) return;
      dirtyRef.current = false;
      setDirty(false);
      const snapshot = sheetsRef.current;
      const plainText = snapshot.flatMap((tab) => Object.entries(tab.cells).map(([key, value]) => `${tab.name}!${key}: ${value}`)).join("\n");
      onSave({ content: { version: 2, sheets: snapshot }, plainText });
    }, 1500);
  }, [onSave]);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  // Column resize: drag the right edge of a column header.
  useEffect(() => {
    const move = (event: MouseEvent) => {
      const r = resizing.current;
      if (!r) return;
      setSheets((current) => current.map((tab, i) => {
        if (i !== activeSheet) return tab;
        if (r.kind === "col") {
          return { ...tab, columnWidths: { ...tab.columnWidths, [r.col]: Math.max(48, r.startWidth + (event.clientX - r.startX)) } };
        }
        return { ...tab, rowHeights: { ...tab.rowHeights, [r.row]: Math.max(24, r.startHeight + (event.clientY - r.startY)) } };
      }));
    };
    const up = () => {
      if (resizing.current) { resizing.current = null; scheduleSave(); }
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
  }, [activeSheet, scheduleSave]);

  // Snapshot of org data for Nexora functions (=TASKSCOUNT, etc.) — refreshed on open.
  useEffect(() => {
    let alive = true;
    const value = <T,>(result: PromiseSettledResult<T>): T | undefined => result.status === "fulfilled" ? result.value : undefined;
    void (async () => {
      const [all, todo, inProgress, inReview, done, cancelled, lists, forms, docs, analytics] = await Promise.allSettled([
        tasksApi.list(organizationId, { scope: "all" }),
        tasksApi.list(organizationId, { scope: "all", status: "TODO" }),
        tasksApi.list(organizationId, { scope: "all", status: "IN_PROGRESS" }),
        tasksApi.list(organizationId, { scope: "all", status: "IN_REVIEW" }),
        tasksApi.list(organizationId, { scope: "all", status: "DONE" }),
        tasksApi.list(organizationId, { scope: "all", status: "CANCELLED" }),
        listsApi.list(organizationId, {}),
        formsApi.list(organizationId, {}),
        dashboardApi.get(organizationId),
        analyticsApi.operational(organizationId, 90)
      ]);
      if (!alive) return;
      const tasksList = value(all)?.tasks ?? [];
      const now = Date.now();
      NEXORA_SHEET_DATA.tasks.total = value(all)?.total ?? tasksList.length;
      NEXORA_SHEET_DATA.tasks.byStatus = {
        TODO: value(todo)?.total ?? 0,
        IN_PROGRESS: value(inProgress)?.total ?? 0,
        IN_REVIEW: value(inReview)?.total ?? 0,
        DONE: value(done)?.total ?? 0,
        CANCELLED: value(cancelled)?.total ?? 0
      };
      NEXORA_SHEET_DATA.tasks.overdue = value(analytics)?.summary.overdueTasks
        ?? tasksList.filter((task) => task.dueAt && new Date(task.dueAt).getTime() < now && task.status !== "DONE" && task.status !== "CANCELLED").length;
      NEXORA_SHEET_DATA.lists = value(lists)?.total ?? 0;
      NEXORA_SHEET_DATA.forms = value(forms)?.total ?? 0;
      NEXORA_SHEET_DATA.documents = value(docs)?.metrics.documents ?? 0;
      setDataVersion((v) => v + 1);
    })();
    return () => { alive = false; };
  }, [organizationId]);
  const computed = useMemo(() => {
    const values = evaluateSheet(cells, NEXORA_FUNCTIONS);
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(values)) out[key] = cells[key]?.startsWith("=") ? displayValue(value) : cells[key]!;
    return out;
    // dataVersion re-evaluates Nexora functions once org data has loaded
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cells, dataVersion]);

  // Trigger engine: fires a task when a cell condition transitions false → true.
  const fireTrigger = useCallback((trigger: SheetTrigger) => {
    void tasksApi.create(organizationId, {
      title: trigger.title,
      description: `Nexora Sheets — ${trigger.cell} ${trigger.op} ${trigger.value}`,
      status: "TODO",
      documentId: document.id
    }).then(() => toast({ tone: "success", title: t("editor.triggerCreated"), description: trigger.title }))
      .catch(() => undefined);
  }, [organizationId, document.id, toast, t]);

  useEffect(() => {
    if (!canEdit) return;
    const tab = sheetsRef.current[activeSheet];
    const triggers = tab?.triggers ?? [];
    if (!triggers.length) return;
    let changed = false;
    const next = triggers.map((trigger) => {
      const raw = (computed[trigger.cell.toUpperCase()] ?? "").trim();
      const hit = compareTrigger(raw, trigger.op, trigger.value);
      if (hit && !trigger.lastTrue) { changed = true; fireTrigger(trigger); return { ...trigger, lastTrue: true }; }
      if (!hit && trigger.lastTrue) { changed = true; return { ...trigger, lastTrue: false }; }
      return trigger;
    });
    if (changed) {
      setSheets((current) => current.map((item, i) => i === activeSheet ? { ...item, triggers: next } : item));
      scheduleSave();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [computed, activeSheet, canEdit, fireTrigger]);

  async function exportXlsx() {
    const ExcelJS = await import("exceljs");
    const wb = new ExcelJS.Workbook();
    for (const tab of sheetsRef.current) {
      const ws = wb.addWorksheet(tab.name.slice(0, 31));
      for (const [key, raw] of Object.entries(tab.cells)) {
        const match = /^([A-Z]+)(\d+)$/.exec(key);
        if (!match?.[1] || !match[2]) continue;
        const cell = ws.getCell(Number.parseInt(match[2], 10), columnIndex(match[1]) + 1);
        if (raw.startsWith("=")) cell.value = { formula: raw.slice(1), result: undefined };
        else {
          const num = Number(raw);
          cell.value = raw !== "" && !Number.isNaN(num) ? num : raw;
        }
      }
    }
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = `${document.name.replace(/\.nxsheet$/i, "")}.xlsx`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function importFile(file: File) {
    try {
      if (file.name.toLowerCase().endsWith(".csv")) {
        const rows = parseCsv(await file.text());
        const next: Record<string, string> = {};
        rows.forEach((row, r) => row.forEach((v, c) => { if (v !== "") next[cellKey(r, c)] = v; }));
        setSheets([{ name: file.name.replace(/\.csv$/i, "").slice(0, 30) || "Folha1", cells: next, styles: {}, columnWidths: {}, rowHeights: {}, rowCount: Math.max(100, rows.length + 10), columnCount: 26, triggers: [] }]);
      } else {
        const ExcelJS = await import("exceljs");
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(await file.arrayBuffer());
        const tabs: SheetTab[] = wb.worksheets.map((ws) => {
          const next: Record<string, string> = {};
          let maxRow = 0;
          let maxCol = 0;
          ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
            maxRow = Math.max(maxRow, rowNumber);
            row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
              maxCol = Math.max(maxCol, colNumber);
              const v = cell.value as unknown;
              let raw = "";
              if (v === null || v === undefined) return;
              if (typeof v === "object") {
                const obj = v as Record<string, unknown>;
                if ("formula" in obj) raw = `=${String(obj.formula ?? "")}`;
                else if ("richText" in obj) raw = (obj.richText as { text: string }[]).map((part) => part.text).join("");
                else if (v instanceof Date) raw = v.toISOString().slice(0, 10);
                else if ("result" in obj) raw = String(obj.result ?? "");
                else if ("text" in obj) raw = String(obj.text ?? "");
                else raw = String(v);
              } else raw = String(v);
              if (raw !== "") next[cellKey(rowNumber - 1, colNumber - 1)] = raw;
            });
          });
          return { name: ws.name.slice(0, 30), cells: next, styles: {}, columnWidths: {}, rowHeights: {}, rowCount: Math.max(100, maxRow + 10), columnCount: Math.max(26, maxCol + 2), triggers: [] };
        });
        if (!tabs.length) throw new Error("empty");
        setSheets(tabs);
      }
      setActiveSheet(0);
      setRange(null);
      scheduleSave();
    } catch {
      toast({ tone: "danger", title: t("editor.importError") });
    }
  }

  const chartData = useMemo(() => {
    const target = range ?? { r1: selected.row, c1: selected.col, r2: selected.row, c2: selected.col };
    const labels: string[] = [];
    const series: { name: string; values: number[] }[] = [];
    if (target.c1 === target.c2) {
      for (let r = target.r1; r <= target.r2; r += 1) {
        labels.push(cellKey(r, target.c1));
        const num = Number(computed[cellKey(r, target.c1)]);
        series[0] = series[0] ?? { name: colName(target.c1), values: [] };
        series[0].values.push(Number.isNaN(num) ? 0 : num);
      }
      if (!series.length) series.push({ name: colName(target.c1), values: [] });
    } else {
      for (let r = target.r1; r <= target.r2; r += 1) labels.push(computed[cellKey(r, target.c1)] ?? cellKey(r, target.c1));
      for (let c = target.c1 + 1; c <= target.c2; c += 1) {
        const values: number[] = [];
        for (let r = target.r1; r <= target.r2; r += 1) {
          const num = Number(computed[cellKey(r, c)]);
          values.push(Number.isNaN(num) ? 0 : num);
        }
        series.push({ name: colName(c), values });
      }
    }
    return { labels, series };
  }, [range, selected, computed]);

  function focusCell(row: number, col: number) {
    const r = Math.max(0, Math.min(rowCount - 1, row));
    const c = Math.max(0, Math.min(columnCount - 1, col));
    setSelected({ row: r, col: c });
    setRange({ r1: r, c1: c, r2: r, c2: c });
    setFormulaBar(sheetsRef.current[activeSheet]?.cells[cellKey(r, c)] ?? "");
    requestAnimationFrame(() => {
      const input = window.document.querySelector<HTMLInputElement>(`input[aria-label="${cellKey(r, c)}"]`);
      input?.focus();
      input?.select();
    });
  }

  function commitCell(row: number, col: number, value: string) {
    if (!canEdit) return;
    updateSheet((tab) => {
      const next = { ...tab.cells };
      if (value === "") delete next[cellKey(row, col)]; else next[cellKey(row, col)] = value;
      return { ...tab, cells: next };
    });
    scheduleSave();
  }

  function commitRange(values: string[][], anchor: { row: number; col: number }) {
    if (!canEdit) return;
    updateSheet((tab) => {
      const next = { ...tab.cells };
      values.forEach((rowValues, ri) => rowValues.forEach((value, ci) => {
        const key = cellKey(anchor.row + ri, anchor.col + ci);
        if (value === "") delete next[key]; else next[key] = value;
      }));
      return { ...tab, cells: next };
    });
    scheduleSave();
  }

  function clearRange(target: Range) {
    if (!canEdit) return;
    updateSheet((tab) => {
      const next = { ...tab.cells };
      for (let r = target.r1; r <= target.r2; r += 1) for (let c = target.c1; c <= target.c2; c += 1) delete next[cellKey(r, c)];
      return { ...tab, cells: next };
    });
    scheduleSave();
  }

  function undo() { const prev = historyRef.current.pop(); if (prev) { futureRef.current.push(sheetsRef.current); sheetsRef.current = prev; setSheets(prev); scheduleSave(); } }
  function redo() { const next = futureRef.current.pop(); if (next) { historyRef.current.push(sheetsRef.current); sheetsRef.current = next; setSheets(next); scheduleSave(); } }

  function applyStyle(patch: Partial<CellStyle>) {
    if (!canEdit) return;
    const target = range ?? { r1: selected.row, c1: selected.col, r2: selected.row, c2: selected.col };
    updateSheet((tab) => {
      const next = { ...tab.styles };
      for (let r = target.r1; r <= target.r2; r += 1) for (let c = target.c1; c <= target.c2; c += 1) {
        const key = cellKey(r, c);
        next[key] = { ...next[key], ...patch };
        if (!Object.keys(next[key]!).length) delete next[key];
      }
      return { ...tab, styles: next };
    });
    scheduleSave();
  }

  function sortBySelectedColumn(asc: boolean) {
    if (!canEdit) return;
    const col = selected.col;
    updateSheet((tab) => {
      const entries = Object.entries(tab.cells).filter(([key]) => /^[A-Z]+\d+$/.test(key));
      const rows = new Map<number, Record<number, string>>();
      for (const [key, value] of entries) {
        const match = /^([A-Z]+)(\d+)$/.exec(key)!;
        const r = Number.parseInt(match[2]!, 10) - 1;
        const c = columnIndex(match[1]!);
        (rows.get(r) ?? rows.set(r, {}).get(r)!)[c] = value;
      }
      const sortedRows = [...rows.entries()].sort((a, b) => {
        const va = a[1][col] ?? "";
        const vb = b[1][col] ?? "";
        const na = Number(va); const nb = Number(vb);
        const cmp = !Number.isNaN(na) && !Number.isNaN(nb) && va !== "" && vb !== "" ? na - nb : va.localeCompare(vb);
        return asc ? cmp : -cmp;
      });
      const next: Record<string, string> = {};
      sortedRows.forEach(([, cols], index) => Object.entries(cols).forEach(([c, value]) => { next[cellKey(index, Number(c))] = value; }));
      return { ...tab, cells: next };
    });
    scheduleSave();
  }

  function applyFill() {
    const source = range;
    const target = fillTarget;
    setFilling(false);
    setFillTarget(null);
    if (!source || !target || !canEdit) return;
    const combined = { r1: Math.min(source.r1, target.r1), c1: Math.min(source.c1, target.c1), r2: Math.max(source.r2, target.r2), c2: Math.max(source.c2, target.c2) };
    updateSheet((tab) => {
      const next = { ...tab.cells };
      for (let r = combined.r1; r <= combined.r2; r += 1) {
        for (let c = combined.c1; c <= combined.c2; c += 1) {
          if (r <= source.r2 && r >= source.r1 && c <= source.c2 && c >= source.c1) continue;
          const srcR = source.r1 + ((r - source.r1) % (source.r2 - source.r1 + 1) + (source.r2 - source.r1 + 1)) % (source.r2 - source.r1 + 1);
          const srcC = source.c1 + ((c - source.c1) % (source.c2 - source.c1 + 1) + (source.c2 - source.c1 + 1)) % (source.c2 - source.c1 + 1);
          const raw = tab.cells[cellKey(srcR, srcC)] ?? "";
          const num = Number(raw);
          const offset = Math.max(Math.floor((r - source.r1) / (source.r2 - source.r1 + 1)), Math.floor((c - source.c1) / (source.c2 - source.c1 + 1)), 0);
          next[cellKey(r, c)] = raw !== "" && !Number.isNaN(num) && !raw.startsWith("=") ? String(num + offset) : raw;
        }
      }
      return { ...tab, cells: next };
    });
    setRange(combined);
    scheduleSave();
  }

  function exportCsv() {
    const csv = Array.from({ length: rowCount }, (_, r) => Array.from({ length: columnCount }, (_, c) => `"${String(computed[cellKey(r, c)] ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = `${sheet.name.replace(/[^\w.-]+/g, "_")}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function addSheet() {
    setSheets((current) => [...current, { name: `Folha${current.length + 1}`, cells: {}, styles: {}, columnWidths: {}, rowHeights: {}, rowCount: 100, columnCount: 26 }]);
    setActiveSheet(sheets.length);
    scheduleSave();
  }

  function renameSheet(index: number) {
    const name = window.prompt(t("editor.sheetName"), sheets[index]?.name ?? "");
    if (!name?.trim()) return;
    historyRef.current.push(sheetsRef.current);
    futureRef.current = [];
    setSheets((current) => current.map((tab, i) => i === index ? { ...tab, name: name.trim() } : tab));
    scheduleSave();
  }

  function removeSheet(index: number) {
    if (sheets.length <= 1) return;
    setSheets((current) => current.filter((_, i) => i !== index));
    setActiveSheet(Math.max(0, index - 1));
    scheduleSave();
  }

  function addTrigger(trigger: SheetTrigger) {
    updateSheet((tab) => ({ ...tab, triggers: [...(tab.triggers ?? []), trigger] }));
    scheduleSave();
  }

  function removeTrigger(id: string) {
    updateSheet((tab) => ({ ...tab, triggers: (tab.triggers ?? []).filter((trigger) => trigger.id !== id) }));
    scheduleSave();
  }

  const selectedKey = cellKey(selected.row, selected.col);
  const selectedStyle = styles[selectedKey] ?? {};
  const saveState: SaveState = saving ? "saving" : dirty ? "dirty" : edited ? "saved" : "idle";

  const formulaMatch = /^=([A-Z]*)$/i.exec(formulaBar);
  const formulaHints = formulaMatch ? SHEET_FUNCTIONS.filter((fn) => fn.startsWith(formulaMatch[1]!.toUpperCase()) && fn !== formulaMatch[1]!.toUpperCase()) : [];

  const btnCls = (active = false) => cn(TOOL_BTN, active && TOOL_ACTIVE);

  return (
    <>
      <EditorHeader document={document} kind="SHEET" canEdit={canEdit} saveState={saveState} onBack={onBack}
        onSave={() => { dirtyRef.current = true; scheduleSave(); }} onRename={onRename}
        extra={<>
          {canEdit ? <Button variant="outline" onClick={() => onSnapshot({ version: 2, sheets: sheetsRef.current })}><Save />{t("editor.saveVersion")}</Button> : null}
          <Dropdown trigger={<Button variant="outline"><Download />{t("editor.export")}</Button>}>
            <DropdownItem onClick={exportCsv}><Download className="size-4" />CSV</DropdownItem>
            <DropdownItem onClick={() => void exportXlsx()}><Download className="size-4" />Excel (.xlsx)</DropdownItem>
            {canEdit ? <DropdownItem onClick={() => (window.document.getElementById(importInputId) as HTMLInputElement | null)?.click()}><FileUp className="size-4" />{t("editor.import")}</DropdownItem> : null}
          </Dropdown>
          <input id={importInputId} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importFile(file); event.target.value = ""; }} />
        </>} />

      <div className="flex flex-wrap items-center gap-0.5 rounded-md border border-border bg-surface p-1" role="toolbar" aria-label={t("editor.toolbar")}>
        <button type="button" className={btnCls()} title={t("editor.undo")} aria-label={t("editor.undo")} onClick={undo}><Undo2 className="size-4" /></button>
        <button type="button" className={btnCls()} title={t("editor.redo")} aria-label={t("editor.redo")} onClick={redo}><Redo2 className="size-4" /></button>
        <span className="mx-1 h-5 w-px self-center bg-border" />
        <button type="button" disabled={!canEdit} aria-pressed={Boolean(selectedStyle.b)} className={btnCls(Boolean(selectedStyle.b))} title={t("editor.bold")} onClick={() => applyStyle({ b: !selectedStyle.b })}><Bold className="size-4" /></button>
        <button type="button" disabled={!canEdit} aria-pressed={Boolean(selectedStyle.i)} className={btnCls(Boolean(selectedStyle.i))} title={t("editor.italic")} onClick={() => applyStyle({ i: !selectedStyle.i })}><Italic className="size-4" /></button>
        <label title={t("editor.textColor")} aria-label={t("editor.textColor")} className={cn(TOOL_BTN, "relative cursor-pointer")}>
          <Palette className="size-4" />
          <input type="color" className="absolute inset-0 size-full cursor-pointer opacity-0" disabled={!canEdit} onChange={(event) => applyStyle({ color: event.target.value })} />
        </label>
        <label title={t("editor.cellBackground")} aria-label={t("editor.cellBackground")} className={cn(TOOL_BTN, "relative cursor-pointer")}>
          <Highlighter className="size-4" />
          <input type="color" className="absolute inset-0 size-full cursor-pointer opacity-0" disabled={!canEdit} onChange={(event) => applyStyle({ bg: event.target.value })} />
        </label>
        <span className="mx-1 h-5 w-px self-center bg-border" />
        <button type="button" disabled={!canEdit} className={btnCls()} title={t("editor.sortAsc")} onClick={() => sortBySelectedColumn(true)}><ArrowDownAZ className="size-4" /></button>
        <button type="button" disabled={!canEdit} className={btnCls()} title={t("editor.sortDesc")} onClick={() => sortBySelectedColumn(false)}><ArrowUpZA className="size-4" /></button>
        <span className="mx-1 h-5 w-px self-center bg-border" />
        <button type="button" className={btnCls(freezeRow)} aria-pressed={freezeRow} title={t("editor.freezeRow")} onClick={() => setFreezeRow((v) => !v)}><span className="text-xs">❄1</span></button>
        <button type="button" className={btnCls(freezeCol)} aria-pressed={freezeCol} title={t("editor.freezeCol")} onClick={() => setFreezeCol((v) => !v)}><span className="text-xs">❄A</span></button>
        <span className="mx-1 h-5 w-px self-center bg-border" />
        <button type="button" className={btnCls()} title={t("editor.chart")} aria-label={t("editor.chart")} onClick={() => setChartOpen(true)}><BarChart3 className="size-4" /></button>
        {canEdit ? <button type="button" className={btnCls()} title={t("editor.triggers")} aria-label={t("editor.triggers")} onClick={() => setTriggersOpen(true)}><Zap className="size-4" /></button> : null}
      </div>

      <div className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2">
        <Badge variant="outline" className="shrink-0 font-mono">{range ? `${cellKey(range.r1, range.c1)}${range.r1 === range.r2 && range.c1 === range.c2 ? "" : `:${cellKey(range.r2, range.c2)}`}` : selectedKey}</Badge>
        <div className="relative min-w-0 flex-1">
          <input
            aria-label={t("editor.formulaBar")}
            className="nx-focus-ring w-full bg-transparent font-mono text-sm text-foreground outline-none placeholder:text-muted-foreground"
            value={formulaBar}
            placeholder={canEdit ? t("editor.formulaPlaceholder") : computed[selectedKey] ?? ""}
            disabled={!canEdit}
            onChange={(event) => { setFormulaBar(event.target.value); commitCell(selected.row, selected.col, event.target.value); }}
            onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); focusCell(selected.row + 1, selected.col); } }}
          />
          {formulaHints.length ? (
            <div className="absolute left-0 top-full z-30 mt-1 w-40 rounded-md border border-border bg-surface p-1 shadow-[var(--nx-shadow-overlay)]">
              {formulaHints.map((fn) => (
                <button key={fn} type="button" className="nx-focus-ring block w-full rounded-sm px-2.5 py-1.5 text-left font-mono text-xs text-secondary-foreground hover:bg-surface-secondary hover:text-foreground"
                  onMouseDown={(event) => { event.preventDefault(); const next = `=${fn}(`; setFormulaBar(next); commitCell(selected.row, selected.col, next); }}>{fn}()</button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div
        ref={gridRef}
        className="overflow-auto rounded-lg border border-border bg-surface"
        style={{ maxHeight: "58vh" }}
        onMouseLeave={() => { if (selecting) setSelecting(false); }}
        onMouseUp={() => { if (selecting) setSelecting(false); if (filling) applyFill(); }}
        onCopy={(event) => {
          const input = window.document.activeElement as HTMLInputElement | null;
          if (input?.selectionStart !== input?.selectionEnd) return; // let native text copy through
          const target = range ?? { r1: selected.row, c1: selected.col, r2: selected.row, c2: selected.col };
          const lines: string[] = [];
          for (let r = target.r1; r <= target.r2; r += 1) {
            const row: string[] = [];
            for (let c = target.c1; c <= target.c2; c += 1) row.push(computed[cellKey(r, c)] ?? "");
            lines.push(row.join("\t"));
          }
          event.clipboardData.setData("text/plain", lines.join("\n"));
          event.preventDefault();
        }}
        onPaste={(event) => {
          if (!canEdit) return;
          const text = event.clipboardData.getData("text/plain");
          if (!text.includes("\t") && !text.includes("\n")) return; // single value: native paste into input
          event.preventDefault();
          const rows = text.replace(/\r/g, "").replace(/\n$/, "").split("\n").map((line) => line.split("\t"));
          const anchor = range ? { row: range.r1, col: range.c1 } : selected;
          commitRange(rows, anchor);
        }}
      >
        <table className="table-fixed border-collapse text-sm" style={{ width: tableWidth }}>
          <thead className="sticky top-0 z-20">
            <tr>
              <th style={{ width: 40 }} className="sticky left-0 z-30 border-b border-r border-border bg-surface-secondary" />
              {Array.from({ length: columnCount }, (_, col) => (
                <th key={col} style={{ width: sheet.columnWidths[col] ?? 96 }}
                  className="relative border-b border-r border-border bg-surface-secondary px-2 py-1 text-xs font-medium text-muted-foreground">
                  {colName(col)}
                  {canEdit ? (
                    <span
                      className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-primary"
                      onMouseDown={(event) => { event.preventDefault(); resizing.current = { kind: "col", col, startX: event.clientX, startWidth: sheet.columnWidths[col] ?? 96 }; }}
                    />
                  ) : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rowCount }, (_, row) => (
              <tr key={row} style={{ height: sheet.rowHeights[row] ?? 32 }} className={freezeRow && row === 0 ? "sticky top-[29px] z-10" : undefined}>
                <th className="sticky left-0 z-10 border-b border-r border-border bg-surface-secondary px-1 text-center text-xs font-normal text-muted-foreground">
                  {row + 1}
                  {canEdit ? (
                    <span
                      className="absolute bottom-0 left-0 h-1.5 w-full cursor-row-resize hover:bg-primary"
                      onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); resizing.current = { kind: "row", row, startY: event.clientY, startHeight: sheet.rowHeights[row] ?? 32 }; }}
                    />
                  ) : null}
                </th>
                {Array.from({ length: columnCount }, (_, col) => {
                  const key = cellKey(row, col);
                  const raw = cells[key];
                  const style = styles[key];
                  const inRange = range && row >= range.r1 && row <= range.r2 && col >= range.c1 && col <= range.c2;
                  const isAnchor = selected.row === row && selected.col === col;
                  const isFillCorner = range && row === range.r2 && col === range.c2;
                  return (
                    <td
                      key={key}
                      className={cn("relative border-b border-r border-border p-0", inRange && "bg-primary-subtle/40", isAnchor && "outline outline-2 -outline-offset-2 outline-primary", freezeCol && col === 0 && "sticky left-10 z-[5] bg-surface")}
                      onMouseDown={() => { setSelected({ row, col }); setRange({ r1: row, c1: col, r2: row, c2: col }); setSelecting(true); setFormulaBar(raw ?? ""); }}
                      onMouseEnter={() => {
                        if (selecting) setRange((current) => current ? normalizeRange({ row: current.r1, col: current.c1 }, { row, col }) : current);
                        if (filling) setFillTarget((current) => current ? normalizeRange({ row: current.r1, col: current.c1 }, { row, col }) : current);
                      }}
                    >
                      <input
                        aria-label={key}
                        className={cn("h-full w-full bg-transparent px-2 text-foreground outline-none focus:bg-primary-subtle/40", raw?.startsWith("=") && "text-primary", style?.b && "font-bold", style?.i && "italic")}
                        style={{ color: style?.color, background: style?.bg }}
                        value={isAnchor ? (formulaBar === cells[key] || formulaBar === "" ? (raw ?? formulaBar) : formulaBar) : (computed[key] ?? "")}
                        readOnly={!canEdit}
                        onFocus={() => { if (!selecting) { setSelected({ row, col }); setRange({ r1: row, c1: col, r2: row, c2: col }); setFormulaBar(raw ?? ""); } }}
                        onChange={(event) => { setFormulaBar(event.target.value); commitCell(row, col, event.target.value); }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") { event.preventDefault(); focusCell(row + (event.shiftKey ? -1 : 1), col); }
                          if (event.key === "Tab") { event.preventDefault(); focusCell(row, col + (event.shiftKey ? -1 : 1)); }
                          if (event.key === "Delete" || event.key === "Backspace") {
                            if (range && (range.r1 !== range.r2 || range.c1 !== range.c2)) { event.preventDefault(); clearRange(range); }
                          }
                          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                            event.preventDefault();
                            focusCell(row + (event.key === "ArrowDown" ? 1 : -1), col);
                          }
                          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                            const input = event.currentTarget;
                            const atEdge = event.key === "ArrowLeft" ? input.selectionStart === 0 && input.selectionEnd === 0 : input.selectionStart === input.value.length && input.selectionEnd === input.value.length;
                            if (atEdge) { event.preventDefault(); focusCell(row, col + (event.key === "ArrowRight" ? 1 : -1)); }
                          }
                          if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && !event.shiftKey) { event.preventDefault(); undo(); }
                          if ((event.ctrlKey || event.metaKey) && (event.key.toLowerCase() === "y" || (event.key.toLowerCase() === "z" && event.shiftKey))) { event.preventDefault(); redo(); }
                        }}
                      />
                      {isFillCorner && canEdit && (range!.r1 !== range!.r2 || range!.c1 !== range!.c2 || cells[key] !== undefined) ? (
                        <span
                          role="presentation"
                          className="absolute -bottom-0.5 -right-0.5 z-20 size-2.5 cursor-crosshair rounded-[2px] border border-surface bg-primary"
                          onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); setFilling(true); setFillTarget(range); }}
                        />
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label={t("editor.sheets")}>
          {sheets.map((tab, index) => (
            <div key={index} role="tab" aria-selected={index === activeSheet}
              className={cn("flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm", index === activeSheet ? "border-primary bg-primary-subtle text-primary-subtle-foreground" : "border-border bg-surface text-secondary-foreground hover:bg-surface-secondary")}>
              <button type="button" className="nx-focus-ring rounded-sm" onClick={() => setActiveSheet(index)} onDoubleClick={() => canEdit && renameSheet(index)}>{tab.name}</button>
              {canEdit && sheets.length > 1 ? <button type="button" aria-label={t("common.delete")} className="nx-focus-ring rounded-sm text-muted-foreground hover:text-danger" onClick={() => removeSheet(index)}>×</button> : null}
            </div>
          ))}
          {canEdit ? <button type="button" className={cn(TOOL_BTN, "flex items-center gap-1")} onClick={addSheet}><Plus className="size-4" />{t("editor.newSheetTab")}</button> : null}
        </div>
        <div className="flex items-center gap-2">
          {canEdit ? <>
            <Button size="sm" variant="outline" onClick={() => { updateSheet((tab) => ({ ...tab, rowCount: tab.rowCount + 50 })); scheduleSave(); }}>+50 {t("editor.rows")}</Button>
            <Button size="sm" variant="outline" onClick={() => { if (columnCount < 52) { updateSheet((tab) => ({ ...tab, columnCount: Math.min(52, tab.columnCount + 5) })); scheduleSave(); } }}>+5 {t("editor.columns")}</Button>
          </> : null}
          {!canEdit ? <span className="text-xs text-muted-foreground">{t("editor.readOnly")}</span> : null}
        </div>
      </div>

      <Dialog open={chartOpen} onOpenChange={setChartOpen} title={t("editor.chart")} size="lg">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <label className="text-sm text-muted-foreground" htmlFor="nx-chart-type">{t("editor.chartType")}</label>
            <Select id="nx-chart-type" value={chartType} onChange={(event) => setChartType(event.target.value as ChartType)} className="w-44">
              <option value="bar">{t("editor.chartBar")}</option>
              <option value="line">{t("editor.chartLine")}</option>
              <option value="pie">{t("editor.chartPie")}</option>
            </Select>
          </div>
          <RangeChart labels={chartData.labels} series={chartData.series} type={chartType} />
        </div>
      </Dialog>

      <Dialog open={triggersOpen} onOpenChange={setTriggersOpen} title={t("editor.triggers")} description={t("editor.triggersDesc")}>
        <div className="flex flex-col gap-4">
          {(sheet.triggers ?? []).length ? (
            <ul className="divide-y divide-border rounded-md border border-border">
              {(sheet.triggers ?? []).map((trigger) => (
                <li key={trigger.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0 truncate">
                    <Badge variant="outline" className="mr-2 font-mono">{trigger.cell} {trigger.op} {trigger.value}</Badge>
                    {trigger.title}
                  </span>
                  <span className="flex items-center gap-2">
                    {trigger.lastTrue ? <Badge variant="success">{t("editor.triggerFired")}</Badge> : null}
                    <button type="button" aria-label={t("common.delete")} className="nx-focus-ring rounded-sm p-1 text-muted-foreground hover:text-danger" onClick={() => removeTrigger(trigger.id)}><Trash2 className="size-4" /></button>
                  </span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted-foreground">{t("editor.triggerEmpty")}</p>}
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              const cell = String(data.get("cell") ?? "").toUpperCase().trim();
              const op = String(data.get("op") ?? ">") as TriggerOp;
              const value = String(data.get("value") ?? "").trim();
              const title = String(data.get("title") ?? "").trim();
              if (!/^[A-Z]+\d+$/.test(cell) || !value || !title) return;
              addTrigger({ id: crypto.randomUUID(), cell, op, value, title, lastTrue: false });
              event.currentTarget.reset();
            }}
          >
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">{t("editor.triggerCell")}<Input name="cell" defaultValue={selectedKey} className="w-20 font-mono" required /></label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">{t("editor.triggerCondition")}
              <Select name="op" defaultValue=">" className="w-20">{[">", ">=", "<", "<=", "=", "!="].map((op) => <option key={op} value={op}>{op}</option>)}</Select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">{t("editor.triggerValue")}<Input name="value" className="w-24" required /></label>
            <label className="flex min-w-40 flex-1 flex-col gap-1 text-xs text-muted-foreground">{t("editor.triggerTaskTitle")}<Input name="title" required /></label>
            <Button type="submit" size="sm"><Plus className="size-4" />{t("editor.addTrigger")}</Button>
          </form>
        </div>
      </Dialog>
    </>
  );
}

function compareTrigger(raw: string, op: TriggerOp, value: string): boolean {
  const a = Number(raw);
  const b = Number(value);
  if (raw !== "" && value !== "" && !Number.isNaN(a) && !Number.isNaN(b)) {
    switch (op) {
      case ">": return a > b;
      case ">=": return a >= b;
      case "<": return a < b;
      case "<=": return a <= b;
      case "=": return a === b;
      case "!=": return a !== b;
    }
  }
  if (op === "=") return raw.toLowerCase() === value.toLowerCase();
  if (op === "!=") return raw.toLowerCase() !== value.toLowerCase();
  return false;
}

function parseCsv(text: string): string[][] {
  const firstLine = text.slice(0, text.indexOf("\n") + 1 || text.length);
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const CHART_COLORS = ["#2563eb", "#16a34a", "#d97706", "#dc2626", "#7c3aed", "#0891b2"];

function RangeChart({ labels, series, type }: { labels: string[]; series: { name: string; values: number[] }[]; type: ChartType }) {
  const { t } = useTranslation();
  const width = 640;
  const height = 300;
  const pad = { top: 16, right: 16, bottom: 36, left: 48 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const allValues = series.flatMap((s) => s.values);
  const max = Math.max(1, ...allValues.map((v) => Math.abs(v)));
  const count = Math.max(1, labels.length);

  if (!labels.length || !series.length) return <p className="text-sm text-muted-foreground">{t("editor.chartEmpty")}</p>;

  if (type === "pie") {
    const values = series[0]?.values.map((v) => Math.max(0, v)) ?? [];
    const total = values.reduce((a, b) => a + b, 0) || 1;
    const cx = 170;
    const cy = 150;
    const radius = 120;
    const starts: number[] = [];
    values.reduce((angle, v) => { starts.push(angle); return angle + (v / total) * Math.PI * 2; }, -Math.PI / 2);
    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label={t("editor.chart")}>
        {values.map((v, i) => {
          const start = starts[i] ?? -Math.PI / 2;
          const span = (v / total) * Math.PI * 2;
          const x1 = cx + radius * Math.cos(start);
          const y1 = cy + radius * Math.sin(start);
          const end = start + span;
          const x2 = cx + radius * Math.cos(end);
          const y2 = cy + radius * Math.sin(end);
          const large = span > Math.PI ? 1 : 0;
          const path = `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2} Z`;
          return <path key={i} d={path} fill={CHART_COLORS[i % CHART_COLORS.length]} stroke="var(--nx-bg-surface)" strokeWidth="2"><title>{`${labels[i]}: ${values[i]}`}</title></path>;
        })}
        {labels.map((label, i) => (
          <g key={`l-${i}`} transform={`translate(${330},${60 + i * 22})`}>
            <rect width="12" height="12" rx="2" fill={CHART_COLORS[i % CHART_COLORS.length]} />
            <text x="18" y="10" fontSize="12" fill="currentColor">{label} ({series[0]?.values[i] ?? 0})</text>
          </g>
        ))}
      </svg>
    );
  }

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label={t("editor.chart")}>
      {[0, 0.25, 0.5, 0.75, 1].map((f) => {
        const y = pad.top + innerH * (1 - f);
        return (
          <g key={f}>
            <line x1={pad.left} y1={y} x2={width - pad.right} y2={y} stroke="var(--nx-border)" strokeDasharray={f === 0 ? "" : "3 3"} />
            <text x={pad.left - 6} y={y + 4} fontSize="10" textAnchor="end" fill="var(--nx-text-muted)">{Math.round(max * f * 100) / 100}</text>
          </g>
        );
      })}
      {labels.map((label, i) => (
        <text key={`x-${i}`} x={pad.left + (innerW / count) * (i + 0.5)} y={height - 18} fontSize="10" textAnchor="middle" fill="var(--nx-text-muted)">{label.length > 8 ? `${label.slice(0, 8)}…` : label}</text>
      ))}
      {series.map((s, si) => {
        const color = CHART_COLORS[si % CHART_COLORS.length];
        if (type === "line") {
          const points = s.values.map((v, i) => `${pad.left + (innerW / count) * (i + 0.5)},${pad.top + innerH * (1 - Math.max(0, v) / max)}`).join(" ");
          return (
            <g key={si}>
              <polyline points={points} fill="none" stroke={color} strokeWidth="2" />
              {s.values.map((v, i) => <circle key={i} cx={pad.left + (innerW / count) * (i + 0.5)} cy={pad.top + innerH * (1 - Math.max(0, v) / max)} r="3" fill={color}><title>{`${labels[i]}: ${v}`}</title></circle>)}
            </g>
          );
        }
        const groupW = innerW / count;
        const barW = Math.min(40, (groupW * 0.7) / series.length);
        return s.values.map((v, i) => {
          const h = (Math.max(0, v) / max) * innerH;
          const x = pad.left + groupW * i + groupW / 2 - (barW * series.length) / 2 + si * barW;
          return <rect key={`${si}-${i}`} x={x} y={pad.top + innerH - h} width={barW - 2} height={h} rx="2" fill={color}><title>{`${labels[i]} · ${s.name}: ${v}`}</title></rect>;
        });
      })}
      {series.length > 1 ? series.map((s, i) => (
        <g key={`g-${i}`} transform={`translate(${pad.left + i * 90},${height - 8})`}>
          <rect width="10" height="10" rx="2" fill={CHART_COLORS[i % CHART_COLORS.length]} />
          <text x="14" y="9" fontSize="10" fill="var(--nx-text-muted)">{s.name}</text>
        </g>
      )) : null}
    </svg>
  );
}
