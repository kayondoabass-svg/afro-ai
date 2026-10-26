import { describe, expect, it } from "vitest";
import { buildProjectEditContext, parseProjectEditResponse } from "./project-edit";

const file = { path: "src/app.ts", name: "app.ts", language: "typescript", content: "export const title = 'Hello';" };
const response = (overrides = {}) => JSON.stringify({
  protocol: "project-file-edit/v1", path: file.path, content: "export const title = 'Updated';",
  summary: "Updated title.", ...overrides,
});

describe("selected project file AI editing (no IO)", () => {
  it("uses authoritative full source and a bounded subset of related files", () => {
    const files = [file, ...Array.from({ length: 30 }, (_, i) => ({
      path: `src/module${i}.ts`, name: `module${i}.ts`, language: "typescript", content: "x".repeat(10_000),
    }))];
    const context = buildProjectEditContext(files, file.path, "Update the title");
    expect(context.selected).toEqual(file);
    expect(context.prompt).toContain(file.content);
    expect(Buffer.byteLength(context.prompt)).toBeLessThan(52_000);
  });

  it("requires an existing explicitly selected file and rejects oversized files", () => {
    expect(() => buildProjectEditContext([file], undefined, "edit")).toThrow();
    expect(() => buildProjectEditContext([file], "../app.ts", "edit")).toThrow();
    expect(() => buildProjectEditContext([{ ...file, content: "x".repeat(24_001) }], file.path, "edit")).toThrow();
  });

  it("blocks secret-bearing source and requests before constructing model context", () => {
    const credential = "ghp_" + "a".repeat(30);
    expect(() => buildProjectEditContext([{ ...file, content: credential }], file.path, "edit")).toThrow();
    expect(() => buildProjectEditContext([file], file.path, credential)).toThrow();
  });

  it("accepts only complete structured replacements for the selected path", () => {
    expect(parseProjectEditResponse(response(), file).file).toEqual({ ...file, content: "export const title = 'Updated';" });
    expect(() => parseProjectEditResponse("```html\n<div>bad</div>\n```", file)).toThrow();
    expect(() => parseProjectEditResponse(response({ path: "src/other.ts" }), file)).toThrow();
    expect(() => parseProjectEditResponse(response({ files: [] }), file)).toThrow();
    expect(() => parseProjectEditResponse(response({ content: 1 }), file)).toThrow();
  });

  it("blocks credentials in generated content and summaries", () => {
    const credential = "ghp_" + "a".repeat(30);
    expect(() => parseProjectEditResponse(response({ content: credential }), file)).toThrow();
    expect(() => parseProjectEditResponse(response({ summary: credential }), file)).toThrow();
  });
});