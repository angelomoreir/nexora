import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContextualCopilot } from "../src/components/ai/contextual-copilot";
import { aiApi } from "../src/lib/api";

function renderCopilot(props: { organizationId?: string; resourceType: "document" | "task" | "list" | "workflow"; resourceId?: string; resourceName?: string }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ContextualCopilot organizationId={props.organizationId ?? "org-1"} resourceType={props.resourceType} resourceId={props.resourceId ?? "res-1"} resourceName={props.resourceName ?? "Recurso de teste"} />
    </QueryClientProvider>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ContextualCopilot", () => {
  it("task summary quick prompt calls aiApi.contextual and renders answer with token badge", async () => {
    const user = userEvent.setup();
    const contextual = vi.spyOn(aiApi, "contextual").mockResolvedValue({
      resourceType: "task",
      resourceId: "task-42",
      resourceName: "Tarefa X",
      answer: "Resposta contextual da tarefa",
      usage: { tokensUsed: 15, costUsd: 0 }
    });
    renderCopilot({ resourceType: "task", resourceId: "task-42", resourceName: "Tarefa X" });

    await user.click(screen.getByRole("button", { name: "Copilot" }));
    await user.click(await screen.findByRole("button", { name: "Resumir" }));

    await waitFor(() => expect(contextual).toHaveBeenCalledWith("org-1", { resourceType: "task", resourceId: "task-42", prompt: "Resuma a informação mais importante deste recurso." }));
    expect(await screen.findByText("Resposta contextual da tarefa")).toBeInTheDocument();
    expect(screen.getByText("15 tokens")).toBeInTheDocument();
  });

  it("document summary quick prompt calls summarizeDocument instead of contextual", async () => {
    const user = userEvent.setup();
    const summarize = vi.spyOn(aiApi, "summarizeDocument").mockResolvedValue({
      documentId: "doc-7",
      documentName: "Doc",
      summary: "Resumo do documento",
      keywords: ["contrato"],
      classification: "legal",
      usage: { tokensUsed: 9, costUsd: 0 }
    });
    const contextual = vi.spyOn(aiApi, "contextual").mockResolvedValue({
      resourceType: "document",
      resourceId: "doc-7",
      resourceName: "Doc",
      answer: "should not be used",
      usage: { tokensUsed: 1, costUsd: 0 }
    });
    renderCopilot({ resourceType: "document", resourceId: "doc-7", resourceName: "Doc" });

    await user.click(screen.getByRole("button", { name: "Copilot" }));
    await user.click(await screen.findByRole("button", { name: "Resumir" }));

    await waitFor(() => expect(summarize).toHaveBeenCalledWith("org-1", "doc-7"));
    expect(contextual).not.toHaveBeenCalled();
    expect(await screen.findByText("Resumo do documento")).toBeInTheDocument();
  });

  it("free-text failure shows error and Retry resubmits the same prompt", async () => {
    const user = userEvent.setup();
    const contextual = vi.spyOn(aiApi, "contextual")
      .mockRejectedValueOnce(new Error("Falha simulada"))
      .mockResolvedValueOnce({
        resourceType: "list",
        resourceId: "list-9",
        resourceName: "Lista",
        answer: "Resposta após retry",
        usage: { tokensUsed: 4, costUsd: 0 }
      });
    renderCopilot({ resourceType: "list", resourceId: "list-9", resourceName: "Lista" });

    await user.click(screen.getByRole("button", { name: "Copilot" }));
    const input = await screen.findByPlaceholderText("Pergunte sobre este recurso…");
    await user.type(input, "Quantos registos tem?");
    await user.click(screen.getByRole("button", { name: "Enviar" }));

    expect(await screen.findByText("Não foi possível obter uma resposta")).toBeInTheDocument();
    expect(screen.getByText("Falha simulada")).toBeInTheDocument();
    expect(contextual).toHaveBeenCalledWith("org-1", { resourceType: "list", resourceId: "list-9", prompt: "Quantos registos tem?" });

    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    await waitFor(() => expect(contextual).toHaveBeenCalledTimes(2));
    expect(contextual).toHaveBeenNthCalledWith(2, "org-1", { resourceType: "list", resourceId: "list-9", prompt: "Quantos registos tem?" });
    expect(await screen.findByText("Resposta após retry")).toBeInTheDocument();
  });
});
