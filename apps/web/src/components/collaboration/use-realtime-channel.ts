import { useEffect, useRef, useState } from "react";
import type { RealtimeEventDto, RealtimePresenceDto, RealtimeResourceType } from "@nexora/contracts";
import { authApi, getApiUrl } from "../../lib/api";

export type RealtimeChannel = { type: "notifications" } | { type: RealtimeResourceType; resourceId: string };
export type RealtimeStatus = "connecting" | "live" | "reconnecting" | "offline";

const RESOURCE_PATHS: Record<RealtimeResourceType, string> = {
  document: "documents",
  task: "tasks",
  news: "news",
  approval: "approvals"
};

export function useRealtimeChannel(input: {
  organizationId: string;
  channel: RealtimeChannel;
  enabled?: boolean;
  onEvent?: (event: RealtimeEventDto) => void;
}): { status: RealtimeStatus; presence: RealtimePresenceDto[] } {
  const { organizationId, channel, enabled = true, onEvent } = input;
  const [status, setStatus] = useState<RealtimeStatus>("connecting");
  const [presence, setPresence] = useState<RealtimePresenceDto[]>([]);
  const onEventRef = useRef(onEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  const channelType = channel.type;
  const resourceId = channel.type === "notifications" ? null : channel.resourceId;

  useEffect(() => {
    if (!enabled || !organizationId || (channelType !== "notifications" && !resourceId)) {
      setStatus("offline");
      setPresence([]);
      return;
    }
    if (typeof EventSource === "undefined") {
      setStatus("offline");
      setPresence([]);
      return;
    }

    const url = channelType === "notifications"
      ? `${getApiUrl()}/organizations/${organizationId}/notifications/events`
      : `${getApiUrl()}/organizations/${organizationId}/${RESOURCE_PATHS[channelType]}/${resourceId}/events`;

    let disposed = false;
    let source: EventSource | null = null;
    let retryDelay = 1000;
    let retryTimer: number | null = null;

    const closeSource = () => {
      if (source) {
        source.close();
        source = null;
      }
    };

    const connect = () => {
      if (disposed) return;
      closeSource();
      const next = new EventSource(url, { withCredentials: true });
      source = next;

      next.onopen = () => {
        if (disposed || source !== next) return;
        retryDelay = 1000;
        setStatus("live");
      };

      next.onmessage = (message) => {
        if (disposed || source !== next) return;
        let event: RealtimeEventDto | null = null;
        try {
          const parsed = JSON.parse(message.data) as unknown;
          if (parsed && typeof parsed === "object" && typeof (parsed as RealtimeEventDto).type === "string") {
            event = parsed as RealtimeEventDto;
          }
        } catch {
          event = null;
        }
        if (!event) return;
        if ((event.type === "connected" || event.type === "presence.updated") && Array.isArray(event.presence)) {
          setPresence(event.presence);
        }
        onEventRef.current?.(event);
      };

      next.onerror = () => {
        if (disposed || source !== next) return;
        closeSource();
        setStatus("reconnecting");
        const delay = retryDelay;
        retryDelay = Math.min(retryDelay * 2, 15000);
        void authApi.me().catch(() => undefined).finally(() => {
          if (!disposed) retryTimer = window.setTimeout(connect, delay);
        });
      };
    };

    setStatus("connecting");
    connect();

    return () => {
      disposed = true;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      closeSource();
      setPresence([]);
    };
  }, [organizationId, channelType, resourceId, enabled]);

  return { status, presence };
}
