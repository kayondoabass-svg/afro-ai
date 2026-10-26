// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServer, type Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { io as connect, type Socket } from "socket.io-client";
import { FOUNDER_EMAIL } from "../replit_integrations/auth";
import { hasShellAccess, isAllowedShellOrigin } from "../shell-security";

const secret = "test-only-shell-secret-".repeat(3);

describe("patched shell transport", () => {
  let http: HttpServer;
  let server: Server;
  let url: string;
  const clients: Socket[] = [];

  beforeEach(async () => {
    http = createServer();
    server = new Server(http, {
      path: "/shell-ws",
      transports: ["websocket"],
      allowRequest: (request, done) => done(null, isAllowedShellOrigin(request.headers.origin)),
    });
    server.use((socket, next) => {
      // Supply a test session to the real access policy; never start a shell,
      // execute commands, or use production sessions/credentials in this test.
      const actor = socket.handshake.auth.actor;
      const request = {
        isAuthenticated: () => typeof actor === "string",
        user: { claims: { email: actor === "founder" ? FOUNDER_EMAIL : "ordinary@example.com" } },
      };
      next(hasShellAccess(request, socket.handshake.auth.adminKey, secret, true)
        ? undefined : new Error("Access denied"));
    });
    server.on("connection", socket => {
      socket.on("input", value => socket.emit("output", value));
      socket.on("resize", size => socket.emit("resized", size));
    });
    await new Promise<void>(resolve => http.listen(0, "127.0.0.1", resolve));
    const address = http.address();
    if (!address || typeof address === "string") throw new Error("Test transport did not listen");
    url = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    clients.splice(0).forEach(client => client.disconnect());
    if (server) await new Promise<void>(resolve => server.close(() => resolve()));
  });

  function client(auth: Record<string, unknown>, origin = "https://afroaigroup.com") {
    const socket = connect(url, {
      path: "/shell-ws", transports: ["websocket"], reconnection: false,
      autoConnect: false, timeout: 2000, auth, extraHeaders: { Origin: origin },
    });
    clients.push(socket);
    return socket;
  }

  it("preserves authorised live input/output and resize events", async () => {
    const socket = client({ actor: "founder", adminKey: secret });
    await new Promise<void>((resolve, reject) => {
      socket.once("connect", resolve).once("connect_error", reject).connect();
    });
    expect(socket.io.engine.transport.name).toBe("websocket");
    const output = new Promise(resolve => socket.once("output", resolve));
    socket.emit("input", "terminal transport test");
    expect(await output).toBe("terminal transport test");
    const resized = new Promise(resolve => socket.once("resized", resolve));
    socket.emit("resize", { cols: 120, rows: 40 });
    expect(await resized).toEqual({ cols: 120, rows: 40 });
    socket.disconnect();
    expect(socket.connected).toBe(false);
  });

  it.each([
    ["missing session", { adminKey: secret }],
    ["ordinary account", { actor: "customer", adminKey: secret }],
    ["incorrect key", { actor: "founder", adminKey: "incorrect" }],
  ])("rejects %s over the real WebSocket connection", async (_label, auth) => {
    const socket = client(auth);
    const error = new Promise<Error>(resolve => socket.once("connect_error", resolve));
    socket.connect();
    expect((await error).message).toBe("Access denied");
    expect(socket.connected).toBe(false);
  });

  it("rejects an untrusted origin before opening an authorised session", async () => {
    const socket = client({ actor: "founder", adminKey: secret }, "https://untrusted.example");
    const error = new Promise<Error>(resolve => socket.once("connect_error", resolve));
    socket.connect();
    expect(await error).toBeInstanceOf(Error);
    expect(socket.connected).toBe(false);
  });
});
