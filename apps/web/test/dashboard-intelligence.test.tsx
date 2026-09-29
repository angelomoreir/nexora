import type { DashboardResponse } from "@nexora/contracts";
import { describe, expect, it } from "vitest";
import { getDashboardRecommendation, type DashboardRecommendationInput, type DashboardRecommendationKind } from "../src/components/dashboard/intelligence";

const metrics: DashboardResponse["metrics"] = {
  documents: 2,
  users: 3,
  teams: 1,
  pendingTasks: 0,
  activeProcesses: 1,
  pendingApprovals: 0,
  storageBytes: 0,
  tasks: 4,
  lists: 1,
  forms: 1
};
const allPermissions = ["documents.edit", "users.create", "workflows.manage"];

function input(overrides: Partial<DashboardRecommendationInput> = {}): DashboardRecommendationInput {
  return { urgentTasks: 0, pendingApprovals: 0, unreadNotifications: 0, metrics, permissions: allPermissions, ...overrides };
}

describe("getDashboardRecommendation", () => {
  const cases: Array<{ name: string; input: DashboardRecommendationInput; expected: DashboardRecommendationKind }> = [
    { name: "urgent tasks take precedence over every other signal", input: input({ urgentTasks: 2, pendingApprovals: 3, unreadNotifications: 4 }), expected: "urgentTasks" },
    { name: "pending approvals beat notifications and setup steps", input: input({ pendingApprovals: 2, unreadNotifications: 3, metrics: { ...metrics, documents: 0, users: 1, activeProcesses: 0 } }), expected: "approvals" },
    { name: "unread notifications beat setup recommendations", input: input({ unreadNotifications: 5, metrics: { ...metrics, documents: 0, users: 1, activeProcesses: 0 } }), expected: "notifications" },
    { name: "recommends a first document when none exist and the user can edit", input: input({ metrics: { ...metrics, documents: 0 } }), expected: "document" },
    { name: "document recommendation beats invite and workflow", input: input({ metrics: { ...metrics, documents: 0, users: 1, activeProcesses: 0 } }), expected: "document" },
    { name: "skips document recommendation without documents.edit", input: input({ metrics: { ...metrics, documents: 0 }, permissions: ["users.create", "workflows.manage"] }), expected: "myDay" },
    { name: "recommends inviting the team for a single-user organization", input: input({ metrics: { ...metrics, users: 1 } }), expected: "invite" },
    { name: "invite beats workflow when both apply", input: input({ metrics: { ...metrics, users: 1, activeProcesses: 0 } }), expected: "invite" },
    { name: "skips invite without users.create", input: input({ metrics: { ...metrics, users: 1 }, permissions: ["documents.edit", "workflows.manage"] }), expected: "myDay" },
    { name: "recommends a first workflow when none are active", input: input({ metrics: { ...metrics, activeProcesses: 0 } }), expected: "workflow" },
    { name: "skips workflow without workflows.manage", input: input({ metrics: { ...metrics, activeProcesses: 0 }, permissions: ["documents.edit", "users.create"] }), expected: "myDay" },
    { name: "falls back to My day when nothing needs attention", input: input(), expected: "myDay" }
  ];

  it.each(cases)("$name", ({ input: value, expected }) => {
    expect(getDashboardRecommendation(value)).toBe(expected);
  });
});
