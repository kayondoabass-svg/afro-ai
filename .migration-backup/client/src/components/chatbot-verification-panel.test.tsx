import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  invalidate: vi.fn(),
  query: vi.fn(),
  confirm: vi.fn(),
  clipboard: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: mocks.query,
  useMutation: (options: any) => ({
    mutate: (value?: unknown) => {
      const result = options.mutationFn(value);
      Promise.resolve(result).then(options.onSuccess).catch(options.onError);
    },
    isPending: false,
    isError: false,
  }),
}));
vi.mock("@/lib/queryClient", () => ({
  apiRequest: mocks.request,
  queryClient: { invalidateQueries: mocks.invalidate },
}));

import { ChatbotVerificationPanel } from "./chatbot-verification-panel";

const pendingDomain = {
  id: "dom-1",
  hostname: "help.example.org",
  status: "pending" as const,
  createdAt: "2025-02-01T10:00:00.000Z",
  verifiedAt: null,
  lastCheckedAt: null,
  verification: { type: "TXT" as const, name: "_afroai.help.example.org", value: "afroai-verify=token-value", ttl: 300 },
};

const legacyResponse = {
  enforcement: "legacy" as const,
  websiteHostname: "help.example.org",
  statusLabel: "Legacy mode",
  domains: [pendingDomain],
  installation: null,
  visitorTest: null,
};

const jsonResponse = (value: unknown) => ({ json: async () => value });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.confirm.mockReturnValue(true);
  mocks.clipboard.mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: mocks.clipboard } });
  vi.stubGlobal("confirm", mocks.confirm);
  mocks.query.mockReturnValue({ data: legacyResponse, isLoading: false, isError: false, refetch: vi.fn(), isFetching: false });
});

