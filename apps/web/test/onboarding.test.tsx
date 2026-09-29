import type { RoleName } from "@nexora/contracts";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OnboardingChecklist } from "../src/components/dashboard/onboarding-checklist";

const baseMetrics = { documents: 0, users: 1, tasks: 0, lists: 0, forms: 0, activeProcesses: 0 };
const adminPermissions = ["users.create", "documents.edit", "workflows.manage", "settings.manage", "tasks.manage", "lists.manage", "forms.manage", "documents.view", "approvals.view", "news.view"];

function renderChecklist({ roles = ["Admin"] as RoleName[], permissions = adminPermissions, metrics = baseMetrics } = {}) {
  return render(
    <MemoryRouter>
      <OnboardingChecklist organizationId="org-1" userId="u-1" roles={roles} permissions={permissions} metrics={metrics} onUploadDocument={vi.fn()} />
    </MemoryRouter>
  );
}

describe("OnboardingChecklist", () => {
  beforeEach(() => localStorage.clear());

  it("shows the admin badge and permitted steps, counting metric-complete steps", () => {
    renderChecklist({ metrics: { ...baseMetrics, documents: 2 } });
    expect(screen.getByText("Admin")).toBeInTheDocument();
    expect(screen.getByText("Convidar um colega")).toBeInTheDocument();
    expect(screen.getByText("Carregar um documento")).toBeInTheDocument();
    expect(screen.getByText("Criar um workflow")).toBeInTheDocument();
    expect(screen.getByText("Rever definições")).toBeInTheDocument();
    expect(screen.getByText("Abrir O meu dia")).toBeInTheDocument();
    expect(screen.getByText("1/5")).toBeInTheDocument();
  });

  it("shows only viewer-safe steps for the viewer profile", () => {
    renderChecklist({ roles: ["Viewer"], permissions: ["documents.view", "news.view"] });
    expect(screen.getByText("Abrir O meu dia")).toBeInTheDocument();
    expect(screen.getByText("Explorar documentos")).toBeInTheDocument();
    expect(screen.getByText("Explorar notícias")).toBeInTheDocument();
    expect(screen.getByText("Completar o perfil")).toBeInTheDocument();
    expect(screen.queryByText("Carregar um documento")).not.toBeInTheDocument();
    expect(screen.queryByText("Convidar um colega")).not.toBeInTheDocument();
    expect(screen.queryByText("Criar uma tarefa")).not.toBeInTheDocument();
    expect(screen.queryByText("Criar um workflow")).not.toBeInTheDocument();
    expect(screen.getByText("0/4")).toBeInTheDocument();
  });

  it("persists visited-step progress under the organization/user key", async () => {
    const user = userEvent.setup();
    const viewer = { roles: ["Viewer"] as RoleName[], permissions: ["documents.view", "news.view"] };
    const { unmount } = renderChecklist(viewer);
    await user.click(screen.getByRole("link", { name: /Abrir O meu dia/ }));
    expect(JSON.parse(localStorage.getItem("nexora.onboarding.dismissed.progress:org-1:u-1") ?? "[]")).toContain("myDay");
    unmount();
    renderChecklist(viewer);
    expect(screen.getByText("1/4")).toBeInTheDocument();
  });

  it("persists dismissal", async () => {
    const user = userEvent.setup();
    const { unmount } = renderChecklist();
    await user.click(screen.getAllByRole("button", { name: "Dispensar" })[0]!);
    unmount();
    const { container } = renderChecklist();
    expect(container).toBeEmptyDOMElement();
  });

  it("filters out steps whose required permission is missing", () => {
    renderChecklist({ permissions: adminPermissions.filter((permission) => permission !== "users.create") });
    expect(screen.queryByText("Convidar um colega")).not.toBeInTheDocument();
    expect(screen.getByText("0/4")).toBeInTheDocument();
  });
});
