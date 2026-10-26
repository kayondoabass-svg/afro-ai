import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi } from "vitest";
import { FileTreeSidebar, isBinaryProjectFile, projectFileBytes, saveProjectFiles } from "./file-tree-sidebar";

const image = { id: 7, name: "logo.png", path: "assets/logo.png", language: "binary", encoding: "base64" as const, content: "AP8B", updated_at: "" };

describe("binary project assets", () => {
  it("calculates decoded binary bytes and UTF-8 text bytes, not base64 character lengths", () => {
    expect(isBinaryProjectFile(image)).toBe(true);
    expect(projectFileBytes(image)).toBe(3);
    expect(projectFileBytes({ ...image, language: "text", encoding: "utf8", content: "é" })).toBe(2);
    expect(projectFileBytes({ ...image, content: "%%%" })).toBeNull();
  });

  it("downloads decoded asset bytes without opening the editor; keeps delete action", async () => {
    const onFileOpen = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const createUrl = vi.fn((_blob: Blob) => "blob:test");
    const revokeUrl = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createUrl });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeUrl });
    vi.spyOn(globalThis, "fetch").mockImplementation(async url => ({ ok: true, json: async () => String(url).includes("/7") ? image : [image] } as Response));
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <FileTreeSidebar conversationId={12} openedFileId={null} onFileOpen={onFileOpen} onClose={vi.fn()} />
    </QueryClientProvider>);
    expect(await screen.findByText("asset")).toBeInTheDocument();
    expect(screen.getByText("3 B")).toBeInTheDocument();
    expect(screen.getByTestId("button-delete-file-7")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("file-item-7"));
    await screen.findByText("asset");
    await vi.waitFor(() => expect(click).toHaveBeenCalledOnce());
    expect(onFileOpen).not.toHaveBeenCalled();
    expect(createUrl).toHaveBeenCalledOnce();
    const blob = createUrl.mock.calls[0][0] as Blob;
    const bytes = await new Promise<Uint8Array>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(blob);
    });
    expect(Array.from(bytes)).toEqual([0, 255, 1]);
    expect(revokeUrl).toHaveBeenCalledWith("blob:test");
  });

  it("continues opening ordinary UTF-8 source files for editing", async () => {
    const text = { id: 8, name: "index.html", path: "index.html", language: "html", content: "café", updated_at: "" };
    const onFileOpen = vi.fn();
    vi.spyOn(globalThis, "fetch").mockImplementation(async url => ({ ok: true, json: async () => String(url).includes("/8") ? text : [text] } as Response));
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <FileTreeSidebar conversationId={12} openedFileId={null} onFileOpen={onFileOpen} onClose={vi.fn()} />
    </QueryClientProvider>);
    expect(await screen.findByText("5 B")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("file-item-8"));
    await vi.waitFor(() => expect(onFileOpen).toHaveBeenCalledWith(text));
  });
});

describe("generated project file persistence", () => {
  it("keeps generated HTML, CSS and JavaScript export working", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true } as Response);
    await saveProjectFiles(42, '<html><style>body { color: red; }</style><body>Hello<script>console.log("hello")</script></body></html>');
    const files = fetchMock.mock.calls.map(([, options]) => JSON.parse(options!.body as string));
    expect(files.map(file => file.path)).toEqual(["index.html", "styles.css", "script.js"]);
    expect(files[0].content).toContain('href="styles.css"');
    expect(files[0].content).toContain('src="script.js"');
    expect(files.every(file => file.conversationId === "42")).toBe(true);
  });

  it("does not silently claim success when canonical storage rejects a file", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: false, json: async () => ({ error: "File blocked by policy" }) } as Response);
    await expect(saveProjectFiles(42, "<html>test</html>")).rejects.toThrow("File blocked by policy");
  });
});