import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LoginPage } from "../src/pages/login-page";
import { ThemeProvider } from "../src/components/theme-provider";

const session = {
  user: { id: "u1", name: "Test User", email: "t@nexora.app", avatar: null, status: "ACTIVE" },
  organizations: [{ id: "org-1", name: "Org", role: "ADMIN", permissions: ["users.read"], sites: [] }],
  organization: { id: "org-1", name: "Org", role: "ADMIN", permissions: ["users.read"], sites: [] }
};

function renderLogin() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
      <MemoryRouter initialEntries={["/login"]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/dashboard" element={<div>DASHBOARD_OK</div>} />
        </Routes>
      </MemoryRouter>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

describe("LoginPage", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("submits credentials and navigates to dashboard on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(session), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText(/email/i), "t@nexora.app");
    await user.type(screen.getByLabelText(/password/i), "Password12345");
    await user.click(screen.getByRole("button", { name: "Iniciar sessão" }));

    await waitFor(() => expect(screen.getByText("DASHBOARD_OK")).toBeInTheDocument());
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toContain("/auth/login");
    expect(JSON.parse(init.body)).toEqual({ email: "t@nexora.app", password: "Password12345" });
  });

  it("shows the API error message on failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "LOGIN_TEMPORARILY_UNAVAILABLE", message: "Credenciais inválidas." } }), { status: 401, headers: { "content-type": "application/json" } })
    ));
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText(/email/i), "t@nexora.app");
    await user.type(screen.getByLabelText(/password/i), "wrong-password");
    await user.click(screen.getByRole("button", { name: "Iniciar sessão" }));

    expect(await screen.findByText("Credenciais inválidas.")).toBeInTheDocument();
  });
});
