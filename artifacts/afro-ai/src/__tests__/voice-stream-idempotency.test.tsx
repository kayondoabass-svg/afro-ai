import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
const playback = vi.hoisted(() => ({
  init: vi.fn().mockResolvedValue(undefined), clear: vi.fn(), pushAudio: vi.fn(), signalComplete: vi.fn(), state: "idle",
}));
vi.mock("../../replit_integrations/audio/useAudioPlayback", () => ({ useAudioPlayback: () => playback }));
import { useVoiceStream } from "../../replit_integrations/audio/useVoiceStream";
afterEach(() => vi.unstubAllGlobals());
describe("legacy voice client durable keys", () => {
  it("reuses keys for a recording retry and uses unshadowed voice route, preserving callbacks/playback", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response(
      'data: {"type":"user_transcript","data":"hello"}\n\n' +
      'data: {"type":"transcript","data":"welcome"}\n\n' +
      'data: {"type":"audio","data":"YQ=="}\n\n' +
      'data: {"type":"done"}\n\n',
    ));
    vi.stubGlobal("fetch", fetchMock);
    const onUserTranscript = vi.fn(), onComplete = vi.fn();
    const { result, rerender } = renderHook(() => useVoiceStream({ onUserTranscript, onComplete }));
    const recording = new Blob(["recording"]);
    await act(() => result.current.streamVoiceResponse("/api/conversations/12/messages", recording));
    rerender();
    await act(() => result.current.streamVoiceResponse("/api/conversations/12/messages", recording));
    await act(() => result.current.streamVoiceResponse("/api/conversations/12/messages", new Blob(["new recording"])));
    const requests = fetchMock.mock.calls.map(([url, options]) => ({ url, ...JSON.parse(options.body) }));
    expect(requests[0].url).toBe("/api/voice-conversations/12/messages");
    expect(requests[0].idempotencyKey).toBe(requests[1].idempotencyKey);
    expect(requests[2].idempotencyKey).not.toBe(requests[0].idempotencyKey);
    expect(onUserTranscript).toHaveBeenCalledWith("hello");
    expect(onComplete).toHaveBeenCalledWith("welcome");
    expect(playback.pushAudio).toHaveBeenCalledWith("YQ==");
  });
  it("surfaces the server's duplicate/reservation error without replaying a provider request", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Already submitted." }), { status: 409 })));
    const { result } = renderHook(() => useVoiceStream());
    await expect(result.current.streamVoiceResponse("/api/voice-conversations/12/messages", new Blob(["audio"]))).rejects.toThrow("Already submitted.");
  });
});