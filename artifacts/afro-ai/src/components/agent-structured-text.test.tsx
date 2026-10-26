import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AgentStructuredText, splitAgentText } from "./agent-structured-text";

describe("agent structured response", () => {
  it("collapses tagged plan and requirements, retaining surrounding text", () => {
    render(<AgentStructuredText text={"Intro\n[BUILD PLAN]\nBuilding: Home\n[/BUILD PLAN]\n[REQUIREMENTS CHECK]\nNeed a provider\n[/REQUIREMENTS CHECK]\nDone"}
      renderText={(text) => <p>{text}</p>} />);
    expect(screen.getByText("Build plan").closest("details")).not.toHaveAttribute("open");
    fireEvent.click(screen.getByText("Build plan"));
    expect(screen.getByText("Build plan").closest("details")).toHaveAttribute("open");
    expect(screen.getByText("Requirements check")).toBeInTheDocument();
    expect(screen.getByText(/Intro/)).toBeInTheDocument();
    expect(screen.getByText(/Done/)).toBeInTheDocument();
  });
  it("does not alter markup in fenced code or an incomplete streamed plan", () => {
    const content = '```html\n<style>body::before { content: "[BUILD PLAN]"; }</style>\n```\n[BUILD PLAN]\nBuilding: Home';
    const chunks = splitAgentText(content);
    expect(chunks).toHaveLength(3);
    expect(chunks[0].content).toContain('"[BUILD PLAN]"');
    expect(chunks[2]).toEqual({ type: "plan", content: "Building: Home" });
  });
});