import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChatRequestActivity, type ChatRequestStatus } from "./chat-request-activity";

const states: Array<[ChatRequestStatus, string]> = [
  ["sending", "Sending request"],
  ["waiting", "Waiting for response"],
  ["responding", "Receiving response"],
  ["received", "Reply received"],
  ["failed", "Request failed"],
  ["stopped", "Request stopped"],
  ["empty", "No reply returned"],
];

describe("ChatRequestActivity", () => {
  it.each(states)("labels the %s browser-observed phase", (status, label) => {
    const { container } = render(<ChatRequestActivity status={status} />);
    expect(screen.getByRole("status", { name: `Chat request activity: ${label}` })).toBeInTheDocument();
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(container.querySelector(`svg[data-phase-icon="${status}"]`)).toBeInTheDocument();
  });

  it("shows a reduced-motion-safe spinner only while the exchange is active", () => {
    for (const status of ["sending", "waiting", "responding"] as const) {
      const { unmount } = render(<ChatRequestActivity status={status} />);
      expect(screen.getByTestId("request-activity-spinner")).toHaveClass("motion-reduce:animate-none");
      unmount();
    }

    for (const status of ["received", "failed", "stopped", "empty"] as const) {
      const { queryByTestId, unmount } = render(<ChatRequestActivity status={status} />);
      expect(queryByTestId("request-activity-spinner")).not.toBeInTheDocument();
      unmount();
    }
  });

  it("identifies project mode without implying a tool ran", () => {
    render(<ChatRequestActivity status="responding" mode="project" />);
    expect(screen.getByRole("status", { name: "Project request activity: Receiving response" })).toBeInTheDocument();
    expect(screen.getByText("Project")).toBeInTheDocument();
    expect(screen.queryByText(/tool|saved|verified|deployed/i)).not.toBeInTheDocument();
  });

  it("reports a reply without claiming it was saved or otherwise verified", () => {
    render(<ChatRequestActivity status="received" />);
    expect(screen.getByText("Reply received")).toBeInTheDocument();
    expect(screen.queryByText(/saved|verified|deployed/i)).not.toBeInTheDocument();
  });

  it.each([
    ["failed", "Request failed"],
    ["stopped", "Request stopped"],
  ] as const)("keeps %s as a non-success outcome", (status, label) => {
    render(<ChatRequestActivity status={status} />);
    expect(screen.getByRole("status", { name: `Chat request activity: ${label}` })).toBeInTheDocument();
    expect(screen.queryByText("Reply received")).not.toBeInTheDocument();
  });
});
