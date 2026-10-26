import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { AccountSecurity } from "@/components/account-security";

function mount() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><AccountSecurity email="one@example.com" /></QueryClientProvider>);
}
it("shows device locations, current device, and revokes only the selected session", async () => {
  const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, options) =>
    new Response(JSON.stringify(options?.method === "DELETE" ? { ok: true } : { devices: [
      { id: "one", device: "Safari on iOS", location: "Kampala, UG", current: true, last_seen_at: 100 },
      { id: "two", device: "Chrome on Windows", location: "London, GB", current: false, last_seen_at: 200 },
    ] }), { status: 200 }));
  vi.spyOn(window, "confirm").mockReturnValue(true);
  mount();
  expect(fetchMock).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("Logged-in devices"));
  expect(await screen.findByText("Safari on iOS · This device")).toBeInTheDocument();
  expect(screen.getByText("London, GB")).toBeInTheDocument();
  fireEvent.click(screen.getAllByText("Log out")[1]);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/auth/devices/two", expect.objectContaining({ method: "DELETE" })));
});
it("requests a reset link for the account email only when clicked", async () => {
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
  mount();
  fireEvent.click(screen.getByText("Change password by email"));
  expect(await screen.findByText("Reset link requested")).toBeDisabled();
  expect(fetchMock).toHaveBeenCalledWith("/cf-auth/forgot-password", expect.objectContaining({ body: JSON.stringify({ email: "one@example.com" }) }));
});
it("shows an error and retry rather than an empty list on failure", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 503 }));
  mount();
  fireEvent.click(screen.getByText("Logged-in devices"));
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not load");
  expect(screen.getByText("Retry")).toBeInTheDocument();
});