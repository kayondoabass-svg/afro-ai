import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import VerifyEmailPage, { verificationRedirect } from "@/pages/verify-email";

const mocks = vi.hoisted(() => ({ user: { email: "test@example.com", emailVerified: null } as any, logout: vi.fn() }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: mocks.user, logout: mocks.logout }) }));
beforeEach(() => {
  window.history.replaceState({}, "", "/verify-email");
  mocks.user = { email: "test@example.com", emailVerified: null };
});
it("forwards old email links to the backend without dropping or corrupting the token", () => {
  expect(verificationRedirect("?token=abc%2Bdef%2Fghi")).toBe("/api/auth/verify-email?token=abc%2Bdef%2Fghi");
  expect(verificationRedirect("?status=ok")).toBeNull();
});
it("shows a required verification screen, not an account bypass", async () => {
  render(<VerifyEmailPage />);
  expect(await screen.findByText("Verify your email first")).toBeInTheDocument();
  expect(screen.queryByText("Open my account")).not.toBeInTheDocument();
  fireEvent.click(screen.getByText("Sign out"));
  expect(mocks.logout).toHaveBeenCalled();
});
it("resends only on a click and disables repeated sends", async () => {
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) } as Response);
  render(<VerifyEmailPage />);
  expect(fetchMock).not.toHaveBeenCalled();
  fireEvent.click(screen.getByTestId("button-resend-verify"));
  await waitFor(() => expect(screen.getByTestId("button-resend-verify")).toHaveTextContent("Resend in 60s"));
  expect(screen.getByTestId("button-resend-verify")).toBeDisabled();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
it("shows a sign-in recovery action when the visitor has no session", () => {
  mocks.user = null;
  render(<VerifyEmailPage />);
  expect(screen.getByText("Sign in to request a new link")).toBeInTheDocument();
});