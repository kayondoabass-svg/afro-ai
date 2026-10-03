import type { Project } from "@shared/schema";

export const FULLSTACK_SOURCE_NOTICE = "Source-only starter: React/TypeScript frontend and Workers/Hono + D1 backend files are saved in your project. No runtime or database is provisioned. Static Preview and Publish cannot deploy a working full-stack app.";

export function projectChatUrl(project: Pick<Project, "id" | "name" | "type" | "description">): string {
  const base = `/chat?projectId=${project.id}&project=${encodeURIComponent(project.name)}`;
  return project.type === "fullstack"
    ? `${base}&projectMode=fullstack`
    : `${base}&type=${encodeURIComponent(project.type)}&description=${encodeURIComponent(project.description || "")}`;
}

export function isSetupBlocked(project: Pick<Project, "type" | "status">): boolean {
  return project.type === "fullstack" && ["initializing", "setup_failed"].includes(project.status);
}

// apiRequest preserves the response body in its Error message.
export function projectRequestError(error: unknown): { message: string; project?: Project } {
  const message = error instanceof Error ? error.message : "Could not complete project setup.";
  try {
    const body = JSON.parse(message.replace(/^\d{3}:\s*/, ""));
    return { message: body.message || message, project: body.project };
  } catch {
    return { message };
  }
}