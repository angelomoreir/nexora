import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CommandMenu, type CommandItem } from "../src/components/ui/command-menu";

function makeItems(): CommandItem[] {
  return [
    { id: "a", label: "Documentos", onSelect: vi.fn() },
    { id: "b", label: "Tarefas", keywords: ["tasks"], onSelect: vi.fn() },
    { id: "c", label: "Workflows", onSelect: vi.fn() }
  ];
}

describe("CommandMenu", () => {
  it("filters items by label and keywords", async () => {
    const user = userEvent.setup();
    render(<CommandMenu open onOpenChange={vi.fn()} items={makeItems()} />);
    await user.type(screen.getByRole("combobox"), "tasks");
    expect(screen.getByRole("option", { name: /Tarefas/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Documentos/ })).not.toBeInTheDocument();
  });

  it("renders group headings and selects flattened items across groups", async () => {
    const user = userEvent.setup();
    const items: CommandItem[] = [
      { id: "r1", label: "Contrato.pdf", group: "Documentos", onSelect: vi.fn() },
      { id: "n1", label: "Tarefas", group: "Navegação", onSelect: vi.fn() },
      { id: "n2", label: "Aprovações", group: "Navegação", onSelect: vi.fn() }
    ];
    render(<CommandMenu open onOpenChange={vi.fn()} items={items} />);

    expect(screen.getByText("Documentos")).toBeInTheDocument();
    expect(screen.getByText("Navegação")).toBeInTheDocument();

    const input = screen.getByRole("combobox");
    await user.click(input);
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(screen.getByRole("option", { name: /Aprovações/ })).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{Enter}");

    expect(items[2]!.onSelect).toHaveBeenCalledOnce();
    expect(items[0]!.onSelect).not.toHaveBeenCalled();
    expect(items[1]!.onSelect).not.toHaveBeenCalled();
  });

  it("navigates with arrows and executes with Enter", async () => {
    const user = userEvent.setup();
    const items = makeItems();
    const onOpenChange = vi.fn();
    render(<CommandMenu open onOpenChange={onOpenChange} items={items} />);

    const input = screen.getByRole("combobox");
    await user.click(input);
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("option", { name: /Tarefas/ })).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{Enter}");

    expect(items[1]!.onSelect).toHaveBeenCalledOnce();
    expect(items[0]!.onSelect).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("calls onQueryChange for remote search", async () => {
    const user = userEvent.setup();
    const onQueryChange = vi.fn();
    render(<CommandMenu open onOpenChange={vi.fn()} items={[]} onQueryChange={onQueryChange} />);
    await user.type(screen.getByRole("combobox"), "abc");
    expect(onQueryChange).toHaveBeenLastCalledWith("abc");
  });
});
