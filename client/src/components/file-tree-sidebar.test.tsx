import { describe, it, expect, vi } from "vitest";
import { saveProjectFiles } from "./file-tree-sidebar";

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