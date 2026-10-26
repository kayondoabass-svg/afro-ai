import { chatStorage } from "./replit_integrations/chat/storage";
import { storage } from "./storage";
import { listProjectFiles, saveProjectFiles, ProjectFileError } from "./project-files";
import { extractWebsiteHtml } from "@shared/html-extraction";

// Recovery never deletes sibling CSS/scripts/assets or overwrites a manually
// changed index.html that differs from all retained generated snapshots.
export async function syncGeneratedSource(userId: string, conversationId: number) {
  const conversation = await chatStorage.getConversation(conversationId);
  if (!conversation || conversation.userId !== userId) throw new ProjectFileError(404, "Conversation not found.");
  const versions = await storage.getAppVersions(conversationId);
  const html = extractWebsiteHtml(versions[0]?.htmlContent || "");
  if (!html) throw new ProjectFileError(409, "No saved generated website source is available.");
  const files = await listProjectFiles(userId, conversationId);
  const index = files.find(file => file.path.toLowerCase() === "index.html");
  if (index && index.content !== html && !versions.some(version => extractWebsiteHtml(version.htmlContent) === index.content)) {
    throw new ProjectFileError(409, "index.html has separate edits. Review them before replacing it with a generated snapshot.");
  }
  await saveProjectFiles(userId, conversationId, [{ name: "index.html", path: "index.html", language: "html", content: html }], "merge");
  return { saved: true, paths: ["index.html"] };
}
