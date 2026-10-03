import { expect, it, vi } from "vitest";
const send = vi.hoisted(() => vi.fn().mockResolvedValue({ provider: "test", messageId: "test" }));
vi.mock("../ses-webhook", () => ({ isSuppressed: async () => false }));
vi.mock("../email-provider", () => ({ sendEmail: send, activeEmailProvider: () => "test" }));
import { sendWelcomeEmail } from "../mailer";

it("uses the cover as an email background with the logo and readable fallback", async () => {
  expect(await sendWelcomeEmail("preview@example.com", "Demo")).toBe(true);
  const { html, text } = send.mock.calls[0][0];
  expect(html).toContain('background="https://afroaigroup.com/images/afro-ai-2063-cover.jpg"');
  expect(html).toContain('bgcolor="#0a0a0a"');
  expect(html).toContain('alt="Afro AI"');
  expect(html).toContain("icon-192.png?v=gold-africa");
  expect(text).toContain("Welcome");
  expect(text).not.toContain("<table");
});