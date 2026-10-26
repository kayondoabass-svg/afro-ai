import { API_VERSION_HEADER, resolveAuthApi, versionError } from "../../shared/api-version-policy";

/**
 * Normalise before Hono dispatch, so tenant CORS and security see the original
 * /cf-auth/t/:slug path instead of treating v1/t as a permissive management API.
 */
export async function handleVersionedAuthRequest(
  request: Request,
  dispatch: (request: Request) => Response | Promise<Response>,
): Promise<Response> {
  const url = new URL(request.url);
  const result = resolveAuthApi(url.pathname);
  if (result.kind === "unsupported" || result.kind === "unknown") {
    return Response.json(versionError(result), { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  let routed = request;
  if (result.kind === "supported" && result.target !== url.pathname) {
    url.pathname = result.target;
    routed = new Request(url, request);
  }
  const response = await dispatch(routed);
  if (!result.version) return response;
  const headers = new Headers(response.headers);
  headers.set(API_VERSION_HEADER, result.version);
  headers.append("Access-Control-Expose-Headers", API_VERSION_HEADER);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
