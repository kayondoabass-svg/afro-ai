import { describe, expect, it, vi } from "vitest";
import { containsPrivateCredential, redactPrivateCredentials, safeAssistantText } from "../chat-credential-safety";

describe("chat credential boundary", () => {
  const privateKey = "sk_live_" + "a".repeat(32);

  it("rejects recognizable private keys without treating public identifiers as private", () => {
    expect(containsPrivateCredential(`Afro Auth key: ${privateKey}`)).toBe(true);
    expect(containsPrivateCredential(`EmailJS Public Key: user_abc123xyz; Service ID: service_xyz`)).toBe(false);
    expect(containsPrivateCredential("OAuth Client ID: client_12345")).toBe(false);
    expect(containsPrivateCredential("consumer secret: abcdefghijklmnopqrstuvwxyz")).toBe(true);
  });

  it("redacts historic private credentials without deleting the surrounding conversation", () => {
    const old = `Please fix my app. ${privateKey} should stay server-only.`;
    expect(redactPrivateCredentials(old)).toContain("Please fix my app.");
    expect(redactPrivateCredentials(old)).not.toContain(privateKey);
  });

  it("neutralizes requests for private keys and redacts model output", () => {
    expect(safeAssistantText("Come back with your Afro Email API secret key and I will embed it in browser code."))
      .toContain("Do not share private credentials");
    expect(safeAssistantText(`Configured: ${privateKey}`)).not.toContain(privateKey);
    // The route buffers the complete reply before applying this filter, so a
    // token split across provider chunks is treated identically.
    expect(safeAssistantText(["sk_li", "ve_", "a".repeat(32)].join(""))).not.toContain(privateKey);
  });
});

vi.mock("../ai-chat-provider", () => ({ aiChatComplete: vi.fn() }));
import { aiChatComplete } from "../ai-chat-provider";
import { projectToolSession, runProjectTools } from "../project-tools";

describe("project agent credential boundary", () => {
  const file = { path: "src/index.ts", name: "index.ts", language: "typescript", content: "const x = 1" };
  it("does not expose historic file credentials to tool reads or allow credential proposals", () => {
    const token = "sk_live_" + "b".repeat(32);
    const session = projectToolSession([{ ...file, content: `const token = "${token}"` }]);
    expect(JSON.stringify(session.execute("read_file", { path: file.path }))).not.toContain(token);
    expect(() => session.execute("propose_edits", {
      files: [{ path: file.path, content: `const token = "${token}"`, language: "typescript" }],
    })).toThrow();
  });

  it("sends bounded redacted trusted-role follow-ups to the provider", async () => {
    vi.mocked(aiChatComplete).mockResolvedValue({ text: "No changes", provider: "gemini", model: "test" });
    const token = "sk_live_" + "c".repeat(32);
    await runProjectTools({
      files: [file], request: "What about that?", signal: new AbortController().signal, onActivity: () => {},
      history: [{ role: "user", content: `Earlier: ${token}` }, { role: "assistant", content: "We discussed src/index.ts" }],
    });
    const sent = JSON.stringify(vi.mocked(aiChatComplete).mock.calls.at(-1)?.[0].messages);
    expect(sent).not.toContain(token);
    expect(sent).toContain("We discussed src/index.ts");
    expect(sent).toContain("What about that?");
  });
});