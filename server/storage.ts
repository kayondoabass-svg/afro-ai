import { db } from "./db";
import { projects, publishedApps, type Project, type InsertProject, type PublishedApp, type InsertPublishedApp } from "@shared/schema";
import { eq, desc } from "drizzle-orm";

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
}

export const storage = new DatabaseStorage();
