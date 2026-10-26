// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

it("routes both existing shell clients' transport to the API artifact", () => {
  const read = (file: string) => readFileSync(resolve(file), "utf8");
  const metadata = read("artifacts/api-server/.replit-artifact/artifact.toml");
  const paths = metadata.match(/paths\s*=\s*(\[[^\]]+\])/);
  expect(paths).not.toBeNull();
  const apiPaths = JSON.parse(paths![1]) as string[];
  const server = read("server/index.ts");
  const configured = server.match(/new SocketIOServer[\s\S]*?path:\s*["']([^"']+)/);
  expect(configured?.[1]).toBe("/shell-ws");
  expect(apiPaths).toContain(configured![1]);
  for (const client of ["client/src/pages/shell.tsx", "client/src/pages/console.tsx"]) {
    const path = read(client).match(/path:\s*["']([^"']+)/);
    expect(path?.[1]).toBe(configured![1]);
    expect(apiPaths).toContain(path![1]);
  }
});
