import { useQuery } from "@tanstack/react-query";
import { collaborationApi } from "../../lib/api";

export function useCollaborationMembers(organizationId: string | undefined, enabled = true, q = "") {
  const query = q.trim().slice(0, 100);
  return useQuery({
    queryKey: ["collaboration-members", organizationId, query],
    queryFn: () => collaborationApi.members(organizationId!, query),
    enabled: enabled && Boolean(organizationId),
    staleTime: 5 * 60 * 1000
  });
}
