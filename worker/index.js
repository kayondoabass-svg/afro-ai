export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const backendUrl = "https://afro-ai.replit.app" + url.pathname + url.search;
    const backendRequest = new Request(backendUrl, {
      method: request.method,
      headers: request.headers,
      body: request.method !== "GET" && request.method !== "HEAD" ? request.body : undefined,
      redirect: "manual",
    });
    return fetch(backendRequest);
  },
};
