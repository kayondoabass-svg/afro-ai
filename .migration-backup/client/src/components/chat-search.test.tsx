import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChatSearchCard, parseSearchActivity } from "./chat-search";
import { CHAT_SEARCH_LABELS, type ChatSearchActivity } from "@shared/chat-search";

describe("main chat server search activities", () => {
  it("announces server activity updates without offering manual search controls", () => {
    const { rerender } = render(<ChatSearchCard activity={{ type: "web-search", status: "searching", query: "conference", sources: [] }} />);
    const card = screen.getByRole("region", { name: "Web search activity" });
    expect(card).toHaveAttribute("aria-live", "polite");
    expect(screen.getByText(CHAT_SEARCH_LABELS.searching)).toBeVisible();
    rerender(<ChatSearchCard activity={{ type: "web-search", status: "success", query: "conference", sources: [] }} />);
    expect(screen.getByText(CHAT_SEARCH_LABELS.success)).toBeVisible();
    expect(screen.queryByText(CHAT_SEARCH_LABELS.searching)).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
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