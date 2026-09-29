import type { WorkflowStepDto, WorkflowStepType } from "@nexora/contracts";
import { describe, expect, it } from "vitest";
import { validateWorkflowDraft } from "../src/components/workflows/workflow-draft";

let seq = 0;
function step(type: WorkflowStepType, name = `Step ${seq}`, config: Record<string, unknown> = {}): WorkflowStepDto {
  return { id: `s-${seq++}`, order: 0, type, name, config };
}

const validSteps = () => [step("START", "Start"), step("CREATE_TASK", "Criar tarefa", { title: "T" }), step("END", "End")];

describe("validateWorkflowDraft", () => {
  it("accepts a valid draft", () => {
    expect(validateWorkflowDraft("Processo", validSteps())).toEqual([]);
  });

  it("requires a non-empty name", () => {
    expect(validateWorkflowDraft("   ", validSteps()).map((i) => i.code)).toEqual(["nameRequired"]);
  });

  it("flags missing START and END", () => {
    const issues = validateWorkflowDraft("P", [step("CREATE_TASK", "T", { title: "x" })]).map((i) => i.code);
    expect(issues).toEqual(["startRequired", "endRequired"]);
  });

  it("flags START not first and END not last", () => {
    const issues = validateWorkflowDraft("P", [step("CREATE_TASK", "T", { title: "x" }), step("START"), step("END"), step("CONDITION", "C", { variable: "v" })]).map((i) => i.code);
    expect(issues).toContain("startFirst");
    expect(issues).toContain("endLast");
    expect(issues).not.toContain("startRequired");
    expect(issues).not.toContain("endRequired");
  });

  it("flags duplicate START and END", () => {
    const issues = validateWorkflowDraft("P", [step("START"), step("START"), step("END"), step("END")]).map((i) => i.code);
    expect(issues).toContain("startUnique");
    expect(issues).toContain("endUnique");
  });

  it("flags empty step names with the step index", () => {
    const steps = [step("START", "Start"), step("CREATE_TASK", "  ", { title: "x" }), step("END", "End")];
    const issues = validateWorkflowDraft("P", steps);
    expect(issues).toEqual([{ code: "stepNameRequired", stepIndex: 1 }]);
  });

  it.each<[WorkflowStepType, Record<string, unknown>, string[]]>([
    ["CREATE_TASK", {}, ["title"]],
    ["SEND_NOTIFICATION", {}, ["recipientId", "title", "body"]],
    ["SEND_NOTIFICATION", { recipientId: "m1", title: "t", body: "b" }, []],
    ["SEND_EMAIL", { to: "a@b.c" }, ["subject", "body"]],
    ["APPROVAL", {}, ["approverId"]],
    ["CHANGE_STATUS", {}, ["status"]],
    ["ASSIGN_USER", {}, ["assignedMembershipId"]],
    ["CHANGE_FIELD", {}, ["field"]],
    ["MOVE_DOCUMENT", { documentId: "d" }, ["folderId"]],
    ["CONDITION", {}, ["variable", "jumpToOrder"]],
    ["CONDITION", { variable: "v" }, ["jumpToOrder"]],
    ["CONDITION", { variable: "v", jumpToOrder: 1 }, []]
  ])("validates required config for %s", (type, config, missing) => {
    const steps = [step("START"), step(type, "Middle", config), step("END")];
    const issues = validateWorkflowDraft("P", steps);
    if (missing.length === 0) {
      expect(issues.filter((i) => i.code === "configRequired")).toEqual([]);
    } else {
      expect(issues).toEqual([{ code: "configRequired", stepIndex: 1, fields: missing }]);
    }
  });

  it("treats 0 and false as supplied config values", () => {
    const steps = [step("START"), step("CONDITION", "C", { variable: "x", jumpToOrder: 0 }), step("CHANGE_FIELD", "F", { field: "priority", value: false }), step("END")];
    expect(validateWorkflowDraft("P", steps)).toEqual([]);
  });

  it.each<number | string>([-1, 1.5, 99])("flags invalid CONDITION jump target %s", (target) => {
    const steps = [step("START"), step("CONDITION", "C", { variable: "x", jumpToOrder: target }), step("END")];
    const issues = validateWorkflowDraft("P", steps);
    expect(issues).toEqual([{ code: "jumpTargetInvalid", stepIndex: 1, fields: ["jumpToOrder"] }]);
  });

  it.each<number>([0, 2])("accepts valid CONDITION jump target %s", (target) => {
    const steps = [step("START"), step("CONDITION", "C", { variable: "x", jumpToOrder: target }), step("END")];
    expect(validateWorkflowDraft("P", steps)).toEqual([]);
  });

  it("flags an out-of-range optional approval rejection target but accepts a valid one", () => {
    const base = () => [step("START"), step("APPROVAL", "A", { approverId: "m1" }), step("END")];
    expect(validateWorkflowDraft("P", base())).toEqual([]);
    const invalid = [step("START"), step("APPROVAL", "A", { approverId: "m1", onRejectJumpToOrder: 5 }), step("END")];
    expect(validateWorkflowDraft("P", invalid)).toEqual([{ code: "jumpTargetInvalid", stepIndex: 1, fields: ["onRejectJumpToOrder"] }]);
    const fractional = [step("START"), step("APPROVAL", "A", { approverId: "m1", onRejectJumpToOrder: 0.5 }), step("END")];
    expect(validateWorkflowDraft("P", fractional)).toEqual([{ code: "jumpTargetInvalid", stepIndex: 1, fields: ["onRejectJumpToOrder"] }]);
    const valid = [step("START"), step("APPROVAL", "A", { approverId: "m1", onRejectJumpToOrder: 0 }), step("END")];
    expect(validateWorkflowDraft("P", valid)).toEqual([]);
  });

  it("emits structural issues before step issues in deterministic order", () => {
    const steps = [step("CREATE_TASK", "", {}), step("END", "End")];
    const issues = validateWorkflowDraft("", steps).map((i) => i.code);
    expect(issues).toEqual(["nameRequired", "startRequired", "stepNameRequired", "configRequired"]);
  });
});
