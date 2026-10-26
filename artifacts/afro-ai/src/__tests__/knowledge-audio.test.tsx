import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { KnowledgeAudio } from "@/components/knowledge-audio";

afterEach(() => vi.unstubAllGlobals());
describe("knowledge voice lab", () => {
  it("keeps the default provider and hides the restricted option", () => {
    render(<KnowledgeAudio afroAvailable={false} />);
    expect((screen.getByLabelText("Voice reply provider") as HTMLSelectElement).value).toBe("default");
    expect(screen.queryByRole("option", { name: /Afro test/ })).toBeNull();
  });
  it("uploads with explicit provider, displays transcript/reply and downloadable playback", async () => {
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:reply"), revokeObjectURL: vi.fn() }));
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ transcript: "My speech", reply: "Spoken answer", audio: "YQ==" })));
    vi.stubGlobal("fetch", fetchMock);
    render(<KnowledgeAudio afroAvailable />);
    fireEvent.change(screen.getByLabelText("Voice reply provider"), { target: { value: "afro-test" } });
    fireEvent.change(screen.getByLabelText("Upload audio"), { target: { files: [new File(["audio"], "test.wav", { type: "audio/wav" })] } });
    fireEvent.click(screen.getByText("Send audio"));
    await waitFor(() => expect(screen.getByText("My speech")).toBeTruthy());
    expect(screen.getByText("Spoken answer")).toBeTruthy();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).provider).toBe("afro-test");
    expect(screen.getByRole("link", { name: "Download reply" }).getAttribute("download")).toBe("voice-reply.mp3");
    expect(screen.getByLabelText("Spoken reply").getAttribute("src")).toBe("blob:reply");
  });
  it("cancels uploaded audio requests", async () => {
    const fetchMock = vi.fn().mockImplementation(() => new Promise(() => {}));
    vi.stubGlobal("fetch", fetchMock);
    render(<KnowledgeAudio afroAvailable={false} />);
    fireEvent.change(screen.getByLabelText("Upload audio"), { target: { files: [new File(["audio"], "test.wav")] } });
    fireEvent.click(screen.getByText("Send audio"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    fireEvent.click(screen.getByText("Cancel"));
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    expect(screen.getByText("Send audio")).toBeTruthy();
  });
});