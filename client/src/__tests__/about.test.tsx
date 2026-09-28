import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import AboutPage from "@/pages/about";

vi.mock("@/hooks/use-language", () => ({
  useLanguage: () => ({ language: "en", setLanguage: vi.fn(), t: (key: string) => key }),
}));

describe("About page", () => {
  it("announces the fine-tuned model as ongoing work in Recent Milestones", () => {
    render(<AboutPage />);

    expect(screen.getByRole("heading", { name: "Recent Milestones" })).toBeTruthy();
    expect(screen.getByTestId("text-milestone-language-model")).toHaveTextContent(
      "Afro AI recently fine-tuned its own language model. Testing and evaluation are ongoing as we continue its development.",
    );
  });
});