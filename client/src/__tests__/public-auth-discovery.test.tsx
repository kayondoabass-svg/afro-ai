import { render, screen, fireEvent } from "@testing-library/react";
import { it, expect, vi } from "vitest";
import LandingPage from "@/pages/landing";
import AboutPage from "@/pages/about";
import AuthDocs from "@/pages/docs-auth";

vi.mock("@/hooks/use-language", () => ({
  useLanguage: () => ({ language: "en", setLanguage: vi.fn(), t: (key: string) => key }),
}));
vi.mock("@/components/install-pwa-button", () => ({ InstallPwaButton: () => null }));
it("opens the footer security menu by keyboard and retains both destinations", async () => {
  render(<LandingPage />);
  const trigger = screen.getByTestId("link-footer-security");
  trigger.focus();
  fireEvent.keyDown(trigger, { key: "ArrowDown" });
  const auth = await screen.findByTestId("link-footer-authentication");
  expect(auth).toHaveAttribute("href", "/afro-auth");
  expect(screen.getByTestId("link-footer-security-disclosure")).toHaveAttribute("href", "/.well-known/security.txt");
  fireEvent.keyDown(auth, { key: "Escape" });
  expect(screen.queryByTestId("link-footer-authentication")).not.toBeInTheDocument();
});
it("lists the added products and links About to authentication and its guide", () => {
  render(<AboutPage />);
  for (const id of ["pwa", "knowledge", "files", "playground", "business-services", "partners"]) {
    expect(screen.getByTestId(`text-offer-${id}`)).toBeInTheDocument();
  }
  expect(screen.getByRole("link", { name: "Explore Afro Auth" })).toHaveAttribute("href", "/afro-auth");
  expect(screen.getByRole("link", { name: "Integration guide" })).toHaveAttribute("href", "/docs/auth");
});
it("renders public docs without signing in or making auth requests", () => {
  const network = vi.spyOn(globalThis, "fetch");
  render(<AuthDocs />);
  expect(screen.getByRole("heading", { name: "Scope & capabilities" })).toBeInTheDocument();
  expect(screen.getAllByText(/Server-side verification/).length).toBeGreaterThan(0);
  expect(network).not.toHaveBeenCalled();
});