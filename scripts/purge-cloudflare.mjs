import { pathToFileURL } from "node:url";

// Deliberately never fall back to the application's D1/Workers token.
export async function purgeCloudflare(env = process.env, fetchImpl = fetch, log = console.log) {
  const zone = env.CLOUDFLARE_ZONE_ID;
  const token = env.CLOUDFLARE_PURGE_TOKEN;
  if (!zone || !/^[a-f0-9]{32}$/i.test(zone) || !token) {
    log("Cloudflare purge failed: set CLOUDFLARE_ZONE_ID and dedicated CLOUDFLARE_PURGE_TOKEN.");
    return false;
  }
  try {
    const response = await fetchImpl(
      `https://api.cloudflare.com/client/v4/zones/${zone}/purge_cache`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ purge_everything: true }),
        signal: AbortSignal.timeout(15000),
        redirect: "error",
      },
    );
    const data = await response.json();
    if (response.ok && data?.success === true && typeof data.result?.id === "string" && data.result.id.length > 0) {
      log("Cloudflare cache purged successfully.");
      return true;
    }
    // Provider text and thrown exceptions can contain credentials. Log only numeric codes.
    const codes = Array.isArray(data?.errors)
      ? data.errors.map(error => error?.code).filter(Number.isInteger).join(",")
      : "";
    log(`Cloudflare purge failed: HTTP ${response.status}; error codes: ${codes || "none"}.`);
  } catch {
    log("Cloudflare purge failed: network, timeout, or invalid response.");
  }
  return false;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await purgeCloudflare() ? 0 : 1;
}