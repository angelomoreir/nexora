import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { cn } from "../../lib/utils";
import { Dialog } from "./dialog";
import { Input } from "./input";

export interface CommandItem { id: string; label: string; description?: string; icon?: ReactNode; keywords?: string[]; group?: string; onSelect: () => void }

export function CommandMenu({ open, onOpenChange, items, placeholder, onQueryChange, loading }: { open: boolean; onOpenChange: (open: boolean) => void; items: CommandItem[]; placeholder?: string; onQueryChange?: (query: string) => void; loading?: boolean }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const filtered = useMemo(() => { const term = query.trim().toLowerCase(); return term ? items.filter((item) => [item.label, item.description, ...(item.keywords ?? [])].some((value) => value?.toLowerCase().includes(term))) : items; }, [items, query]);
  const grouped = useMemo(() => {
    const groups: { name: string; entries: { item: CommandItem; index: number }[] }[] = [];
    const byName = new Map<string, { name: string; entries: { item: CommandItem; index: number }[] }>();
    filtered.forEach((item, index) => {
      const name = item.group ?? t("commandMenu.actions");
      let group = byName.get(name);
      if (!group) { group = { name, entries: [] }; byName.set(name, group); groups.push(group); }
      group.entries.push({ item, index });
    });
    return groups;
  }, [filtered, t]);
  useEffect(() => { if (!open) { setQuery(""); setActiveIndex(0); } }, [open]);
  useEffect(() => { onQueryChange?.(query.trim()); }, [query, onQueryChange]);
  useEffect(() => setActiveIndex(0), [filtered.length]);

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") { event.preventDefault(); setActiveIndex((index) => Math.min(index + 1, filtered.length - 1)); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex((index) => Math.max(index - 1, 0)); }
    else if (event.key === "Enter") { event.preventDefault(); const item = filtered[activeIndex]; if (item) { item.onSelect(); onOpenChange(false); } }
  }

  const hint = (keys: string, label: string) => <span className="flex items-center gap-1.5"><kbd className="rounded border border-border bg-surface-secondary px-1.5 py-0.5 text-[10px] font-semibold">{keys}</kbd>{label}</span>;

  return <Dialog open={open} onOpenChange={onOpenChange} title={t("commandMenu.title")} size="md" className="self-start mt-[12vh]" footer={<div className="flex items-center gap-4 text-xs text-muted-foreground">{hint("↑↓", t("commandMenu.moveHint"))}{hint("↵", t("commandMenu.openHint"))}</div>}><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={onKeyDown} placeholder={placeholder ?? t("common.searchCommands")} className="pl-9" role="combobox" aria-expanded="true" aria-controls="command-menu-list" /></div><div id="command-menu-list" className="mt-3 max-h-80 overflow-y-auto" role="listbox">{filtered.length ? grouped.map((group) => <div key={group.name}><div className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.name}</div>{group.entries.map(({ item, index }) => <button key={item.id} type="button" role="option" aria-selected={index === activeIndex} ref={(element) => { if (index === activeIndex) element?.scrollIntoView({ block: "nearest" }); }} onMouseEnter={() => setActiveIndex(index)} onClick={() => { item.onSelect(); onOpenChange(false); }} className={cn("nx-focus-ring flex w-full items-start gap-3 rounded-md px-3 py-2.5 text-left hover:bg-surface-secondary", index === activeIndex && "bg-surface-secondary")}>{item.icon ? <span className="mt-0.5 text-muted-foreground">{item.icon}</span> : null}<span className="min-w-0"><span className="block truncate text-sm font-medium text-foreground">{item.label}</span>{item.description ? <span className="block truncate text-xs text-muted-foreground">{item.description}</span> : null}</span></button>)}</div>) : <p className="px-3 py-8 text-center text-sm text-muted-foreground">{loading ? t("common.loading") : t("common.noResults")}</p>}{loading && filtered.length ? <p className="px-3 py-2 text-xs text-muted-foreground">{t("common.loading")}</p> : null}</div></Dialog>;
}
