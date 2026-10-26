import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProjectWorkbench } from "./project-workbench";

const toast = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));

const baseView = () => ({
  workspaceId: "workspace-a",
  files: [{ path: "src/main.ts", language: "typescript", content: "export const value = 1;" }],
  plan: { requirements: "Build a small app", checks: ["Has entry point"], revision: 2 },
  inputs: [],
  checkpoints: [],
  reports: [{ id: "report-a", createdAt: "2025-01-01T00:00:00Z", status: "failed", checks: [], fingerprint: "fingerprint-a", source: "local" }],
  fingerprint: "fingerprint-a",
  repairs: 0,
  pending: { id: "pending-a", operations: [{ kind: "patch" as const, path: "src/main.ts", find: "1", replace: "2" }], expires: "2025-01-02T00:00:00Z" },
  execution: "customer-local",
  legacyWorkspaces: [{ conversationId: "legacy-5", files: 3 }],
});

let view: Omit<ReturnType<typeof baseView>, "pending"> & { pending: ReturnType<typeof baseView>["pending"] | null };
let client: QueryClient;
let fetchMock: ReturnType<typeof vi.fn>;

function mount(onRepair = vi.fn()) {
  render(<QueryClientProvider client={client}><ProjectWorkbench conversationId={12} onRepair={onRepair} /></QueryClientProvider>);
  fireEvent.click(screen.getByText("Project workbench"));
  return onRepair;
}

beforeEach(() => {
  view = baseView();
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  toast.mockReset();
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/workbench") && !init?.method) return Response.json(view);
    if (init?.method === "POST") {
      const endpoint = url.split("/workbench")[1];
      const body = JSON.parse(String(init.body));
      if (endpoint === "/review") view = { ...view, pending: null };
      if (endpoint === "/repair") return Response.json({ request: "Fix the reported structural issue." });
      if (endpoint === "/legacy") return Response.json({ id: "legacy-import-proposal" });
      if (endpoint === "/report") view = { ...view, reports: [...view.reports, { ...body.report, id: "imported", createdAt: "2025-01-02T00:00:00Z", source: "customer-reported" }] };
      return Response.json({});
    }
    return new Response(JSON.stringify({ message: "Not found" }), { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  client.clear();
  vi.unstubAllGlobals();
});

describe("ProjectWorkbench review and reporting", () => {
  it("applies a reviewed proposal only after the explicit confirmation step", async () => {
    mount();
    expect(await screen.findByRole("region", { name: "Pending workbench review" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Review apply confirmation" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply reviewed changes" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/conversations/12/workbench/review",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ id: "pending-a", cancel: false }) }),
    ));
    await waitFor(() => expect(screen.queryByRole("region", { name: "Pending workbench review" })).not.toBeInTheDocument());
  });

  it("cancels a proposal without applying it", async () => {
    mount();
    expect(await screen.findByRole("button", { name: "Review apply confirmation" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Review apply confirmation" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel proposal" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/conversations/12/workbench/review",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ id: "pending-a", cancel: true }) }),
    ));
    await waitFor(() => expect(screen.queryByRole("region", { name: "Pending workbench review" })).not.toBeInTheDocument());
  });

  it("surfaces report import authorization failures without claiming success", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST" && String(input).endsWith("/workbench/report")) {
        return new Response(JSON.stringify({ message: "Report import denied" }), { status: 403 });
      }
      if (String(input).endsWith("/workbench") && !init?.method) return Response.json(view);
      return Response.json({});
    });
    mount();
    await screen.findByText("Import local JSON report");
    const reportFile = new File([JSON.stringify({ status: "ok", checks: [] })], "report.json", { type: "application/json" });
    fireEvent.change(screen.getByLabelText("Choose local validation report"), { target: { files: [reportFile] } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Report import denied");
    expect(screen.queryByText("Customer-reported validation report imported")).not.toBeInTheDocument();
  });

  it("does not allow repairs once the three-attempt limit is reached", async () => {
    view = { ...view, repairs: 3 };
    const onRepair = mount();
    const repairButton = await screen.findByRole("button", { name: "Request repair (3/3)" });
    expect(repairButton).toBeDisabled();
    expect(onRepair).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining("/workbench/repair"), expect.anything());
  });

  it("sends successful repair requests to the caller for explicit chat review", async () => {
    const onRepair = mount();
    fireEvent.click(await screen.findByRole("button", { name: "Request repair (0/3)" }));
    await waitFor(() => expect(onRepair).toHaveBeenCalledWith("Fix the reported structural issue."));
  });

  it("reports legacy import collisions and confirms that originals remain untouched", async () => {
    view = { ...view, pending: null };
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST" && String(input).endsWith("/workbench/legacy")) {
        return new Response(JSON.stringify({ message: "A destination path already exists." }), { status: 409 });
      }
      if (String(input).endsWith("/workbench") && !init?.method) return Response.json(view);
      return Response.json({});
    });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Propose import" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("destination paths collide");
    expect(screen.getByRole("alert")).toHaveTextContent("original legacy workspace remains unchanged");
  });

  it("shows workbench GET errors and offers a retry", async () => {
    fetchMock.mockRejectedValueOnce(new Error("Ownership check failed"));
    mount();
    expect(await screen.findByRole("alert")).toHaveTextContent("Ownership check failed");
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
