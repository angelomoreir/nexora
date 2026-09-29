import { useQuery } from "@tanstack/react-query";
import type { SearchEntityType, SearchResponse } from "@nexora/contracts";
import { CheckSquare, FileText, Folder, GitBranch, LayoutGrid, List, Newspaper, Search, SlidersHorizontal, User } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { useWorkspace } from "../components/layout/app-layout";
import { Alert, Badge, Button, EmptyState, Input, Page, PageHeader, PageSection, Skeleton, Toolbar } from "../components/ui";
import { ContextualHelpButton } from "../components/help/contextual-help-button";
import { searchApi } from "../lib/api";
import { apiErrorText } from "../lib/api-error";

const typeIcons: Record<SearchEntityType, typeof FileText> = { document: FileText, folder: Folder, list: List, list_item: List, task: CheckSquare, workflow: GitBranch, user: User, site: LayoutGrid, news: Newspaper };
const typeLabelKeys: Record<SearchEntityType, string> = { document: "search.documents", folder: "search.folders", list: "search.lists", list_item: "search.records", task: "search.tasks", workflow: "search.workflows", user: "search.users", site: "search.sites", news: "search.news" };
const allTypes: SearchEntityType[] = ["document", "folder", "list", "list_item", "task", "workflow", "user", "site", "news"];
const subtitleFallbackKeys: Partial<Record<SearchEntityType, string>> = { document: "search.noFolder", folder: "search.rootFolder", task: "search.unassigned" };

