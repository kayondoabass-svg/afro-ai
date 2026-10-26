import { displayField, safeTitle } from "./programme-types";

export default function ApplicationDetails({ application }: { application: Record<string, unknown> | null | undefined }) {
  if (!application) return <p className="py-3 text-sm text-muted-foreground">Submitted application details are unavailable.</p>;
  const entries = Object.entries(application);
  if (!entries.length) return <p className="py-3 text-sm text-muted-foreground">No submitted application fields were returned.</p>;
  return <dl className="grid gap-3 sm:grid-cols-2">
    {entries.map(([key]) => <div key={key} className="min-w-0 border-b pb-2 last:border-b-0">
      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">{safeTitle(key)}</dt>
      <dd className="mt-1 break-words text-sm">{displayField(application, key)}</dd>
    </div>)}
  </dl>;
}
