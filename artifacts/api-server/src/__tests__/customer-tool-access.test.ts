import { expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
const mocks = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("../db", () => ({ db: { execute: mocks.execute } }));
import { customerListingSchema, removeOwnedCollaborator } from "../customer-tool-access";
it("rejects changing the owner or system fields of a listing", () => {
  for (const body of [{ userId: "other" }, { id: 9 }, { downloads: 999 }, { createdAt: new Date() }]) {
    expect(customerListingSchema.partial().safeParse(body).success).toBe(false);
  }
  expect(customerListingSchema.partial().safeParse({ title: "My template" }).success).toBe(true);
});
it("restricts collaborator removal to projects owned by the signed-in client", async () => {
  mocks.execute.mockImplementation(async query => {
    const compiled = new PgDialect().sqlToQuery(query);
    expect(compiled.sql).toContain("SELECT id FROM projects WHERE user_id");
    return { rows: compiled.params.includes("owner") ? [{ id: 7 }] : [] };
  });
  expect(await removeOwnedCollaborator(7, "other")).toBe(false);
  expect(await removeOwnedCollaborator(7, "owner")).toBe(true);
  mocks.execute.mockClear();
  expect(await removeOwnedCollaborator(NaN, "owner")).toBe(false);
  expect(mocks.execute).not.toHaveBeenCalled();
});