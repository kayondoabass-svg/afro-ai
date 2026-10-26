import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import App from "@/App";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: null, isLoading: false }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/components/install-pwa-button", () => ({ InstallPwaBanner: () => null }));
vi.mock("@/components/app-install-tracker", () => ({ AppInstallTracker: () => null }));
vi.mock("@/components/quota-notifications", () => ({ QuotaNotifications: () => null }));
vi.mock("@/components/ui/toaster", () => ({ Toaster: () => null }));

describe("programme portal authentication return", () => {
  it("requires sign-in and preserves an invitation query for the post-login return", async () => {
    window.history.replaceState({}, "", "/programme-portal?invite=opaque-invite-71");
    render(<App />);

    await waitFor(() => {
      expect(sessionStorage.getItem("after_login_redirect")).toBe("/programme-portal?invite=opaque-invite-71");
      expect(window.location.pathname).toBe("/login");
    });
  });
});
