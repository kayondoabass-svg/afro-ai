import { describe, it, expect } from "vitest";
import { authOpenApi, enhancePublicHtml, publicAuthMarkup } from "../public-auth-docs";

const shell = '<html><head><title>Old title</title><meta name="description" content="Old"><link rel="canonical" href="https://old.example"><script type="application/ld+json">{"name":"Old"}</script></head><body><div id="root"></div><script src="/app.js"></script></body></html>';
describe("public authentication discovery", () => {
  it.each(["/docs/auth", "/afro-auth"])("serves useful crawlable content without JavaScript at %s", path => {
    const html = enhancePublicHtml(shell, path);
    expect(html).toContain("Google and GitHub with PKCE");
    expect(html).toContain('href="/openapi.json"');
    expect(html).toContain("signup does not return a token");
    expect(html).toContain('src="/app.js"');
    expect(html).not.toContain('"name":"Old"');
    expect(html.match(/rel="canonical"/g)).toHaveLength(1);
    const ld = JSON.parse(html.match(/application\/ld\+json">([\s\S]+?)<\/script>/)![1]);
    expect(ld.url).toBe(`https://afroaigroup.com${path}`);
  });
  it("does not prerender private account data", () => {
    expect(publicAuthMarkup("/dashboard/auth")).toBeNull();
    expect(enhancePublicHtml(shell, "/dashboard/auth")).toContain('<div id="root"></div>');
  });
  it("escapes canonical paths", () => {
    const html = enhancePublicHtml(shell, '/"><script>alert(1)</script>');
    expect(html).not.toContain("<script>alert");
  });
  it("documents each live session operation and separates user tokens from server keys", () => {
    const api = authOpenApi();
    expect(api.openapi).toBe("3.1.0");
    expect(api.paths["/cf-auth/t/{slug}/signup"].post.security).toEqual([]);
    expect(api.paths["/cf-auth/t/{slug}/sessions/{id}"].delete.security).toEqual([{ userToken: [] }]);
    expect(api.paths["/cf-auth/v1/sessions/verify"].post.security).toEqual([{ secretKey: [] }]);
    expect(api.paths["/cf-auth/t/{slug}/signup"].post.requestBody.content["application/json"].schema.properties.password.minLength).toBe(12);
    expect(api.paths["/cf-auth/github/start"].get.parameters.map((p: any) => p.name)).toContain("code_challenge");
  });
});