import { useId, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent, type ReactNode, type SyntheticEvent } from "react";
import type { CollaborationMemberDto } from "@nexora/contracts";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/utils";
import { Avatar } from "../ui/avatar";
import { Textarea, type TextareaProps } from "../ui/textarea";
import { useCollaborationMembers } from "./use-collaboration-members";

function normalizeText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function activeMentionToken(value: string, caret: number): { start: number; query: string } | null {
  const before = value.slice(0, caret);
  const at = before.lastIndexOf("@");
  if (at === -1) return null;
  const preceding = before[at - 1];
  if (at > 0 && (!preceding || !/\s/.test(preceding))) return null;
  const query = before.slice(at + 1);
  if (/[\s]/.test(query)) return null;
  return { start: at, query };
}

function mentionPattern(members: CollaborationMemberDto[]): RegExp | null {
  const candidates = new Set<string>();
  for (const member of members) {
    const name = member.name.trim();
    if (!name) continue;
    candidates.add(name);
    const first = name.split(/\s+/)[0];
    if (first) candidates.add(first);
  }
  const alternation = [...candidates].sort((a, b) => b.length - a.length).map(escapeRegExp).join("|");
  if (!alternation) return null;
  return new RegExp(`(^|[^\\p{L}\\p{N}_])@(${alternation})(?=$|[^\\p{L}\\p{N}_])`, "giu");
}

export interface MentionTextareaProps extends Omit<TextareaProps, "value" | "onChange"> {
  organizationId: string;
  members: CollaborationMemberDto[];
  value: string;
  onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
}

export function MentionTextarea({ organizationId, members, value, onChange, className, ...props }: MentionTextareaProps) {
  const { t } = useTranslation();
  const listboxId = useId();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [caret, setCaret] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  const token = dismissed ? null : activeMentionToken(value, caret);
  const remote = useCollaborationMembers(organizationId, Boolean(token && token.query.length > 0), token?.query ?? "");
  const source = remote.data?.members ?? members;
  const suggestions = useMemo(() => {
    if (!token || source.length === 0) return [];
    const needle = normalizeText(token.query);
    return source
      .filter((member) => !needle || normalizeText(member.name).includes(needle))
      .slice(0, 6);
  }, [token, source]);
  const open = Boolean(token && (suggestions.length > 0 || token!.query.length > 0));

  function syncCaret(event: SyntheticEvent<HTMLTextAreaElement>) {
    setCaret(event.currentTarget.selectionStart ?? event.currentTarget.value.length);
  }

  function handleChange(event: ChangeEvent<HTMLTextAreaElement>) {
    setDismissed(false);
    setActiveIndex(0);
    setCaret(event.target.selectionStart ?? event.target.value.length);
    onChange(event);
  }

  function applySuggestion(member: CollaborationMemberDto) {
    if (!token) return;
    const next = `${value.slice(0, token.start)}@${member.name} ${value.slice(caret)}`;
    const nextCaret = token.start + member.name.length + 2;
    setCaret(nextCaret);
    setActiveIndex(0);
    onChange({
      target: { value: next, selectionStart: nextCaret, selectionEnd: nextCaret },
      currentTarget: { value: next }
    } as unknown as ChangeEvent<HTMLTextAreaElement>);
    window.setTimeout(() => {
      const textarea = textareaRef.current;
      if (textarea) {
        textarea.focus();
        textarea.setSelectionRange(nextCaret, nextCaret);
      }
    }, 0);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!open) return;
    if (event.key === "ArrowDown" && suggestions.length > 0) {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % suggestions.length);
    } else if (event.key === "ArrowUp" && suggestions.length > 0) {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + suggestions.length) % suggestions.length);
    } else if ((event.key === "Enter" || event.key === "Tab") && suggestions.length > 0) {
      event.preventDefault();
      const target = suggestions[Math.min(activeIndex, suggestions.length - 1)];
      if (target) applySuggestion(target);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setDismissed(true);
    }
  }

  return (
    <div className="relative">
      <Textarea
        ref={textareaRef}
        className={className}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onSelect={syncCaret}
        onClick={syncCaret}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        {...props}
      />
      {open ? (
        <div id={listboxId} role="listbox" aria-label={t("collaboration.mentionPeople")} className="absolute left-0 right-0 z-20 mt-1 overflow-hidden rounded-md border border-border bg-surface shadow-lg">
          {suggestions.length > 0 ? (
            suggestions.map((member, index) => (
              <button
                key={member.membershipId}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                className={cn("flex w-full items-center gap-2 px-3 py-2 text-left text-sm", index === activeIndex ? "bg-surface-secondary text-foreground" : "text-secondary-foreground hover:bg-surface-secondary")}
                onMouseDown={(event) => { event.preventDefault(); applySuggestion(member); }}
                onMouseEnter={() => setActiveIndex(index)}
              >
                <span aria-hidden="true"><Avatar name={member.name} src={member.avatar} size="sm" /></span>
                <span className="truncate">{member.name}</span>
              </button>
            ))
          ) : (
            <p className="px-3 py-2 text-sm text-muted-foreground">{t("collaboration.noMentionMatches")}</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function MentionText({ text, members, className }: { text: string; members: CollaborationMemberDto[]; className?: string }) {
  const pattern = useMemo(() => mentionPattern(members), [members]);
  if (!pattern) return <span className={className}>{text}</span>;
  const nodes: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    const prefix = match[1] ?? "";
    const mentionText = match[0].slice(prefix.length);
    if (index > last) nodes.push(text.slice(last, index));
    if (prefix) nodes.push(prefix);
    nodes.push(<span key={key++} className="font-medium text-primary">{mentionText}</span>);
    last = index + match[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return <span className={className}>{nodes}</span>;
}
