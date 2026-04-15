export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/shell-ws")) {
      const backendUrl = "https://afro-ai.replit.app" + url.pathname + url.search;
      const backendRequest = new Request(backendUrl, {
        method: request.method,
        headers: request.headers,
        body: request.method !== "GET" && request.method !== "HEAD" ? request.body : undefined,
        redirect: "manual",
      });
      const response = await fetch(backendRequest);
      const newHeaders = new Headers(response.headers);
      newHeaders.set("Access-Control-Allow-Origin", request.headers.get("Origin") || "*");
      newHeaders.set("Access-Control-Allow-Credentials", "true");
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
      });
    }

    return env.ASSETS.fetch(request);
  },
};
