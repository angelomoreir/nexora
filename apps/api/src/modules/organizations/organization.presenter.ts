import type { OrganizationSummary, RoleName } from "@nexora/contracts";
import type { Organization, OrganizationMember, OrganizationSettings, Permission, Role, RolePermission } from "@prisma/client";

type MembershipWithOrganization = OrganizationMember & {
  tenant: Organization & { organizationSettings?: Pick<OrganizationSettings, "logoUrl"> | null };
  membershipRoles: Array<{ role: Role & { permissions?: Array<RolePermission & { permission: Permission }> } }>;
};

export function presentOrganizationMembership(membership: MembershipWithOrganization): OrganizationSummary {
  return {
    id: membership.tenant.id,
    name: membership.tenant.name,
    slug: membership.tenant.slug,
    status: membership.tenant.status,
    memberStatus: membership.status as OrganizationSummary["memberStatus"],
    logoUrl: membership.tenant.organizationSettings?.logoUrl ?? null,
    roles: membership.membershipRoles.map(({ role }) => role.name as RoleName),
    permissions: [...new Set(membership.membershipRoles.flatMap(({ role }) => (role.permissions ?? []).map(({ permission }) => permission.key)))]
  };
}