describe("ChatbotVerificationPanel", () => {
  it("shows a loading skeleton and a retryable API error", () => {
    mocks.query.mockReturnValueOnce({ data: undefined, isLoading: true, isError: false, refetch: vi.fn() });
    const { unmount } = render(<ChatbotVerificationPanel chatbotId={12} />);
    expect(screen.getByLabelText("Loading verification")).toBeInTheDocument();
    unmount();
    mocks.query.mockReturnValue({ data: undefined, isLoading: false, isError: true, error: new Error("503: unavailable"), refetch: vi.fn() });
    render(<ChatbotVerificationPanel chatbotId={12} />);
    expect(screen.getByText("Verification details unavailable")).toBeInTheDocument();
    expect(screen.getByText("unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("adds a bare hostname, shows pending TXT details, copies records, and checks DNS", async () => {
    mocks.request.mockImplementation((method: string, url: string, body?: unknown) => {
      if (method === "POST" && url.endsWith("/domains")) return Promise.resolve(jsonResponse(pendingDomain));
      if (url.endsWith("/domains/dom-1/check")) return Promise.resolve(jsonResponse({ verified: false, message: "DNS record not visible yet." }));
      return Promise.resolve(jsonResponse({}));
    });
    render(<ChatbotVerificationPanel chatbotId={12} />);
    expect(screen.getByText("Pending DNS")).toBeInTheDocument();
    const hostCopy = screen.getByRole("button", { name: "Copy host / name" });
    fireEvent.click(hostCopy);
    await waitFor(() => expect(mocks.clipboard).toHaveBeenCalledWith("_afroai.help.example.org"));
    fireEvent.change(screen.getByLabelText("Website hostname"), { target: { value: "https://docs.example.org/" } });
    fireEvent.click(screen.getByRole("button", { name: "Add website" }));
    await waitFor(() => expect(mocks.request).toHaveBeenCalledWith("POST", "/api/chatbots/12/domains", { hostname: "docs.example.org" }));
    fireEvent.click(screen.getByRole("button", { name: "Check DNS" }));
    await waitFor(() => expect(mocks.request).toHaveBeenCalledWith("POST", "/api/chatbots/12/domains/dom-1/check"));
    expect(mocks.invalidate).toHaveBeenCalledWith({ queryKey: ["/api/chatbots/12/verification"] });
  });

  it("renders the saved installation result and requests a single explicit paid test", async () => {
    mocks.query.mockReturnValue({
      data: {
        ...legacyResponse,
        installation: { verified: true, code: "FOUND", message: "Widget script detected.", url: "https://help.example.org", checkedAt: "2025-02-08T12:00:00.000Z" },
      },
      isLoading: false, isError: false, refetch: vi.fn(), isFetching: false,
    });
    mocks.request.mockImplementation((method: string, url: string, body?: unknown) => {
      if (url.endsWith("/verification/test")) return Promise.resolve(jsonResponse({ reply: "I can help with services.", testHistorySaved: true }));
      if (url.endsWith("/verify")) return Promise.resolve(jsonResponse({ verified: true, code: "FOUND", message: "Widget script detected.", url: "https://help.example.org", checkedAt: "2025-02-08T12:00:00.000Z" }));
      return Promise.resolve(jsonResponse({}));
    });
    render(<ChatbotVerificationPanel chatbotId={12} />);
    expect(screen.getByText("Widget script detected.")).toBeInTheDocument();
    expect(screen.getByText(/Last checked:/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Send one test" }));
    await waitFor(() => expect(mocks.request).toHaveBeenCalledWith("POST", "/api/chatbots/12/verification/test", {
      consent: true, message: "Hello, what can you help me with?",
    }));
    expect(mocks.confirm).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByText(/Test reply: I can help with services/)).toBeInTheDocument());
    expect(screen.getByText(/Verification status was saved/)).toBeInTheDocument();
    expect(screen.getByText(/not a browser-rendering check/)).toBeInTheDocument();
  });

  it("keeps existing chatbots in legacy mode until the owner explicitly opts in", async () => {
    const view = render(<ChatbotVerificationPanel chatbotId={12} />);
    expect(screen.getByText("Legacy · supported")).toBeInTheDocument();
    expect(screen.getByText(/remains supported as-is/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Enable enforcement" }));
    expect(mocks.request).not.toHaveBeenCalled();
    expect(screen.getByText(/Verify the exact current website hostname first/)).toBeInTheDocument();

    mocks.query.mockReturnValue({
      data: { ...legacyResponse, domains: [{ ...pendingDomain, status: "verified", verifiedAt: "2025-02-02T12:00:00.000Z" }] },
      isLoading: false, isError: false, refetch: vi.fn(), isFetching: false,
    });
    mocks.request.mockResolvedValue({});
    view.rerender(<ChatbotVerificationPanel chatbotId={12} />);
    mocks.confirm.mockReturnValue(false);
    fireEvent.click(screen.getByRole("button", { name: "Enable enforcement" }));
    expect(mocks.request).not.toHaveBeenCalled();
    mocks.confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Enable enforcement" }));
    await waitFor(() => expect(mocks.request).toHaveBeenCalledWith("POST", "/api/chatbots/12/verification/enforce"));
    expect(mocks.confirm).toHaveBeenCalledWith(expect.stringContaining("may stop working"));
    expect(mocks.invalidate).toHaveBeenCalled();
  });

  it("warns when a reply arrives but verification status is not saved, without suggesting retry", async () => {
    mocks.request.mockImplementation((method: string, url: string) => url.endsWith("/verification/test")
      ? Promise.resolve(jsonResponse({ reply: "I can help with services.", testHistorySaved: false }))
      : Promise.resolve(jsonResponse({})));
    render(<ChatbotVerificationPanel chatbotId={12} />);
    fireEvent.click(screen.getByRole("button", { name: "Send one test" }));
    await waitFor(() => expect(screen.getByText(/Reply received, but verification status could not be saved/)).toBeInTheDocument());
    expect(screen.getByText(/Do not retry automatically/)).toBeInTheDocument();
    expect(screen.queryByText(/conversation history/)).not.toBeInTheDocument();
    expect(mocks.request).toHaveBeenCalledTimes(1);
  });

  it("does not claim success when the visitor-test mutation fails", async () => {
    mocks.request.mockRejectedValue(new Error("503: allowance service unavailable"));
    render(<ChatbotVerificationPanel chatbotId={12} />);
    fireEvent.click(screen.getByRole("button", { name: "Send one test" }));
    await waitFor(() => expect(screen.getByText("allowance service unavailable")).toBeInTheDocument());
    expect(screen.queryByText(/Test reply received/)).not.toBeInTheDocument();
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });

  it("requires the current exact website hostname proof after the configured hostname changes", () => {
    mocks.query.mockReturnValue({
      data: {
        ...legacyResponse,
        websiteHostname: "new.example.org",
        domains: [{ ...pendingDomain, hostname: "old.example.org", status: "verified", verifiedAt: "2025-02-02T12:00:00.000Z" }],
      },
      isLoading: false, isError: false, refetch: vi.fn(), isFetching: false,
    });
    render(<ChatbotVerificationPanel chatbotId={12} />);
    expect(screen.getByText("Current website not verified")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enable enforcement" })).toBeDisabled();
    expect(screen.getByText(/Verify the exact current website hostname first/)).toBeInTheDocument();
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("disables visitor tests for a chatbot reported as Disabled", () => {
    mocks.query.mockReturnValue({
      data: { ...legacyResponse, statusLabel: "Disabled" },
      isLoading: false, isError: false, refetch: vi.fn(), isFetching: false,
    });
    render(<ChatbotVerificationPanel chatbotId={12} />);
    expect(screen.getByRole("button", { name: "Send one test" })).toBeDisabled();
    expect(screen.getByText("Enable this chatbot before testing a visitor reply.")).toBeInTheDocument();
  });
});
