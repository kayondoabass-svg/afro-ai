import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const state = vi.hoisted(() => ({
  status: "draft", type: "fullstack", verified: true, failed: false, saved: true, resume: false,
}));
vi.mock("@/pages/ai-chat", () => ({ PublishDialog: ({ open }: { open: boolean }) => open ? <div data-testid="static-publish-dialog">Static publish</div> : null }));
vi.mock("@/components/github-project-dialog", () => ({
  GithubProjectDialog: ({ open, mode, conversationId }: { open: boolean; mode: string; conversationId: number }) =>
    open ? <div data-testid="github-export-dialog">{mode} saved conversation {conversationId} · Review changed files and confirm commit</div> : null,
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ t: (key: string) => key }) }));
vi.mock("wouter", () => ({ useLocation: () => ["/chat", vi.fn()], useSearch: () => window.location.search.slice(1) }));
vi.mock("@/components/file-tree-sidebar", () => ({ FileTreeSidebar: () => <div>Saved starter files</div> }));
vi.mock("@/components/fullstack-infrastructure", () => ({ FullstackInfrastructure: () => <div data-testid="fullstack-infrastructure">Infrastructure controls</div> }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => ({
    data: queryKey[0] === "/api/auth/user" ? { firstName: "Amina" }
      : queryKey[0] === "/api/projects" ? state.verified ? [{ id: 81, name: "Kampala Studio", type: state.type, status: state.status }] : undefined
      : queryKey[2] === "project-proposal" ? null : [],
    isSuccess: queryKey[0] !== "/api/projects" || state.verified,
    isError: state.failed, refetch: vi.fn(),
  }),
  useQueryClient: () => ({ invalidateQueries: vi.fn(), setQueryData: vi.fn() }),
}));

import AgentPage from "./agent";

beforeEach(() => {
  state.status = "draft";
  state.type = "fullstack";
  state.verified = true;
  state.failed = false;
  state.saved = true;
  state.resume = false;
  window.history.replaceState({}, "", "/chat?projectId=81&project=Kampala%20Studio");
  Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: vi.fn() });
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url === "/api/conversations/project/81") return Response.json(state.resume ? [{ id: 91 }] : []);
    if (url === "/api/conversations") return state.saved ? Response.json({ id: 91 }) : new Promise<Response>(() => {});
    if (url === "/api/conversations/91/messages") return new Response('data: {"type":"text","content":"Review ready."}\n\ndata: {"done":true}\n\n');
    if (url === "/api/conversations/91") return Response.json({ projectId: 81, messages: state.resume ? [{ id: 1, role: "assistant", content: "```html\n<!DOCTYPE html><html><body>Studio portfolio</body></html>\n```" }] : [] });
    throw new Error(`Unexpected request ${url}`);
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
});

describe("full-stack agent workspace", () => {
  it("detects metadata without a mode hint, opens Files and disables static deployment", async () => {
    render(<AgentPage />);
    expect(screen.getByTestId("fullstack-source-notice")).toHaveTextContent("a ready database does not mean the app is running");
    expect(screen.getByTestId("fullstack-infrastructure")).toBeInTheDocument();
    expect(screen.getByText("Saved starter files")).toBeInTheDocument();
    expect(screen.getByTestId("button-project-agent")).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByTestId("button-publish")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("button-github-export")).toBeEnabled());
    expect(screen.getByTestId("nav-preview")).toBeDisabled();
    expect(screen.queryByTestId("checkbox-plan-mode")).not.toBeInTheDocument();
    expect(screen.getByTestId("automatic-planning")).toHaveTextContent("Auto plan");
    // Close the file drawer to interact with the underlying composer.
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Message to Afro AI" }), { target: { value: "Add a health endpoint" } });
    fireEvent.click(screen.getByTestId("button-send"));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/conversations/91/messages", expect.objectContaining({
      body: JSON.stringify({ content: "Add a health endpoint", projectAgent: true }),
    })));
  });

  it.each(["setup_failed", "initializing"])("blocks sending and conversation creation while %s", (status) => {
    state.status = status;
    render(<AgentPage />);
    expect(screen.getByTestId("button-send")).toBeDisabled();
    expect(screen.getByTestId("button-github-export")).toBeDisabled();
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Back to dashboard" })).toBeInTheDocument();
  });

  it("fails closed when project metadata cannot be verified", () => {
    state.verified = false;
    state.failed = true;
    window.history.replaceState({}, "", "/chat?projectId=81&projectMode=fullstack");
    render(<AgentPage />);
    expect(screen.getByTestId("button-github-export")).toBeDisabled();
    expect(screen.getByTestId("button-send")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Retry project check" })).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("preserves website controls", () => {
    state.type = "website";
    render(<AgentPage />);
    expect(screen.queryByTestId("fullstack-source-notice")).not.toBeInTheDocument();
    expect(screen.getByTestId("button-publish")).not.toBeDisabled();
    expect(screen.getByTestId("nav-preview")).not.toBeDisabled();
    expect(screen.getByTestId("button-project-agent")).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByTestId("button-github-export")).not.toBeInTheDocument();
  });

  it("opens GitHub review with the current saved conversation, without pushing", async () => {
    render(<AgentPage />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.getByTestId("button-github-export")).toBeEnabled());
    fireEvent.click(screen.getByTestId("button-github-export"));
    expect(screen.getByTestId("github-export-dialog")).toHaveTextContent("export saved conversation 91");
    expect(fetch).not.toHaveBeenCalledWith("/api/github/export", expect.anything());
    expect(screen.getByTestId("fullstack-source-notice")).toHaveTextContent("does not host Workers or provision D1");
  });

  it.each(["publish", "Please deploy my app", "make this project live", "go live"])("intercepts full-stack publish intent: %s", async text => {
    render(<AgentPage />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.getByTestId("button-github-export")).toBeEnabled());
    fireEvent.change(screen.getByRole("textbox", { name: "Message to Afro AI" }), { target: { value: text } });
    fireEvent.click(screen.getByTestId("button-send"));
    expect(screen.getByTestId("github-export-dialog")).toBeInTheDocument();
    expect(screen.queryByTestId("static-publish-dialog")).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalledWith("/api/conversations/91/messages", expect.anything());
  });

  it("disables export until there is a saved conversation and never sends publish to AI", async () => {
    state.saved = false;
    render(<AgentPage />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByTestId("button-github-export")).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", { name: "Message to Afro AI" }), { target: { value: "deploy" } });
    fireEvent.click(screen.getByTestId("button-send"));
    expect(screen.queryByTestId("github-export-dialog")).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalledWith("/api/conversations/91/messages", expect.anything());
  });

  it("keeps natural-language static publishing for ordinary websites", async () => {
    state.type = "website";
    state.resume = true;
    render(<AgentPage />);
    await screen.findByText(/Studio portfolio/);
    fireEvent.change(screen.getByRole("textbox", { name: "Message to Afro AI" }), { target: { value: "publish" } });
    fireEvent.click(screen.getByTestId("button-send"));
    expect(screen.getByTestId("static-publish-dialog")).toBeInTheDocument();
    expect(screen.queryByTestId("github-export-dialog")).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalledWith("/api/conversations/91/messages", expect.anything());
  });
});