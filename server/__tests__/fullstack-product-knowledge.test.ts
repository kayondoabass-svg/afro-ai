import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
it("keeps the assistant honest about database setup versus full-stack deployment and chat capabilities", () => {
  const knowledge = readFileSync("server/product-self-knowledge.ts", "utf8");
  expect(knowledge).toContain("Database ready does NOT mean app published");
  expect(knowledge).toContain("they do not provision databases");
  expect(knowledge).toContain("Never send full-stack projects through the static HTML publisher");
  expect(knowledge).toContain("Only successful action results plus deployment health checks");
});