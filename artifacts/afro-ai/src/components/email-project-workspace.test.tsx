import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({ query: vi.fn(), request: vi.fn(), invalidate: vi.fn(), toast: vi.fn() }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: mocks.query,
  useMutation: (options: any) => ({
    mutate: (value?: unknown) => Promise.resolve().then(() => options.mutationFn(value)).then(options.onSuccess).catch(options.onError),
    isPending: false,
  }),
}));
vi.mock("@/lib/queryClient", () => ({ apiRequest: mocks.request, queryClient: { invalidateQueries: mocks.invalidate } }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));

import { EmailProjectWorkspace } from "./email-project-workspace";

const projects = [
  { id: "legacy-1", name: "Existing email setup", legacy: true, createdAt: "2025-01-01", domainCount: 2, keyCount: 1 },
  { id: "app-2", name: "Receipts", legacy: false, createdAt: "2025-01-02", domainCount: 1, keyCount: 2 },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.query.mockReturnValue({ data: projects, isLoading: false, isError: false, refetch: vi.fn() });
  mocks.request.mockResolvedValue({ json: async () => ({ id: "app-3", name: "Notifications", legacy: false, domainCount: 0, keyCount: 0 }) });
});

describe("EmailProjectWorkspace", () => {
  it("shows project cards and opens the selected project's workspace", () => {
    const onSelect = vi.fn();
    render(<EmailProjectWorkspace selectedId={null} onSelect={onSelect} />);
    expect(screen.getByTestId("email-project-list")).toBeInTheDocument();
    expect(screen.getAllByText("Existing email setup").length).toBeGreaterThan(0);
    expect(screen.getAllByText("2").length).toBeGreaterThan(0);
    expect(screen.getAllByText("API keys").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByTestId("button-manage-email-project-legacy-1"));
    expect(onSelect).toHaveBeenCalledWith("legacy-1");
    expect(screen.getByRole("button", { name: "Create project" })).toBeInTheDocument();
  });

  it("selects the requested project and keeps legacy resources labelled", async () => {
    const onSelect = vi.fn();
    render(<EmailProjectWorkspace selectedId="legacy-1" onSelect={onSelect} />);
    expect(screen.getAllByText("Existing email setup").length).toBeGreaterThan(0);
    expect(screen.getByRole("combobox", { name: "Select email project" })).toHaveValue("legacy-1");
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "app-2" } });
    expect(onSelect).toHaveBeenCalledWith("app-2");
  });

  it("creates a named project and selects the returned project", async () => {
    const onSelect = vi.fn();
    render(<EmailProjectWorkspace selectedId="app-2" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: "New project" }));
    fireEvent.change(screen.getByLabelText("Project name"), { target: { value: "Notifications" } });
    fireEvent.click(screen.getByRole("button", { name: "Create project" }));
    await waitFor(() => expect(mocks.request).toHaveBeenCalledWith("POST", "/api/email-api/projects", { name: "Notifications" }));
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith("app-3"));
  });
});
