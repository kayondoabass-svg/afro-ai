import { db } from "../../db";
import { conversations, messages } from "@shared/schema";
import { eq, desc, and } from "drizzle-orm";

export interface IChatStorage {
  getConversation(id: number): Promise<typeof conversations.$inferSelect | undefined>;
  getAllConversations(): Promise<(typeof conversations.$inferSelect)[]>;
  getConversationsByUser(userId: string): Promise<(typeof conversations.$inferSelect)[]>;
  createConversation(title: string, projectId?: number, userId?: string): Promise<typeof conversations.$inferSelect>;
  getConversationsByProject(projectId: number): Promise<(typeof conversations.$inferSelect)[]>;
  deleteConversation(id: number): Promise<void>;
  updateConversationTitle(id: number, title: string): Promise<void>;
  getMessagesByConversation(conversationId: number): Promise<(typeof messages.$inferSelect)[]>;
  createMessage(conversationId: number, role: string, content: string): Promise<typeof messages.$inferSelect>;
}

export const chatStorage: IChatStorage = {
  async getConversation(id: number) {
    const [conversation] = await db.select().from(conversations).where(eq(conversations.id, id));
    return conversation;
  },

  async getAllConversations() {
    return db.select().from(conversations).orderBy(desc(conversations.createdAt));
  },

  async getConversationsByUser(userId: string) {
    return db.select().from(conversations).where(eq(conversations.userId, userId)).orderBy(desc(conversations.createdAt));
  },

  async createConversation(title: string, projectId?: number, userId?: string) {
    const values: any = { title };
    if (projectId) values.projectId = projectId;
    if (userId) values.userId = userId;
    const [conversation] = await db.insert(conversations).values(values).returning();
    return conversation;
  },

  async getConversationsByProject(projectId: number) {
    return db.select().from(conversations).where(eq(conversations.projectId, projectId)).orderBy(desc(conversations.createdAt));
  },

  async deleteConversation(id: number) {
    await db.delete(messages).where(eq(messages.conversationId, id));
    await db.delete(conversations).where(eq(conversations.id, id));
  },

  async updateConversationTitle(id: number, title: string) {
    await db.update(conversations).set({ title }).where(eq(conversations.id, id));
  },

  async getMessagesByConversation(conversationId: number) {
    return db.select().from(messages).where(eq(messages.conversationId, conversationId)).orderBy(messages.createdAt);
  },

  async createMessage(conversationId: number, role: string, content: string) {
    const [message] = await db.insert(messages).values({ conversationId, role, content }).returning();
    return message;
  },
};

