import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, type RenderResult } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CollaborationMemberDto } from "@nexora/contracts";
import { collaborationApi } from "../src/lib/api";
import { MentionText, MentionTextarea } from "../src/components/collaboration/mention-textarea";

vi.mock("../src/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/api")>()),
  collaborationApi: { members: vi.fn() }
}));

const members: CollaborationMemberDto[] = [
  { membershipId: "m1", userId: "u1", name: "Ana Silva", avatar: null },
  { membershipId: "m2", userId: "u2", name: "Bruno Costa", avatar: null },
  { membershipId: "m3", userId: "u3", name: "Ana Beatriz", avatar: null }
];

beforeEach(() => {
  vi.mocked(collaborationApi.members).mockResolvedValue({ members });
});

function Harness({ initial = "", base = members }: { initial?: string; base?: CollaborationMemberDto[] }) {
  const [value, setValue] = useState(initial);
  return <MentionTextarea organizationId="org-1" members={base} value={value} onChange={(event) => setValue(event.target.value)} aria-label="comment" />;
}

function renderWithClient(ui: ReactNode): RenderResult {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("MentionTextarea", () => {
  it("suggests members while typing @ and inserts the full name on keyboard selection", async () => {
    const user = userEvent.setup();
    renderWithClient(<Harness />);
    const textarea = screen.getByRole("combobox", { name: "comment" });

    await user.type(textarea, "Olá @An");
    const listbox = await screen.findByRole("listbox");
    expect(screen.getByRole("option", { name: "Ana Silva" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Ana Beatriz" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Bruno Costa" })).not.toBeInTheDocument();
    expect(listbox).toBeInTheDocument();

    await user.keyboard("{ArrowDown}{Enter}");
    expect((textarea as HTMLTextAreaElement).value).toBe("Olá @Ana Beatriz ");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    await user.type(textarea, "obrigado");
    expect((textarea as HTMLTextAreaElement).value).toBe("Olá @Ana Beatriz obrigado");
  });

  it("selects a remotely returned member outside the supplied base list", async () => {
    const remoteOnly = { membershipId: "m9", userId: "u9", name: "Zofia Remote", avatar: null };
    vi.mocked(collaborationApi.members).mockResolvedValue({ members: [...members, remoteOnly] });
    const user = userEvent.setup();
    renderWithClient(<Harness base={members} />);
    const textarea = screen.getByRole("combobox", { name: "comment" });

    await user.type(textarea, "@Zo");
    expect(await screen.findByRole("option", { name: "Zofia Remote" })).toBeInTheDocument();
    await user.keyboard("{Enter}");
    expect((textarea as HTMLTextAreaElement).value).toBe("@Zofia Remote ");
    expect(collaborationApi.members).toHaveBeenCalledWith("org-1", "Zo");
  });

  it("closes suggestions on Escape and keeps normal textarea behaviour", async () => {
    const user = userEvent.setup();
    renderWithClient(<Harness />);
    const textarea = screen.getByRole("combobox", { name: "comment" });

    await user.type(textarea, "@Br");
    expect(await screen.findByRole("listbox")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect((textarea as HTMLTextAreaElement).value).toBe("@Br");

    await user.type(textarea, "uno continua");
    expect((textarea as HTMLTextAreaElement).value).toBe("@Bruno continua");
  });
});

describe("MentionText", () => {
  it("highlights exact full-name and legacy token mentions without HTML injection", () => {
    const { container } = render(<MentionText text="Olá @Ana Silva e @Bruno, revê <b>isto</b>." members={members} />);
    const highlighted = container.querySelectorAll("span.text-primary");
    expect(highlighted.length).toBe(2);
    expect(highlighted[0]!.textContent).toBe("@Ana Silva");
    expect(highlighted[1]!.textContent).toBe("@Bruno");
    expect(container.querySelector("b")).toBeNull();
    expect(container.textContent).toContain("<b>isto</b>");
  });
});
