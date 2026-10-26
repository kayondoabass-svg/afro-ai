import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AgentCodeBlock, AgentHtmlPreview } from "./agent-code-block";

const html = '<!DOCTYPE html><html><body><h1>Event guide</h1><script>parent.document.title = "unsafe";</script></body></html>';
afterEach(() => vi.unstubAllGlobals());

describe("Agent generated HTML controls", () => {
  it("collapses HTML by default and opens an isolated preview only on request", () => {
    render(<AgentCodeBlock code={html} language="html" testId="source" />);
    expect(screen.getByRole("button", { name: "View Code" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByTestId("source")).not.toBeVisible();
    expect(screen.queryByTitle("Generated website preview")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "View Code" }));
    expect(screen.getByTestId("source")).toBeVisible();
    expect(screen.getByTestId("source").textContent).toBe(html);
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    const frame = screen.getByTitle("Generated website preview");
    expect(frame).toHaveAttribute("srcdoc", html);
    expect(frame).toHaveAttribute("sandbox", "allow-scripts");
    expect(frame).toHaveAttribute("referrerpolicy", "no-referrer");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByTitle("Generated website preview")).not.toBeInTheDocument();
  });
  it("hides ordinary snippets behind accessible code and copy icons", () => {
    render(<AgentCodeBlock code={'console.log("Ready");'} language="js" />);
    expect(screen.getByText('console.log("Ready");')).not.toBeVisible();
    expect(screen.getByRole("button", { name: "Copy code" })).toHaveAttribute("title", "Copy code");
    expect(screen.getByRole("button", { name: "Preview" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "View Code" }));
    expect(screen.getByText('console.log("Ready");')).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Hide Code" }));
    expect(screen.getByText('console.log("Ready");')).not.toBeVisible();
  });
  it("collapses streamed HTML but waits for complete markup before preview", () => {
    render(<AgentCodeBlock code="<html><body>" language="html" complete={false} />);
    expect(screen.getByRole("button", { name: "View Code" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "Preview" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
    expect(screen.getByText("Writing HTML…")).toBeVisible();
  });
  it("preserves source-only project restrictions", () => {
    const onPublish = vi.fn();
    render(<AgentCodeBlock code={html} language="html" previewBlocked onPublish={onPublish} />);
    expect(screen.getByRole("button", { name: "Preview" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "View Code" }));
    expect(screen.getByText(html)).toBeVisible();
  });
  it("uses the same sandbox for saved version previews", () => {
    render(<AgentHtmlPreview html={html} onClose={() => {}} />);
    expect(screen.getByTitle("Generated website preview")).toHaveAttribute("sandbox", "allow-scripts");
  });
  it("publishes through the existing callback without requiring a local preview", () => {
    const onPublish = vi.fn();
    render(<AgentCodeBlock code={html} language="html" onPublish={onPublish} />);
    expect(onPublish).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    expect(onPublish).toHaveBeenCalledWith(html);
    expect(screen.queryByTitle("Generated website preview")).not.toBeInTheDocument();
  });
  it("copies the exact source and confirms success", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<AgentCodeBlock code={html} language="html" />);
    fireEvent.click(screen.getByRole("button", { name: "Copy code" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Code copied."));
    expect(writeText).toHaveBeenCalledWith(html);
    expect(screen.getByRole("button", { name: "Copied code" })).toHaveAttribute("title", "Copied");
  });
  it("reports clipboard failure honestly and permits retry", async () => {
    const writeText = vi.fn().mockRejectedValueOnce(new Error("Denied")).mockResolvedValueOnce(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<AgentCodeBlock code={html} language="html" />);
    fireEvent.click(screen.getByRole("button", { name: "Copy code" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not copy code.");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Copy code" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Code copied.");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});