import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AgentCodeBlock, AgentHtmlPreview } from "./agent-code-block";

const html = '<!DOCTYPE html><html><body><h1>Event guide</h1><script>parent.document.title = "unsafe";</script></body></html>';

describe("Agent generated HTML controls", () => {
  it("collapses HTML by default and opens an isolated preview only on request", () => {
    render(<AgentCodeBlock code={html} language="html" testId="source" />);
    expect(screen.getByText("View Code").closest("details")).not.toHaveAttribute("open");
    expect(screen.getByTestId("source")).not.toBeVisible();
    expect(screen.queryByTitle("Generated website preview")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("View Code"));
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
  it("keeps ordinary code snippets readable without website controls", () => {
    render(<AgentCodeBlock code={'console.log("Ready");'} language="js" />);
    expect(screen.getByText('console.log("Ready");')).toBeVisible();
    expect(screen.queryByText("View Code")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Preview" })).not.toBeInTheDocument();
  });
  it("collapses streamed HTML but waits for complete markup before preview", () => {
    render(<AgentCodeBlock code="<html><body>" language="html" complete={false} />);
    expect(screen.getByText("View Code").closest("details")).not.toHaveAttribute("open");
    expect(screen.getByRole("button", { name: "Preview" })).toBeDisabled();
    expect(screen.getByText("Writing HTML…")).toBeVisible();
  });
  it("preserves source-only project restrictions", () => {
    render(<AgentCodeBlock code={html} language="html" previewBlocked />);
    expect(screen.getByRole("button", { name: "Preview" })).toBeDisabled();
    fireEvent.click(screen.getByText("View Code"));
    expect(screen.getByText(html)).toBeVisible();
  });
  it("uses the same sandbox for saved version previews", () => {
    render(<AgentHtmlPreview html={html} onClose={() => {}} />);
    expect(screen.getByTitle("Generated website preview")).toHaveAttribute("sandbox", "allow-scripts");
  });
});