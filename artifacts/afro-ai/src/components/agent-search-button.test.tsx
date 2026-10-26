import { render, screen, fireEvent } from "@testing-library/react";
import { expect, it } from "vitest";
import { AgentSearchButton } from "./agent-search-button";
it("finds actual code lines and shows real web source links", () => {
  render(<AgentSearchButton code={"const first = 1;\nfunction login() {}"} activities={[{
    type: "web-search", status: "success", query: "public docs", sources: [{ title: "Documentation", url: "https://example.org/docs", snippet: "Docs", retrievedAt: "2026-10-04" }],
  }]} />);
  fireEvent.click(screen.getByRole("button", { name: "Search code and web sources" }));
  fireEvent.change(screen.getByLabelText("Find in code"), { target: { value: "LOGIN" } });
  expect(screen.getByText("1 matching lines")).toBeInTheDocument();
  expect(screen.getByText("Line 2")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "1. Documentation" })).toHaveAttribute("href", "https://example.org/docs");
});
it("does not fabricate search results or code", () => {
  render(<AgentSearchButton />);
  fireEvent.click(screen.getByRole("button", { name: "Search code and web sources" }));
  expect(screen.getByText("No generated code is available yet.")).toBeInTheDocument();
  expect(screen.getByText(/No web searches have run/)).toBeInTheDocument();
});