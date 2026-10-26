// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ complete: vi.fn() }));
vi.mock("../ai-chat-provider", () => ({ aiChatComplete: m.complete, hasAfroAiProvider: () => false }));
import { runProjectTools } from "../project-tools";
const screenshotCall = { id: "capture-call", type: "function", function: { name: "take_ui_screenshot", arguments: "{}" } };
const files = [{ path: "index.html", name: "index.html", language: "html", content: "<button>Neon</button>" }];
beforeEach(() => { vi.clearAllMocks(); });
describe("agent screenshot tool loop", () => {
  it("feeds both actual images back into model context, records events and obeys output grant", async () => {
    m.complete.mockResolvedValueOnce({ text: "", model: "private", provider: "private", promptTokens: 10, completionTokens: 10, toolCalls: [screenshotCall] })
      .mockResolvedValueOnce({ text: "Mobile text is clipped. A repair needs approval.", model: "private", provider: "private", promptTokens: 10, completionTokens: 10 });
    const onActivity = vi.fn(), beforeCall = vi.fn(async (_input: number, _output: number) => 1000);
    const takeScreenshot = vi.fn(async () => ({ result: { status: "captured", visualVerified: false },
      images: ["desktop","mobile"].map(profile => ({ profile, mimeType: "image/jpeg", base64: `bytes-${profile}` })) }));
    await runProjectTools({ files, request: "Audit both views", signal: new AbortController().signal, onActivity, beforeCall, takeScreenshot });
    expect(takeScreenshot).toHaveBeenCalledTimes(1);
    const options = m.complete.mock.calls[1][0];
    const images = options.messages.at(-1).content.filter((c: any) => c.type === "image_url");
    expect(images).toHaveLength(2); expect(images[1].image_url.url).toContain("bytes-mobile");
    expect(options.maxTokens).toBe(1000); expect(beforeCall.mock.calls[1][0]).toBeGreaterThan(40000);
    expect(onActivity.mock.calls.map(c => c[0].status)).toEqual(["started","completed"]);
  });
  it("reports blocked capture, not fake success, when consent/service is unavailable", async () => {
    m.complete.mockResolvedValueOnce({ text: "", model: "private", provider: "private", promptTokens: 10, completionTokens: 10, toolCalls: [screenshotCall] })
      .mockResolvedValueOnce({ text: "Visual verification blocked.", model: "private", provider: "private", promptTokens: 10, completionTokens: 10 });
    const onActivity = vi.fn();
    await runProjectTools({ files, request: "Audit", signal: new AbortController().signal, onActivity });
    expect(onActivity.mock.calls[1][0].status).toBe("failed");
    expect(onActivity.mock.calls[1][0].message).toContain("blocked");
    expect(m.complete.mock.calls[1][0].messages.find((x: any) => x.role === "tool").content).toContain('"visualVerified":false');
  });
});
