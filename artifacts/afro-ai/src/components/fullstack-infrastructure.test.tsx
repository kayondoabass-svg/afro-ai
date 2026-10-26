import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FullstackInfrastructure } from "./fullstack-infrastructure";
import { infrastructureKey, infrastructurePollInterval, type InfrastructureView } from "@/hooks/use-fullstack-infrastructure";

const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@/lib/queryClient", () => ({ apiRequest: mocks.request }));

const project = { id: 81, name: "Kampala Studio", type: "fullstack", status: "draft" };
let view: InfrastructureView;
let client: QueryClient;
const base = "/api/projects/81/infrastructure";

function mount(status = "draft") {
  render(<QueryClientProvider client={client}><FullstackInfrastructure project={{ ...project, status }} /></QueryClientProvider>);
}
beforeEach(() => {
  view = {
    state: "not_provisioned", databaseName: null, lastError: null, migrationsApplied: 0,
    canProvision: true, configured: true, limits: { databasesPerUser: 3, provisionsPerDay: 7 },
    hosting: { available: false, reason: "Isolated hosting has not been activated." },
  };
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  mocks.request.mockReset();
  mocks.request.mockImplementation(async () => Response.json(view));
});
afterEach(() => { cleanup(); client.clear(); });

describe("FullstackInfrastructure", () => {
  it.each([403, 404])("fails closed on owner check errors (%s) with status retry", async code => {
    mocks.request.mockRejectedValue(new Error(`${code}: {"message":"Project unavailable"}`));
    mount();
    expect(await screen.findByRole("alert")).toHaveTextContent("Project unavailable");
    expect(screen.queryByRole("button", { name: "Provision database" })).not.toBeInTheDocument();
    mocks.request.mockResolvedValue(Response.json(view));
    fireEvent.click(screen.getByRole("button", { name: "Retry status check" }));
    expect(await screen.findByRole("button", { name: "Provision database" })).toBeEnabled();
  });

  it("shows skeletons and does not provision while status is unresolved", () => {
    mocks.request.mockImplementation(() => new Promise(() => {}));
    mount();
    expect(screen.getByLabelText("Loading infrastructure")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Provision database" })).not.toBeInTheDocument();
  });

  it.each([
    { canProvision: false, configured: true },
    { canProvision: true, configured: false },
  ])("fails closed on server eligibility/configuration %j", async flags => {
    Object.assign(view, flags);
    mount();
    expect(await screen.findByRole("button", { name: "Provision database" })).toBeDisabled();
    expect(mocks.request).toHaveBeenCalledWith("GET", base);
  });

  it("fails closed when a previously eligible status cannot be reverified", async () => {
    client.setQueryData(infrastructureKey(81), view);
    mocks.request.mockRejectedValue(new Error('403: {"message":"Ownership denied"}'));
    mount();
    expect(await screen.findByRole("alert")).toHaveTextContent("Ownership denied");
    expect(screen.queryByRole("button", { name: "Provision database" })).not.toBeInTheDocument();
  });

  it.each(["initializing", "setup_failed"])("blocks provisioning until starter setup completes (%s)", async status => {
    mount(status);
    expect(await screen.findByRole("button", { name: "Provision database" })).toBeDisabled();
    expect(screen.getByText(/Complete starter setup/)).toBeInTheDocument();
  });

  it("provisions with an empty body and invalidates status and file queries", async () => {
    const invalidate = vi.spyOn(client, "invalidateQueries");
    mocks.request.mockImplementation(async (method: string) => {
      if (method === "POST") view = { ...view, state: "ready", databaseName: "afro-project-81", migrationsApplied: 2 };
      return Response.json(view);
    });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Provision database" }));
    expect(await screen.findByText("Database ready")).toBeInTheDocument();
    expect(mocks.request).toHaveBeenCalledWith("POST", `${base}/provision`, {});
    expect(invalidate).toHaveBeenCalledWith({ queryKey: infrastructureKey(81) });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["/api/d1/project-files"] });
    expect(screen.getByText(/Your app is not running or live/)).toBeInTheDocument();
  });

  it.each(["failed", "provisioning"] as const)("allows retry in %s, surfaces 409 without fake success", async state => {
    view = { ...view, state, lastError: state === "failed" ? "Migration failed" : null };
    mocks.request.mockImplementation(async (method: string) => {
      if (method === "POST") throw new Error('409: {"message":"Provisioning is busy. Please wait."}');
      return Response.json(view);
    });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Retry provisioning" }));
    expect(await screen.findByText(/Provisioning is busy/)).toBeInTheDocument();
    expect(screen.queryByText("Database ready")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Retry provisioning" })).toBeEnabled());
  });

  it("requires an exact name, deletes despite lapsed paid access, and retains source", async () => {
    view = { ...view, state: "ready", databaseName: "afro-project-81", canProvision: false, configured: false };
    const invalidate = vi.spyOn(client, "invalidateQueries");
    mocks.request.mockImplementation(async (method: string) => {
      if (method === "POST") view = { ...view, state: "deleting" };
      return Response.json(view);
    });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Delete database" }));
    const confirm = screen.getByRole("button", { name: "Permanently delete database" });
    expect(confirm).toBeDisabled();
    expect(screen.getByText(/This permanently deletes the database/)).toHaveTextContent("cannot be undone");
    fireEvent.change(screen.getByLabelText(/Type the exact project name/), { target: { value: "Kampala Studio " } });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Type the exact project name/), { target: { value: "Kampala Studio" } });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    expect(await screen.findByText("Deleting database…")).toBeInTheDocument();
    expect(mocks.request).toHaveBeenCalledWith("POST", `${base}/delete`, { confirmation: "Kampala Studio" });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["/api/d1/project-files"] });
    expect(screen.queryByRole("button", { name: "Delete database" })).not.toBeInTheDocument();
    view = { ...view, state: "deleted", databaseName: null };
    await client.invalidateQueries({ queryKey: infrastructureKey(81) });
    expect(await screen.findByText(/Database deleted. Existing project source files are retained/)).toBeInTheDocument();
  });

  it("keeps deletion confirmation on server errors and allows safe retry/cancel", async () => {
    view = { ...view, state: "ready", databaseName: "afro-project-81" };
    mocks.request.mockImplementation(async (method: string) => {
      if (method === "POST") throw new Error('409: {"message":"Deletion is busy"}');
      return Response.json(view);
    });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Delete database" }));
    fireEvent.change(screen.getByLabelText(/Type the exact project name/), { target: { value: project.name } });
    fireEvent.click(screen.getByRole("button", { name: "Permanently delete database" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Deletion is busy");
    expect(screen.queryByText("Database deleted")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText(/Type the exact project name/)).not.toBeInTheDocument();
  });

  it("explains deferred managed hosting and customer deployment without runnable controls", async () => {
    view = { ...view, canProvision: false, configured: false };
    mount();
    expect(await screen.findByRole("button", { name: "Provision database" })).toBeDisabled();
    expect(screen.getByText(/Managed database provisioning is deferred/)).toBeInTheDocument();
    expect(screen.getByText(/D1 operations and storage may be billed to the platform/)).toBeInTheDocument();
    expect(screen.getByText(/GitHub stores code/)).toHaveTextContent("does not host Workers or provision D1");
    expect(screen.getByText(/Ordinary websites continue/)).toHaveTextContent("*.afroaigroup.com");
    expect(screen.queryByRole("button", { name: /publish|deploy|preview/i })).not.toBeInTheDocument();
  });

  it("polls only active provisioning/deletion at three seconds", () => {
    expect(infrastructurePollInterval({ ...view, state: "provisioning" })).toBe(3000);
    expect(infrastructurePollInterval({ ...view, state: "deleting" })).toBe(3000);
    for (const state of ["ready", "failed", "not_provisioned", "deleted"] as const) {
      expect(infrastructurePollInterval({ ...view, state })).toBe(false);
    }
    expect(infrastructurePollInterval()).toBe(false);
  });
});