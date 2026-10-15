import {
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleStop,
  Clock3,
  LoaderCircle,
  MessageCircle,
  Send,
  type LucideIcon,
} from "lucide-react";

export type ChatRequestStatus =
  | "sending"
  | "waiting"
  | "responding"
  | "received"
  | "failed"
  | "stopped"
  | "empty";

export type ChatRequestMode = "chat" | "project";

type ActivityState = {
  label: string;
  Icon: LucideIcon;
  active?: boolean;
  tone: string;
};

const activityStates: Record<ChatRequestStatus, ActivityState> = {
  sending: {
    label: "Sending request",
    Icon: Send,
    active: true,
    tone: "text-sky-200",
  },
  waiting: {
    label: "Waiting for response",
    Icon: Clock3,
    active: true,
    tone: "text-amber-200",
  },
  responding: {
    label: "Receiving response",
    Icon: MessageCircle,
    active: true,
    tone: "text-teal-200",
  },
  received: {
    label: "Reply received",
    Icon: CircleCheck,
    tone: "text-emerald-200",
  },
  failed: {
    label: "Request failed",
    Icon: CircleAlert,
    tone: "text-rose-200",
  },
  stopped: {
    label: "Request stopped",
    Icon: CircleStop,
    tone: "text-orange-200",
  },
  empty: {
    label: "No reply returned",
    Icon: CircleDashed,
    tone: "text-amber-200",
  },
};

/**
 * A compact, browser-observed request/response indicator. It reports only the
 * state of the chat exchange; it does not imply that project tools ran.
 */
export function ChatRequestActivity({
  status,
  mode = "chat",
}: {
  status: ChatRequestStatus;
  mode?: ChatRequestMode;
}) {
  const { label, Icon, active, tone } = activityStates[status];
  const modeLabel = mode === "project" ? "Project" : "Chat";

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`${modeLabel} request activity: ${label}`}
      data-status={status}
      data-mode={mode}
      className={`flex min-w-0 w-fit max-w-full items-center gap-2 rounded-full border border-zinc-700/80 bg-zinc-900/90 px-2.5 py-1.5 text-xs leading-4 ${tone}`}
    >
      <Icon
        aria-hidden="true"
        data-phase-icon={status}
        className="h-3.5 w-3.5 shrink-0"
        strokeWidth={2}
      />
      <span className="min-w-0 break-words font-medium">{label}</span>
      <span aria-hidden="true" className="select-none text-zinc-500">·</span>
      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
        {modeLabel}
      </span>
      {active && (
        <LoaderCircle
          aria-hidden="true"
          data-testid="request-activity-spinner"
          className="h-3 w-3 shrink-0 animate-spin motion-reduce:animate-none"
          strokeWidth={2}
        />
      )}
    </div>
  );
}
