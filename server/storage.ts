import { db } from "./db";
import { projects, publishedApps, type Project, type InsertProject, type PublishedApp, type InsertPublishedApp } from "@shared/schema";
import { users } from "@shared/models/auth";
import { conversations, messages } from "@shared/models/chat";
import { eq, desc, sql, count } from "drizzle-orm";

export interface IStorage {
  getProjectsByUser(userId: string): Promise<Project[]>;
  getProject(id: number): Promise<Project | undefined>;
  createProject(project: InsertProject): Promise<Project>;
  deleteProject(id: number): Promise<void>;
  getPublishedAppBySubdomain(subdomain: string): Promise<PublishedApp | undefined>;
  getPublishedAppsByUser(userId: string): Promise<PublishedApp[]>;
  createPublishedApp(app: InsertPublishedApp): Promise<PublishedApp>;
  updatePublishedApp(id: number, data: Partial<InsertPublishedApp>): Promise<PublishedApp>;
  deletePublishedApp(id: number): Promise<void>;
  getAllUsers(): Promise<any[]>;
  getAllProjects(): Promise<any[]>;
  getAllPublishedApps(): Promise<any[]>;
  getPlatformStats(): Promise<{
    totalUsers: number;
    totalProjects: number;
    totalPublishedApps: number;
    totalConversations: number;
    totalMessages: number;
    recentUsers: any[];
    recentProjects: any[];
    recentPublishedApps: any[];
  }>;
}

class DatabaseStorage implements IStorage {
  async getProjectsByUser(userId: string): Promise<Project[]> {
    return db.select().from(projects).where(eq(projects.userId, userId)).orderBy(desc(projects.createdAt));
  }

  async getProject(id: number): Promise<Project | undefined> {
    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    return project;
  }

  async createProject(project: InsertProject): Promise<Project> {
    const [created] = await db.insert(projects).values(project).returning();
    return created;
  }

  async deleteProject(id: number): Promise<void> {
    await db.delete(projects).where(eq(projects.id, id));
  }

  async getPublishedAppBySubdomain(subdomain: string): Promise<PublishedApp | undefined> {
    const [app] = await db.select().from(publishedApps).where(eq(publishedApps.subdomain, subdomain));
    return app;
  }

  async getPublishedAppsByUser(userId: string): Promise<PublishedApp[]> {
    return db.select().from(publishedApps).where(eq(publishedApps.userId, userId)).orderBy(desc(publishedApps.createdAt));
  }

  async createPublishedApp(app: InsertPublishedApp): Promise<PublishedApp> {
    const [created] = await db.insert(publishedApps).values(app).returning();
    return created;
  }

  async updatePublishedApp(id: number, data: Partial<InsertPublishedApp>): Promise<PublishedApp> {
    const [updated] = await db.update(publishedApps).set({ ...data, updatedAt: new Date() }).where(eq(publishedApps.id, id)).returning();
    return updated;
  }

  async deletePublishedApp(id: number): Promise<void> {
    await db.delete(publishedApps).where(eq(publishedApps.id, id));
  }

  async getAllUsers(): Promise<any[]> {
    return db.select().from(users).orderBy(desc(users.createdAt));
  }

  async getAllProjects(): Promise<any[]> {
    return db.select().from(projects).orderBy(desc(projects.createdAt));
  }

  async getAllPublishedApps(): Promise<any[]> {
    return db.select().from(publishedApps).orderBy(desc(publishedApps.createdAt));
  }

  async getPlatformStats() {
    const [userCount] = await db.select({ value: count() }).from(users);
    const [projectCount] = await db.select({ value: count() }).from(projects);
    const [publishedCount] = await db.select({ value: count() }).from(publishedApps);
    const [convoCount] = await db.select({ value: count() }).from(conversations);
    const [msgCount] = await db.select({ value: count() }).from(messages);

    const recentUsers = await db.select().from(users).orderBy(desc(users.createdAt)).limit(10);
    const recentProjects = await db.select().from(projects).orderBy(desc(projects.createdAt)).limit(10);
    const recentPublishedApps = await db.select().from(publishedApps).orderBy(desc(publishedApps.createdAt)).limit(10);

    return {
      totalUsers: userCount.value,
      totalProjects: projectCount.value,
      totalPublishedApps: publishedCount.value,
      totalConversations: convoCount.value,
      totalMessages: msgCount.value,
      recentUsers,
      recentProjects,
      recentPublishedApps,
    };
  }
}

export const storage = new DatabaseStorage();
