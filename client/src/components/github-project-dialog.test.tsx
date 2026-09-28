import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { GithubProjectDialog, githubRepositoryUrl } from "./github-project-dialog";

const reply = (body: unknown, status = 200) => Promise.resolve({ ok: status < 400, status, json: async () => body } as Response);
const props = { open: true, conversationId: 12, onClose: vi.fn(), onImported: vi.fn(), prepareExport: vi.fn(async () => {}) };

describe("GitHub project workflow", () => {
  it("recognizes repository links, not lookalike hosts or raw files", () => {
    expect(githubRepositoryUrl("Help me import https://github.com/team/app")).toBe("https://github.com/team/app");
    expect(githubRepositoryUrl("https://github.com/team/app.git")).toBe("https://github.com/team/app.git");
    expect(githubRepositoryUrl("https://github.com/team/app/tree/main")).toBeNull();
    expect(githubRepositoryUrl("https://github.com/team/app/blob/main/file.ts")).toBeNull();
    expect(githubRepositoryUrl("https://github.com/team/app?tab=readme")).toBeNull();
    expect(githubRepositoryUrl("https://github.com.evil.example/team/app")).toBeNull();
    expect(githubRepositoryUrl("https://raw.githubusercontent.com/team/app/main/index.html")).toBeNull();
  });

  it("does not enable import for a tree URL or a root-looking prefix", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() => reply({ connected: true }));
    render(<GithubProjectDialog {...props} mode="import" url="https://github.com/team/app/tree/main" />);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("button", { name: "Import project files" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Repository root URL/), { target: { value: "https://github.com/team/app" } });
    expect(screen.getByRole("button", { name: "Import project files" })).toBeEnabled();
  });

  it("imports server-scanned files only after confirmation and displays exclusions", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((url) => String(url).endsWith("/status")
      ? reply({ connected: true })
      : reply({ files: [{ path: "src/app.ts" }], repo: { owner: "team", name: "app", branch: "dev" }, excluded: [{ path: "logo.png", reason: "Binary unsupported" }] }));
    render(<GithubProjectDialog {...props} mode="import" url="https://github.com/team/app" />);
    const button = screen.getByRole("button", { name: "Import project files" });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Branch/), { target: { value: "dev" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(button);
    await screen.findByText("logo.png: Binary unsupported");
    expect(fetchMock).toHaveBeenCalledWith("/api/github/import", expect.objectContaining({ body: JSON.stringify({ conversationId: 12, url: "https://github.com/team/app", branch: "dev", mode: "merge" }) }));
    expect(props.onImported).toHaveBeenCalled();
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("labels safe binary assets separately and explains transfer limits and LFS exclusion", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((url) => String(url).endsWith("/status")
      ? reply({ connected: true })
      : reply({ files: [{ path: "assets/logo.png", language: "binary", encoding: "base64", content: "AP8B" }, { path: "index.html", language: "html", content: "hi" }], repo: { owner: "team", name: "app", branch: "main" }, excluded: [{ path: "large.psd", reason: "Unsupported binary file" }] }));
    render(<GithubProjectDialog {...props} mode="import" url="https://github.com/team/app" />);
    expect(screen.getByText(/1 MB per file and 5 MB per project/)).toHaveTextContent("Git LFS objects are not imported or exported");
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Import project files" }));
    expect(await screen.findByText(/assets\/logo.png/)).toHaveTextContent("binary asset");
    expect(screen.getByText(/index.html/)).toHaveTextContent("(text)");
    expect(screen.getByText(/large.psd/)).toHaveTextContent("Unsupported binary file");
  });

  it("defaults to private, reviews only changed paths, and binds push to reviewed SHA", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      if (String(url).endsWith("/status")) return reply({ connected: true });
      if (String(url).endsWith("/preview")) return reply({ owner: "team", repoName: "app", branch: "main", baseSha: "abc", files: [{ path: "src/app.ts", change: "update" }, { path: "README.md", change: "unchanged" }] });
      return reply({ repoUrl: "https://github.com/team/app" });
    });
    render(<GithubProjectDialog {...props} mode="export" />);
    expect(screen.getByLabelText("Visibility for new repository")).toHaveValue("private");
    fireEvent.change(screen.getByLabelText("Repository name"), { target: { value: "app" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Review changed files" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Review changed files" }));
    await screen.findByText("update src/app.ts");
    expect(screen.queryByText(/README.md/)).toBeNull();
    expect(screen.getByRole("button", { name: "Confirm and push commit" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Confirm and push commit" }));
    await screen.findByText("View repository");
    expect(fetchMock).toHaveBeenCalledWith("/api/github/export", expect.objectContaining({ body: JSON.stringify({ conversationId: 12, repoName: "app", branch: "main", visibility: "private", message: "Update project from Afro AI", expectedSha: "abc" }) }));
  });

  it("requires another review after remote conflict", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      if (String(url).endsWith("/status")) return reply({ connected: true });
      if (String(url).endsWith("/preview")) return reply({ owner: "team", repoName: "app", branch: "main", baseSha: "abc", files: [{ path: "index.html", change: "add" }] });
      return reply({ error: "Conflict" }, 409);
    });
    render(<GithubProjectDialog {...props} mode="export" />);
    fireEvent.change(screen.getByLabelText("Repository name"), { target: { value: "app" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Review changed files" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Review changed files" }));
    await screen.findByText("add index.html");
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Confirm and push commit" }));
    await screen.findByRole("alert");
    expect(screen.getByRole("alert")).toHaveTextContent("remote branch or project changed");
    expect(screen.queryByRole("button", { name: "Confirm and push commit" })).toBeNull();
  });
});