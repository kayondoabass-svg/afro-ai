import { randomUUID } from "node:crypto";
import { chatStorage } from "./replit_integrations/chat/storage";
import { ProjectFileError } from "./project-file-policy";
import { archiveActivities } from "./project-workbench/activity-history";
import { safeActivity } from "./project-workbench/activity-model";

type WebsiteAction = "generate_website" | "save_website_version" | "save_project_files";
/**
 * Ordinary chat also creates real website source. Record those actual operations,
 * not invented model tool calls or inferred execution from the response text.
 */
export async function recordChatExecutionActivity(
  ownerId: string, conversationId: number, jobId: string, tool: WebsiteAction,
  status: "started" | "succeeded" | "failed", title: string, paths?: string[],
) {
  const conversation = await chatStorage.getConversation(conversationId);
  if (!conversation || conversation.userId !== ownerId) throw new ProjectFileError(404, "Conversation not found");
  const activity = safeActivity({
    id: randomUUID(), jobId: `chat:${jobId}`, callId: `chat:${jobId}:${tool}`,
    createdAt: new Date().toISOString(), tool, status, title, paths,
  });
  try {
    await archiveActivities(String(conversationId), [activity]);
    return { ...activity, persisted: true };
  } catch {
    // Saving source and saving its activity are independent. Never report either
    // as failed/saved merely because the other operation had a different outcome.
    return { ...activity, persisted: false, message: "This action occurred, but its activity history could not be saved." };
  }
}
