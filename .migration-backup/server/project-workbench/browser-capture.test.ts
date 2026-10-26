// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { browserCaptureCapability, remoteScreenshot } from "./browser-capture";
const fetcher = vi.fn();
function jpeg(width = 1280, height = 800) {
  const bytes = Buffer.from([255,216,255,192,0,11,8,0,0,0,0,1,1,17,0,255,217]);
  bytes.writeUInt16BE(height, 7); bytes.writeUInt16BE(width, 9); return bytes;
}
beforeEach(() => {
  vi.stubEnv("AFRO_BROWSER_CAPTURE_ENABLED", "true");
  vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "a".repeat(32)); vi.stubEnv("CLOUDFLARE_API_TOKEN", "test-only");
  vi.stubGlobal("fetch", fetcher); fetcher.mockReset();
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("remote browser capture boundary", () => {
  it("fails closed when not explicitly enabled", async () => {
    vi.stubEnv("AFRO_BROWSER_CAPTURE_ENABLED", "");
    expect(browserCaptureCapability().enabled).toBe(false);
    await expect(remoteScreenshot("<button>Hi</button>", "desktop", "source", "after", new AbortController().signal)).rejects.toThrow("blocked");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("sends inline HTML with no customer cookies or arbitrary URL and no network access", async () => {
    fetcher.mockResolvedValue(new Response(jpeg(), { headers: { "content-type": "image/jpeg" } }));
    const image = await remoteScreenshot("<button>Hi</button>", "desktop", "source", "after", new AbortController().signal);
    const [url, options] = fetcher.mock.calls[0], body = JSON.parse(options.body);
    expect(url).toMatch(/^https:\/\/api.cloudflare.com\/client\/v4\/accounts\/[a]+\/browser-rendering\/screenshot/);
    expect(body.url).toBeUndefined(); expect(body.cookies).toBeUndefined();
    expect(body.allowRequestPattern).toEqual(["^data:", "^about:blank$"]);
    expect(body.rejectRequestPattern).toContain("^https?://");
    expect(body.viewport).toEqual({ width: 1280, height: 800, deviceScaleFactor: 1 });
    expect(image.profile).toBe("desktop"); expect(image.width).toBe(1280);
    expect(browserCaptureCapability().permissionVerified).toBe(false);
  });
  it("uses a separate mobile viewport, not a Safari certification claim", async () => {
    fetcher.mockResolvedValue(new Response(jpeg(375,812), { headers: { "content-type": "image/jpeg" } }));
    const item = await remoteScreenshot("mobile", "mobile", "source", "before", new AbortController().signal);
    expect(item.width).toBe(375); expect(item.name).toContain("not Safari");
  });
  it.each([401,403,429,500])("does not retry provider HTTP %s or leak its response", async status => {
    fetcher.mockResolvedValue(new Response("private-token-details", { status }));
    await expect(remoteScreenshot("page", "desktop", "source", "after", new AbortController().signal)).rejects.not.toThrow("private-token-details");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("rejects invalid dimensions and JSON masquerading as an image", async () => {
    fetcher.mockResolvedValueOnce(new Response(jpeg(1,1), { headers: { "content-type": "image/jpeg" } }));
    await expect(remoteScreenshot("page", "desktop", "source", "after", new AbortController().signal)).rejects.toThrow("dimensions");
    fetcher.mockResolvedValueOnce(new Response("{}", { headers: { "content-type": "application/json" } }));
    await expect(remoteScreenshot("page", "desktop", "source", "after", new AbortController().signal)).rejects.toThrow("valid screenshot");
  });
  it("bounds response bytes and stops on oversized images", async () => {
    fetcher.mockResolvedValue(new Response(Buffer.alloc(524289), { headers: { "content-type": "image/jpeg" } }));
    await expect(remoteScreenshot("page", "desktop", "source", "after", new AbortController().signal)).rejects.toThrow("size limit");
  });
});
