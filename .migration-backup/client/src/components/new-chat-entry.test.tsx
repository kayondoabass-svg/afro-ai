import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NewChatEntry } from "./new-chat-entry";
import { translations } from "@/lib/translations";

vi.mock("@/hooks/use-language", () => ({
  useLanguage: () => ({ t: (key: string) => translations.en[key] || key }),
}));

describe("new chat entry", () => {
  it("offers real editable prompts rather than unsupported features", () => {
    const onSuggestion = vi.fn();
    render(<NewChatEntry onSuggestion={onSuggestion} />);
    expect(screen.getByRole("heading")).toHaveTextContent("What will you build today?");
    fireEvent.click(screen.getByRole("button", { name: "Create an AI product" }));
    expect(onSuggestion).toHaveBeenCalledWith(translations.en["chat.entryAIPrompt"]);
  });
  it("isolates the non-interactive gold pattern and disables its animation for reduced motion", () => {
    const css = readFileSync("client/src/components/new-chat-entry.css", "utf8");
    expect(css).toContain(".agent-new-entry::before");
    expect(css).toContain("pointer-events: none");
    expect(css).toMatch(/prefers-reduced-motion: reduce[\s\S]*animation: none/);
    expect(css).toMatch(/@keyframes afro-gold-drift[\s\S]*translate3d/);
  });
});