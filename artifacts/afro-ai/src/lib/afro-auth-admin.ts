export async function authAdminRequest(path: string, name?: string) {
  const response = await fetch(path, {
    method: name === undefined ? "GET" : "POST",
    credentials: "include",
    cache: "no-store",
    ...(name === undefined ? {} : {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.message || "Afro Auth is temporarily unavailable. Please try again.");
  }
  if (!body) throw new Error("Afro Auth returned an invalid response. Please try again.");
  return body;
}