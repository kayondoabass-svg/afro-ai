import { describe, expect, it } from "vitest";
import { authDestination, NEW_CHAT_EVENT, requestNewChat } from "./chat-entry";

describe("chat-first entry", () => {
  it("defaults ordinary login to chat and preserves explicit destinations", () => {
    expect(authDestination(null)).toBe("/chat");
    for (const path of ["/overview", "/chat?projectId=12&project=Shop", "/chat?conversationId=42", "/dashboard?payment=success", "/chatbot-checkout?plan=pro"]) {
      expect(authDestination(path)).toBe(path);
    }
    expect(authDestination("//untrusted.example")).toBe("/chat");
    expect(authDestination("/\\untrusted.example")).toBe("/chat");
  });
  it("requests reset even on the same route and allows mounted chat to cancel navigation", () => {
    window.history.replaceState(null, "", "/chat");
    let resets = 0;
    const reset = (event: Event) => { event.preventDefault(); resets++; };
    window.addEventListener(NEW_CHAT_EVENT, reset);
    expect(requestNewChat()).toBe(true);
    expect(requestNewChat()).toBe(true);
    expect(resets).toBe(2);
    window.removeEventListener(NEW_CHAT_EVENT, reset);
    expect(requestNewChat()).toBe(false);
  });
});