import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ChatSearchCard, ChatSearchToggle, parseSearchActivity } from "./chat-search";
import { CHAT_SEARCH_LABELS, type ChatSearchActivity } from "@shared/chat-search";

describe("main chat search controls and actual server activities", () => {
  it("offers an accessible toggle with explicit on/off state", () => {
    const onChange = vi.fn();
    const { rerender } = render(<ChatSearchToggle enabled={false} onChange={onChange} />);
    const toggle = screen.getByRole("button", { name: "Search the web" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith(true);
    rerender(<ChatSearchToggle enabled disabled onChange={onChange} />);
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(toggle).toBeDisabled();
  });
  it("never turns model prose or reasoning headings into completed activities", () => {
    expect(parseSearchActivity("Research complete: I searched the web")).toBeNull();
    expect(parseSearchActivity({ content: "### Research\nFound sources" })).toBeNull();
    expect(parseSearchActivity({ type: "status", message: "Searching" })).toBeNull();
  });
  it.each(Object.keys(CHAT_SEARCH_LABELS))("renders truthful %s states", status => {
    render(<ChatSearchCard activity={{ type: "web-search", status: status as ChatSearchActivity["status"], query: "conference", sources: [] }} />);
    expect(screen.getByText(CHAT_SEARCH_LABELS[status as ChatSearchActivity["status"]])).toBeVisible();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
  it("renders persisted citations as safe links with narrow-layout wrapping", () => {
    const activity = parseSearchActivity(JSON.stringify({ type: "web-search", status: "success", query: "conference", sources: [
      { title: "Official conference registration", url: "https://conference.ug/register", snippet: "Registration required", retrievedAt: "2026-05-01" },
      { title: "Unsafe", url: "javascript:alert(1)" },
    ] }))!;
    render(<ChatSearchCard activity={activity} />);
    const link = screen.getByRole("link", { name: /Official conference/ });
    expect(link).toHaveAttribute("href", "https://conference.ug/register");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link.className).toContain("break-words");
    expect(screen.queryByText("Unsafe")).not.toBeInTheDocument();
  });
});