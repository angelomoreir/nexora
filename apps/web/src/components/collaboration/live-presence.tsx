import type { RealtimePresenceDto } from "@nexora/contracts";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/utils";
import { Avatar } from "../ui/avatar";
import type { RealtimeStatus } from "./use-realtime-channel";

const DOT_CLASS: Record<RealtimeStatus, string> = {
  live: "bg-success",
  connecting: "bg-warning animate-pulse",
  reconnecting: "bg-warning animate-pulse",
  offline: "bg-muted-foreground"
};

export function LivePresence({ status, presence, className }: { status: RealtimeStatus; presence: RealtimePresenceDto[]; className?: string }) {
  const { t } = useTranslation();
  const label = status === "live"
    ? presence.length <= 1
      ? t("collaboration.onlyYou")
      : t("collaboration.viewingNow", { count: presence.length })
    : status === "connecting"
      ? t("collaboration.connecting")
      : status === "reconnecting"
        ? t("collaboration.reconnecting")
        : t("collaboration.offline");

  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground", className)} aria-live="polite">
      <span className={cn("size-1.5 shrink-0 rounded-full", DOT_CLASS[status])} aria-hidden="true" />
      {status === "live" && presence.length > 0 ? (
        <span className="flex shrink-0 -space-x-1.5">
          {presence.slice(0, 3).map((person) => (
            <Avatar key={person.membershipId} name={person.name} src={person.avatar} size="sm" className="size-5 text-[8px] ring-1 ring-surface" />
          ))}
        </span>
      ) : null}
      <span className="truncate">{label}</span>
    </span>
  );
}
