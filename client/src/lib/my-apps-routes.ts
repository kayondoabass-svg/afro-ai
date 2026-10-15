export const MY_APPS_ROUTE_ALIASES = ["/deployments", "/apps", "/my-apps"] as const;

export function recommendationHref(
  key: string,
  context: { projectId?: number; appId?: number },
): string {
  const paths: Record<string, string> = {
    domain: "/domains",
    auth: "/dashboard/auth",
    email: "/email-api",
    chatbot: "/chatbots",
    sms: "/integrations",
    ussd: "/ussd",
  };
  const path = paths[key];
  if (!path) return "/";
  const params = new URLSearchParams();
  if (context.projectId) params.set("projectId", String(context.projectId));
  if (context.appId) params.set("appId", String(context.appId));
  return params.size ? `${path}?${params.toString()}` : path;
}
