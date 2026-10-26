import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ProjectWorkspacePreview } from "./project-workspace-preview";

function renderPreview(options: { projectType?: string; target?: any; projectId?: number | null; blocked?: boolean; conversationHtml?: string } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onTargetChange = vi.fn();
  const view = render(<QueryClientProvider client={client}>
    <ProjectWorkspacePreview conversationId={73} projectId={options.projectId === undefined ? 18 : options.projectId} projectType={options.projectType ?? "website"} blocked={options.blocked} conversationHtml={options.conversationHtml} target={options.target ?? { kind: "website" }} onTargetChange={onTargetChange} />
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
  fireEvent.click(screen.getByRole("button", { name: "Mobile", exact: true }));
  expect(screen.getByTestId("website-preview-frame")).toHaveClass("max-w-[390px]");
  expect(frame.getAttribute("sandbox")).not.toContain("allow-same-origin");
  fireEvent.click(screen.getByRole("button", { name: "Desktop", exact: true }));
  expect(screen.getByTestId("website-preview-frame")).toHaveClass("max-w-5xl");
});

it("shows a selected private evidence image using the conversation-owned image endpoint", async () => {
  vi.stubGlobal("fetch", vi.fn());
  renderPreview({ target: { kind: "evidence", id: "evidence-id", label: "Desktop capture" } });
  await waitFor(() => expect(screen.getByRole("img", { name: "Desktop capture" })).toHaveAttribute(
    "src", "/api/conversations/73/workbench/evidence/evidence-id/image",
  ));
  expect(screen.getByRole("link", { name: "Open full-size private image" })).toHaveAttribute("href", "/api/conversations/73/workbench/evidence/evidence-id/image");
  expect(screen.getByRole("link", { name: "Download" })).toHaveAttribute("download");
});

it("keeps source-only full-stack projects blocked from runtime preview", async () => {
  vi.stubGlobal("fetch", vi.fn());
  renderPreview({ projectType: "fullstack" });
  expect(screen.getByText("Preview unavailable")).toBeInTheDocument();
  expect(vi.mocked(fetch)).not.toHaveBeenCalled();
});

it("previews generated conversation HTML without requiring a separate project", () => {
  vi.stubGlobal("fetch", vi.fn());
  renderPreview({ projectId: null, conversationHtml: "<main>Conversation page</main>" });
  expect(screen.getByTitle("Saved website preview")).toHaveAttribute("srcdoc", "<main>Conversation page</main>");
  expect(screen.getByRole("button", { name: "Show website preview" })).toBeEnabled();
  expect(fetch).not.toHaveBeenCalled();
});

it("does not bypass blocked project metadata using conversation HTML", () => {
  vi.stubGlobal("fetch", vi.fn());
  renderPreview({ blocked: true, conversationHtml: "<main>Not authorized yet</main>" });
  expect(document.querySelector("iframe")).toBeNull();
  expect(screen.getByText("Preview paused")).toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
});
