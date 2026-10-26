import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { FounderAlertCenter } from "./FounderAlertCenter";

const useQueryMock = vi.hoisted(() => vi.fn());
const useMutationMock = vi.hoisted(() => vi.fn());
const apiRequestMock = vi.hoisted(() => vi.fn());
const invalidateMock = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-query", () => ({ useQuery: useQueryMock, useMutation: useMutationMock }));
vi.mock("@/lib/queryClient", () => ({
  apiRequest: apiRequestMock,
  queryClient: { invalidateQueries: invalidateMock },
}));

const settings = {
  enabled: false, recipientIds: [], members: [{ id: 4, name: "Amina", email: "amina@example.test" }],
  lastCheckedAt: null, lastError: null,
};
const currentAlert = { id: "alert/a", title: "Elevated failures", severity: "warning" as const, section: "users" };
const overview = { alerts: [currentAlert] };
const history = { rows: [{
  alert_id: "alert/a", title: "Elevated failures", severity: "warning" as const, section: "users",
  state: "open", opened_at: "2025-01-02T12:00:00.000Z", resolved_at: null, acknowledged_at: null,
}] };

describe("FounderAlertCenter", () => {
  beforeEach(() => {
    useQueryMock.mockReset();
    useMutationMock.mockReset();
    apiRequestMock.mockReset().mockResolvedValue({ json: async () => ({ ok: true }) });
    invalidateMock.mockReset().mockResolvedValue(undefined);
    useMutationMock.mockImplementation(() => ({ isPending: false, mutate: vi.fn() }));
  });

  it("saves opt-in preferences and acknowledges only current alerts", async () => {
    useQueryMock.mockImplementation(({ queryKey }: { queryKey: string[] }) => ({
      data: queryKey[0] === "/api/founder/alert-settings" ? settings : queryKey[0] === "/api/founder/alert-history" ? history : overview,
      isPending: false, isError: false, isFetching: false, refetch: vi.fn(),
    }));
    const { rerender } = render(<FounderAlertCenter isFounder />);
    fireEvent.click(screen.getByLabelText("Enable founder alert notifications"));
    fireEvent.click(screen.getByLabelText("Notify Amina"));
    fireEvent.click(screen.getByRole("button", { name: "Save preferences" }));

    const latestMutations = useMutationMock.mock.calls.slice(-2);
    const saveOptions = latestMutations[0][0];
    await act(async () => {
      await saveOptions.mutationFn();
      await saveOptions.onSuccess();
    });
    expect(apiRequestMock).toHaveBeenCalledWith("PUT", "/api/founder/alert-settings", { enabled: true, recipientIds: [4] });
    expect(screen.getByRole("status")).toHaveTextContent("Notification preferences saved.");

    fireEvent.click(screen.getByRole("button", { name: "Acknowledge" }));
    const acknowledgeOptions = useMutationMock.mock.calls.slice(-1)[0][0];
    await act(async () => {
      await acknowledgeOptions.mutationFn("alert/a");
      await acknowledgeOptions.onSuccess();
    });
    expect(apiRequestMock).toHaveBeenCalledWith("POST", "/api/founder/alerts/alert%2Fa/acknowledge");
    expect(invalidateMock).toHaveBeenCalledWith({ queryKey: ["/api/founder/alert-settings"] });
    expect(invalidateMock).toHaveBeenCalledWith({ queryKey: ["/api/founder/alert-history"] });
    expect(invalidateMock).toHaveBeenCalledWith({ queryKey: ["/api/founder/overview"] });
    rerender(<FounderAlertCenter isFounder={false} />);
    expect(screen.queryByLabelText("Founder alert controls")).not.toBeInTheDocument();
  });

  it("shows a retry path when settings and history are unavailable", () => {
    useQueryMock.mockImplementation(({ queryKey }: { queryKey: string[] }) => ({
      isPending: false, isError: true, refetch: vi.fn(),
      error: new Error("offline"), data: queryKey[0] === "/api/founder/overview" ? undefined : undefined,
    }));
    render(<FounderAlertCenter isFounder />);
    expect(screen.getByText("Notification settings unavailable.")).toBeInTheDocument();
    expect(screen.getByText("Alert history unavailable.")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Retry" })).toHaveLength(2);
  });
});
