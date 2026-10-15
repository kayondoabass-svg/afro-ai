// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("./email-provider", () => ({ sendEmail: mocks.send }));
vi.mock("./ses-webhook", () => ({ isSuppressed: async () => false }));
import { sendAppPublishedEmail } from "./mailer";
beforeEach(() => { vi.clearAllMocks(); mocks.send.mockResolvedValue({}); });
it("sends working app-specific management URLs in both HTML and text", async () => {
  expect(await sendAppPublishedEmail("owner@example.test", { title: "Sample Shop", url: "https://sample-shop.afroaigroup.com", isUpdate: false, appId: 9 })).toBe(true);
  const payload = mocks.send.mock.calls[0][0];
  expect(payload.html).toContain('href="https://afroaigroup.com/deployments?appId=9"');
  expect(payload.text).toContain("Manage your apps: https://afroaigroup.com/deployments?appId=9");
  expect(payload.html).toContain('href="https://sample-shop.afroaigroup.com"');
  expect(payload.html).not.toContain("https://afroaigroup.com/apps");
});
it("uses the canonical library for legacy senders without an app ID", async () => {
  await sendAppPublishedEmail("owner@example.test", { title: "Sample Shop", url: "https://sample-shop.afroaigroup.com", isUpdate: true });
  expect(mocks.send.mock.calls[0][0].text).toContain("Manage your apps: https://afroaigroup.com/deployments");
});
