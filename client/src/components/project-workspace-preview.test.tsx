import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ProjectWorkspacePreview } from "./project-workspace-preview";

function renderPreview(options: { projectType?: string; target?: any; projectId?: number; blocked?: boolean } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onTargetChange = vi.fn();
  const view = render(<QueryClientProvider client={client}>
    <ProjectWorkspacePreview conversationId={73} projectId={options.projectId ?? 18} projectType={options.projectType ?? "website"} blocked={options.blocked} target={options.target ?? { kind: "website" }} onTargetChange={onTargetChange} />
  </QueryClientProvider>);
  return { ...view, onTargetChange };
}

afterEach(() => vi.unstubAllGlobals());
it("opens current source files as escaped text without executing markup", () => {
  vi.stubGlobal("fetch", vi.fn());
  renderPreview({ target: { kind: "file", path: "index.html", content: "<script>danger()</script>" } });
  expect(screen.getByText("<script>danger()</script>")).toBeInTheDocument();
  expect(screen.getByText("Current project file · not a historical revision")).toBeInTheDocument();
  expect(document.querySelector("script")).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});

it("loads the owner-scoped saved website preview in an isolated iframe", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: true, json: async () => ({
      project: { id: 18, name: "Customer site", type: "website" }, hasContent: true,
      htmlContent: "<main>Saved page</main>", label: "Homepage", updatedAt: "2024-05-01", publishedUrl: null,
    }),
  })));
  renderPreview();
  const frame = await screen.findByTitle("Saved website preview: Customer site");
  expect(frame).toHaveAttribute("srcdoc", "<main>Saved page</main>");
  expect(frame.getAttribute("sandbox")).toBe("allow-scripts allow-forms");
  expect(frame.getAttribute("sandbox")).not.toContain("allow-same-origin");
  expect(vi.mocked(fetch)).toHaveBeenCalledWith("/api/projects/18/preview", { credentials: "include" });
});

it("shows a selected private evidence image using the conversation-owned image endpoint", async () => {
  vi.stubGlobal("fetch", vi.fn());
  renderPreview({ target: { kind: "evidence", id: "evidence-id", label: "Desktop capture" } });
  await waitFor(() => expect(screen.getByRole("img", { name: "Desktop capture" })).toHaveAttribute(
    "src", "/api/conversations/73/workbench/evidence/evidence-id/image",
  ));
});

it("keeps source-only full-stack projects blocked from runtime preview", async () => {
  vi.stubGlobal("fetch", vi.fn());
  renderPreview({ projectType: "fullstack" });
  expect(screen.getByText("Preview unavailable")).toBeInTheDocument();
  expect(vi.mocked(fetch)).not.toHaveBeenCalled();
});