export function SearchPage() {
  const { t } = useTranslation();
  const { organization } = useWorkspace();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const paramQuery = searchParams.get("q") ?? "";
  const [query, setQuery] = useState(paramQuery);
  const [submittedQuery, setSubmittedQuery] = useState(paramQuery);
  const [selectedTypes, setSelectedTypes] = useState<Set<SearchEntityType>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const searchQuery = useQuery({ queryKey: ["search", organization.id, submittedQuery, [...selectedTypes].sort(), statusFilter], queryFn: () => searchApi.search(organization.id, submittedQuery, { types: selectedTypes.size ? [...selectedTypes] : undefined, status: statusFilter || undefined }), enabled: submittedQuery.length >= 2 });

  useEffect(() => {
    setQuery(paramQuery);
    setSubmittedQuery(paramQuery);
  }, [paramQuery]);

  function submit(event: FormEvent) { event.preventDefault(); const next = query.trim(); setSearchParams(next ? { q: next } : {}); }
  function toggleType(type: SearchEntityType) { setSelectedTypes((current) => { const next = new Set(current); if (next.has(type)) next.delete(type); else next.add(type); return next; }); }
  const results: SearchResponse | undefined = searchQuery.data;
  const typeLabel = (type: SearchEntityType) => t(typeLabelKeys[type]);

  return <Page><PageHeader eyebrow={organization.name} title={t("search.title")} description={t("search.description")} actions={<ContextualHelpButton route="/search" showLabel />} />
    <form onSubmit={submit}><Toolbar><div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input autoFocus className="pl-9" placeholder={t("common.search")} value={query} onChange={(event) => setQuery(event.target.value)} /></div><div className="flex gap-2"><Button type="submit" disabled={query.trim().length < 2}>{t("common.search")}</Button><Button type="button" variant={showFilters ? "secondary" : "outline"} aria-expanded={showFilters} onClick={() => setShowFilters((value) => !value)}><SlidersHorizontal />{t("common.filters")}{selectedTypes.size || statusFilter ? <Badge variant="primary">{selectedTypes.size + (statusFilter ? 1 : 0)}</Badge> : null}</Button></div></Toolbar></form>
    {showFilters ? <PageSection title={t("common.filters")} description={t("search.filtersDesc")}><div className="space-y-5"><div><p className="nx-label mb-2">{t("common.type")}</p><div className="flex flex-wrap gap-2">{allTypes.map((type) => <Button key={type} size="sm" variant={selectedTypes.has(type) ? "secondary" : "outline"} onClick={() => toggleType(type)}>{typeLabel(type)}</Button>)}</div></div><div className="max-w-sm"><label className="nx-label mb-1.5 block" htmlFor="search-status">{t("common.status")}</label><Input id="search-status" placeholder="TODO, RUNNING, COMPLETED..." value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} /></div></div></PageSection> : null}
    {submittedQuery.length < 2 ? <EmptyState icon={Search} title={t("search.introTitle")} description={t("search.introDesc")} /> : searchQuery.isPending ? <SearchSkeleton /> : searchQuery.isError ? <Alert variant="danger" title={t("common.error")}><p>{apiErrorText(searchQuery.error, t)}</p><Button className="mt-3" size="sm" onClick={() => void searchQuery.refetch()}>{t("common.retry")}</Button></Alert> : results?.total === 0 ? <EmptyState icon={Search} title={t("search.noResults", { query: submittedQuery })} description={t("search.noResultsDesc")} /> : <div className="space-y-8"><p className="text-sm text-muted-foreground">{t("search.resultsFor", { count: results?.total ?? 0, query: submittedQuery })} <span className="font-medium text-foreground">“{submittedQuery}”</span></p>{results?.groups.map((group) => <section key={group.type}><header className="mb-2 flex items-center gap-2 border-b border-border pb-2"><h2 className="nx-label uppercase tracking-wide">{typeLabel(group.type)}</h2><Badge>{group.total}</Badge></header><div className="divide-y divide-border">{group.results.map((result) => { const Icon = typeIcons[result.type] ?? FileText; const subtitle = result.subtitle ?? (subtitleFallbackKeys[result.type] ? t(subtitleFallbackKeys[result.type]!) : null); return <button key={`${result.type}-${result.id}`} type="button" className="nx-focus-ring group flex w-full items-center gap-3 rounded-sm px-2 py-3 text-left hover:bg-surface-secondary" onClick={() => navigate(result.href)}><span className="grid size-8 shrink-0 place-items-center rounded-md bg-surface-secondary text-muted-foreground group-hover:text-primary"><Icon className="size-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-foreground group-hover:text-primary">{result.title || t("search.record")}</span>{subtitle ? <span className="mt-0.5 block truncate text-xs text-muted-foreground">{subtitle}</span> : null}{result.snippet ? <span className="mt-1 block text-xs text-muted-foreground"><HighlightedSnippet text={result.snippet} query={submittedQuery} /></span> : null}</span><span className="hidden shrink-0 text-right text-xs text-muted-foreground sm:block">{result.status ? <Badge variant="outline">{result.status}</Badge> : null}<span className="mt-1 block">{result.createdBy?.name ?? ""}{result.createdBy ? " · " : ""}{new Date(result.createdAt).toLocaleDateString("pt-PT")}</span></span></button>; })}</div></section>)}</div>}
  </Page>;
}

function HighlightedSnippet({ text, query }: { text: string; query: string }) {
  const q = query.trim().toLowerCase();
  if (!q) return <>{text}</>;
  const lower = text.toLowerCase();
  const nodes: React.ReactNode[] = [];
  let index = 0;
  let key = 0;
  while (index <= text.length) {
    const found = lower.indexOf(q, index);
    if (found === -1) { nodes.push(text.slice(index)); break; }
    if (found > index) nodes.push(text.slice(index, found));
    nodes.push(<mark key={key++} className="rounded bg-warning/30 px-0.5">{text.slice(found, found + q.length)}</mark>);
    index = found + q.length;
  }
  return <>{nodes}</>;
}

function SearchSkeleton() { return <div className="space-y-6">{Array.from({ length: 3 }, (_, group) => <div className="space-y-2" key={group}><Skeleton className="h-5 w-32" />{Array.from({ length: 3 }, (_, item) => <Skeleton className="h-14 w-full" key={item} />)}</div>)}</div>; }
