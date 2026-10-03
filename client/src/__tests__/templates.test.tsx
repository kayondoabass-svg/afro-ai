import { render, screen, fireEvent } from "@testing-library/react";
import { it, expect, vi } from "vitest";
import TemplatesPage from "@/pages/templates";
const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock("wouter", () => ({ useLocation: () => ["/templates", navigate] }));
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ t: (key: string) => key }) }));

it("every template button opens an editable, correctly encoded website prompt", () => {
  render(<TemplatesPage />);
  const buttons = screen.getAllByTestId(/^button-use-template-/);
  expect(buttons).toHaveLength(21);
  for (const button of buttons) {
    navigate.mockClear();
    const slug = button.getAttribute("data-testid")!.replace("button-use-template-", "");
    const title = screen.getByTestId(`text-template-title-${slug}`).textContent!;
    fireEvent.click(button);
    expect(navigate).toHaveBeenCalledTimes(1);
    const url = new URL(navigate.mock.calls[0][0], "https://example.com");
    expect(url.pathname).toBe("/chat");
    expect(url.searchParams.get("project")).toBe(title);
    expect(url.searchParams.get("type")).toBe("website");
    expect(url.searchParams.get("description")).toContain(title.toLowerCase());
    expect(url.searchParams.get("description")!.length).toBeGreaterThan(40);
  }
});
it("every template card also opens its own prompt, including names containing ampersands", () => {
  render(<TemplatesPage />);
  for (const card of screen.getAllByTestId(/^card-template-/)) {
    navigate.mockClear();
    fireEvent.click(card);
    expect(navigate).toHaveBeenCalledTimes(1);
    const url = new URL(navigate.mock.calls[0][0], "https://example.com");
    expect(url.searchParams.get("project")).toBe(card.querySelector("h3")?.textContent);
  }
});