// @vitest-environment node
import { describe, expect, it } from "vitest";
import { staticVisualPreview } from "./visual-preview";
const file = (path: string, content: string) => ({ path, name: path.split("/").pop()!, language: "text", content });
describe("owned static preview packaging", () => {
  it("inlines saved CSS and classic JS and places the restrictive CSP first", () => {
    const html = staticVisualPreview([file("index.html", '<html><head><link rel="stylesheet" href="style.css"></head><body><button>Neon</button><script src="app.js"></script></body></html>'),
      file("style.css", "button{display:flex;flex-wrap:wrap}"), file("app.js", 'document.querySelector("button").textContent="Ready";')]);
    expect(html).toContain("connect-src 'none'");
    expect(html.indexOf("Content-Security-Policy")).toBeLessThan(html.indexOf("<style"));
    expect(html).toContain("flex-wrap:wrap"); expect(html).toContain('textContent="Ready"');
    expect(html).not.toContain('src="app.js"');
  });
  it.each([
    '<link rel="stylesheet" href="https://example.com/style.css">',
    '<script src="../secrets.js"></script>',
    '<script src="%2e%2e/secrets.js"></script>',
    '<iframe src="https://example.com"></iframe>',
    '<script type="module">import "./app.js"</script>',
    '<style>@import "style.css";</style>',
    '<meta http-equiv="refresh" content="0;url=https://example.com">',
    '<img src="missing.png">',
    '<img srcset="desktop.png 2x">',
  ])("rejects unsupported or unsafe preview without executing it: %s", html => {
    expect(() => staticVisualPreview([file("index.html", html)])).toThrow();
  });
  it("never evaluates classic scripts on the server", () => {
    const html = staticVisualPreview([file("index.html", "<script>throw new Error('customer-code');</script>")]);
    expect(html).toContain("customer-code");
  });
});
