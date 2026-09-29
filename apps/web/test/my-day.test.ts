import { describe, expect, it } from "vitest";
import type { TaskSummaryDto } from "@nexora/contracts";
import { categorizeMyDayTasks } from "../src/pages/my-day-page";

function task(partial: Partial<TaskSummaryDto> & { id: string }): TaskSummaryDto {
  return {
    title: partial.id,
    status: "TODO",
    priority: "NORMAL",
    startAt: null,
    dueAt: null,
    completedAt: null,
    tags: [],
    assignee: null,
    team: null,
    project: null,
    createdAt: new Date(2026, 0, 1).toISOString(),
    updatedAt: new Date(2026, 0, 1).toISOString(),
    ...partial
  };
}

describe("categorizeMyDayTasks", () => {
  const now = new Date(2026, 5, 15, 14, 30);

  it("splits tasks into overdue, today, upcoming and unscheduled buckets", () => {
    const tasks = [
      task({ id: "overdue", dueAt: new Date(2026, 5, 14, 23, 59).toISOString() }),
      task({ id: "today-early", dueAt: new Date(2026, 5, 15, 0, 0).toISOString() }),
      task({ id: "today-late", dueAt: new Date(2026, 5, 15, 23, 59).toISOString() }),
      task({ id: "tomorrow", dueAt: new Date(2026, 5, 16, 0, 0).toISOString() }),
      task({ id: "unscheduled" })
    ];

    const result = categorizeMyDayTasks(tasks, now);

    expect(result.overdue.map((entry) => entry.id)).toEqual(["overdue"]);
    expect(result.today.map((entry) => entry.id).sort()).toEqual(["today-early", "today-late"]);
    expect(result.upcoming.map((entry) => entry.id)).toEqual(["tomorrow"]);
    expect(result.unscheduled.map((entry) => entry.id)).toEqual(["unscheduled"]);
  });

  it("excludes DONE and CANCELLED tasks from every bucket", () => {
    const tasks = [
      task({ id: "done", status: "DONE", dueAt: new Date(2026, 5, 15, 10, 0).toISOString() }),
      task({ id: "cancelled", status: "CANCELLED", dueAt: new Date(2026, 5, 10, 10, 0).toISOString() }),
      task({ id: "active", status: "IN_PROGRESS", dueAt: new Date(2026, 5, 15, 10, 0).toISOString() })
    ];

    const result = categorizeMyDayTasks(tasks, now);
    const all = [...result.overdue, ...result.today, ...result.upcoming, ...result.unscheduled];

    expect(all.map((entry) => entry.id)).toEqual(["active"]);
  });
});
