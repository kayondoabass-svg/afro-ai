import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { AppInstallTracker } from "./app-install-tracker";

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("does not count a website visit or install prompt as a download", () => {
  render(<AppInstallTracker />);
  window.dispatchEvent(new Event("beforeinstallprompt"));
  expect(fetch).not.toHaveBeenCalled();
});
it("records installation once across repeated events and reloads", async () => {
  const first = render(<AppInstallTracker />);
  window.dispatchEvent(new Event("appinstalled"));
  await waitFor(() => expect(localStorage.getItem("afroai-installation-reported")).toBe("1"));
  window.dispatchEvent(new Event("appinstalled"));
  first.unmount();
  vi.mocked(matchMedia).mockReturnValue({ matches: true } as MediaQueryList);
  render(<AppInstallTracker />);
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("counts first installed-mode launch and retries failures with the same identifier", async () => {
  vi.mocked(matchMedia).mockReturnValue({ matches: true } as MediaQueryList);
  vi.mocked(fetch).mockResolvedValueOnce({ ok: false } as Response).mockResolvedValue({ ok: true } as Response);
  render(<AppInstallTracker />);
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  expect(localStorage.getItem("afroai-installation-reported")).toBeNull();
  window.dispatchEvent(new Event("online"));
  await waitFor(() => expect(localStorage.getItem("afroai-installation-reported")).toBe("1"));
  const calls = vi.mocked(fetch).mock.calls;
  expect(calls[0][1]?.body).toEqual(calls[1][1]?.body);
});