import { formatMailTime } from "@shared/mail-timestamps";

export type AuthMailActivity = {
  id?: string; purpose: string; outcome: string; reason: string | null;
  message_id: string | null; created_at: string | number | null;
  delivery?: { status: string | null; error: string | null; checkedAt: string | null } | null;
};

export function MailActivityList({ events }: { events: AuthMailActivity[] }) {
  if (!events.length) return <p className="text-xs text-muted-foreground">No recorded email activity.</p>;
  return <ul className="space-y-2">{events.slice(0, 4).map((mail, index) =>
    <li key={mail.id || `${mail.message_id || index}-${index}`} className="flex flex-col justify-between gap-2 rounded-md border p-2 text-xs sm:flex-row">
      <div><span className="capitalize">{mail.purpose} · {mail.outcome}</span>
        {mail.reason && <p className="mt-1 text-muted-foreground">{mail.reason}</p>}
        {mail.delivery && <p role="status" className="mt-1">
          {mail.delivery.status && `Provider result: ${mail.delivery.status.replaceAll("_", " ")}${mail.delivery.status === "delivered" ? " (not proof of inbox placement)" : ""}`}
          {mail.delivery.error && <span className="block">{mail.delivery.error}</span>}
          <span className="block text-muted-foreground">Checked {formatMailTime(mail.delivery.checkedAt)}</span>
        </p>}
      </div>
      <span className="shrink-0 text-muted-foreground" data-testid="mail-event-time">{formatMailTime(mail.created_at)}</span>
    </li>)}</ul>;
}
