import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({ query: vi.fn(), request: vi.fn(), invalidate: vi.fn(), toast: vi.fn(), confirm: vi.fn(), clipboard: vi.fn() }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: mocks.query,
  useMutation: (options: any) => ({
    mutate: (value?: unknown) => Promise.resolve().then(() => options.mutationFn(value)).then(options.onSuccess).catch(options.onError),
    isPending: false,
    reset: vi.fn(),
  }),
}));
vi.mock("@/lib/queryClient", () => ({ apiRequest: mocks.request, queryClient: { invalidateQueries: mocks.invalidate } }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));

import { ChatbotApiCredentials } from "./chatbot-api-credentials";

const activeKey = { id: "private-1", name: "production", prefix: "afro_sk_live_ab12", createdAt: "2025-01-01T00:00:00Z", lastUsedAt: null, revokedAt: null, replacesKeyId: null };
const keyWithSecret = { key: { ...activeKey, id: "private-2", prefix: "afro_sk_live_cd34", replacesKeyId: "private-1" }, secretKey: "one-time-server-secret-value" };
const json = (value: unknown) => ({ json: async () => value });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.confirm.mockReturnValue(true);
  mocks.clipboard.mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: mocks.clipboard } });
  vi.stubGlobal("confirm", mocks.confirm);
  mocks.query.mockReturnValue({ data: { enforcement: "legacy", keys: [activeKey] }, isLoading: false, isError: false, refetch: vi.fn() });
  mocks.request.mockImplementation((method: string, url: string) => {
    if (url.endsWith("/rotate")) return Promise.resolve(json(keyWithSecret));
    if (url.endsWith("/enforce")) return Promise.resolve(json({ enforcement: "required" }));
    return Promise.resolve(json({ key: activeKey, secretKey: "one-time-server-secret-value" }));
  });
});

describe("ChatbotApiCredentials", () => {
  it("reveals a generated secret once and clears it after saving", async () => {
    render(<ChatbotApiCredentials widgetId={17} />);
    expect(screen.getByText(/public widget ID still authorizes legacy server calls/i)).toBeInTheDocument();
    expect(mocks.request).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Generate private key" }));
    expect(await screen.findByTestId("private-secret-once")).toHaveTextContent("one-time-server-secret-value");
    expect(mocks.request).toHaveBeenCalledWith("POST", "/api/chatbots/17/api-credentials", { name: "production" });
    expect(mocks.query.mock.calls.some((call: unknown[]) => JSON.stringify(call).includes("one-time-server-secret-value"))).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Copy private key" }));
    await waitFor(() => expect(mocks.clipboard).toHaveBeenCalledWith("one-time-server-secret-value"));
    fireEvent.click(screen.getByRole("button", { name: "I've saved it — close" }));
    await waitFor(() => expect(screen.queryByTestId("private-secret-once")).not.toBeInTheDocument());
  });

  it("rotates with overlap and clearly identifies the old key", async () => {
    render(<ChatbotApiCredentials widgetId={17} />);
    fireEvent.click(screen.getByRole("button", { name: "Rotate" }));
    expect(mocks.confirm).toHaveBeenCalled();
    await waitFor(() => expect(mocks.request).toHaveBeenCalledWith("POST", "/api/chatbots/17/api-credentials/private-1/rotate"));
    expect(await screen.findByTestId("private-secret-once")).toHaveTextContent("one-time-server-secret-value");
    expect(screen.getByText(/Overlap is active/i)).toBeInTheDocument();
  });

  it("requires separate revoke and enforcement confirmations", async () => {
    render(<ChatbotApiCredentials widgetId={17} />);
    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
    await waitFor(() => expect(mocks.request).toHaveBeenCalledWith("POST", "/api/chatbots/17/api-credentials/private-1/revoke", { confirm: true }));
    fireEvent.click(screen.getByRole("button", { name: "Require private key" }));
    expect(await screen.findByText(/Deploy an active private key to every server integration first/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "I deployed the key — switch" }));
    await waitFor(() => expect(mocks.request).toHaveBeenCalledWith("POST", "/api/chatbots/17/api-credentials/enforce", { confirm: true }));
  });
});
