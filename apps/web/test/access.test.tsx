import type { OrganizationSummary } from "@nexora/contracts";
import { describe, expect, it } from "vitest";
import { canAccessAdmin } from "../src/components/layout/app-layout";

function orgWith(permissions: string[]): OrganizationSummary {
  return { id: "o1", name: "Org", slug: "org", role: "MEMBER", permissions, sites: [] } as unknown as OrganizationSummary;
}

describe("canAccessAdmin", () => {
  it("grants access to admin-scoped permissions", () => {
    expect(canAccessAdmin(orgWith(["users.create"]))).toBe(true);
    expect(canAccessAdmin(orgWith(["audit.view"]))).toBe(true);
    expect(canAccessAdmin(orgWith(["settings.manage"]))).toBe(true);
  });

  it("denies access to regular member permissions", () => {
    expect(canAccessAdmin(orgWith(["users.read", "documents.manage"]))).toBe(false);
    expect(canAccessAdmin(orgWith([]))).toBe(false);
  });
});
